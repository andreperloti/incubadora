import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, getWahaContactName, getWahaChatName, parsePhoneFromContactName, getWahaContactAvatar, getWahaContactPhone } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

// Payload do WAHA ao receber uma mensagem:
// { event: "message", session: "nome-da-sessao", payload: { id, from, body, timestamp, notifyName, fromMe, ... } }

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || ''

// Dispara o n8n de forma assíncrona (fire-and-forget) para processar respostas automáticas
function notifyN8n(payload: object) {
  if (!N8N_WEBHOOK_URL) return
  fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('[n8n] Falha ao notificar:', err))
}

export async function POST(req: NextRequest) {
  // Valida o secret na query string
  const secret = req.nextUrl.searchParams.get('secret') ?? ''
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Ignora eventos que não sejam mensagens recebidas
  if (body.event !== 'message') {
    return NextResponse.json({ status: 'ignored' })
  }

  const sessionName: string = body.session
  const payload = body.payload

  // Ignora mensagens enviadas por nós mesmos, de grupos, newsletters ou broadcasts
  const rawFrom: string = payload?.from ?? ''
  if (
    payload?.fromMe ||
    rawFrom.endsWith('@g.us') ||
    rawFrom.endsWith('@newsletter') ||
    rawFrom.endsWith('@broadcast')
  ) {
    return NextResponse.json({ status: 'ignored' })
  }

  // Para @c.us: usa apenas o número. Para @lid: mantém o ID completo como identificador (necessário para envio de resposta).
  const phone = rawFrom.endsWith('@c.us') ? rawFrom.replace('@c.us', '') : rawFrom
  const notifyName: string = payload?.notifyName || payload?.pushName || ''
  const text: string = payload?.body ?? ''
  const waMessageId: string = payload?.id ?? ''
  // Timestamp real da mensagem no WhatsApp (Unix segundos → Date)
  const waTimestamp: Date = payload?.timestamp
    ? new Date(payload.timestamp * 1000)
    : new Date()

  if (!phone || !text) {
    return NextResponse.json({ status: 'ignored' })
  }

  // Encontra o negócio pela sessão WAHA
  const business = await prisma.business.findFirst({
    where: { wahaSession: sessionName },
  })

  if (!business) {
    console.error(`Business não encontrado para sessão WAHA: ${sessionName}`)
    return NextResponse.json({ status: 'ok' })
  }

  // Resolve nome do contato:
  // 1. notifyName/pushName do payload
  // 2. Para @c.us: lookup no WAHA contacts
  // 3. Para @lid: busca nome na lista de chats do WAHA
  // 4. Fallback: phone
  let customerName = notifyName
  if (!customerName) {
    if (rawFrom.endsWith('@lid')) {
      const chatName = await getWahaChatName(sessionName, rawFrom)
      if (chatName) {
        customerName = chatName
      }
    } else {
      customerName = (await getWahaContactName(sessionName, phone)) || phone
    }
  }
  if (!customerName) customerName = phone

  return handleMessage({
    business, sessionName, phone,
    rawChatId: rawFrom, customerName,
    text, waMessageId, waTimestamp,
  })
}

async function handleMessage({
  business, sessionName, phone, rawChatId, customerName, text, waMessageId, waTimestamp,
}: {
  business: { id: number; name: string }
  sessionName: string
  phone: string
  rawChatId: string
  customerName: string
  text: string
  waMessageId: string
  waTimestamp: Date
}) {
  // Monta lista de aliases de telefone para o lookup.
  // Se for @lid, tenta extrair o número real do customerName (ex: "+55 16 99119-8729" → "5516991198729")
  // para encontrar conversas anteriores que usavam o formato @c.us.
  const phoneAliases = Array.from(new Set(
    [phone, rawChatId, parsePhoneFromContactName(customerName)].filter(Boolean) as string[]
  ))

  // Busca conversa existente: primeiro aberta, depois resolvida (para reabrir)
  const activeConversations = await prisma.conversation.findMany({
    where: {
      businessId: business.id,
      customerPhone: { in: phoneAliases },
      status: { not: 'resolved' },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Se houver duplicatas abertas, resolve as mais antigas automaticamente
  if (activeConversations.length > 1) {
    const idsToResolve = activeConversations.slice(1).map((c) => c.id)
    await prisma.conversation.updateMany({
      where: { id: { in: idsToResolve } },
      data: { status: 'resolved', resolvedAt: new Date() },
    })
  }

  // Se não tem conversa aberta, tenta encontrar a mais recente resolvida para reabrir
  let existing = activeConversations[0] ?? null
  if (!existing) {
    existing = await prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        customerPhone: { in: phoneAliases },
        status: 'resolved',
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  let isNew = !existing
  let optionSelectedForReply: number | null = null
  let conversation: any = existing

  // Busca foto de perfil e número real em paralelo
  const [avatarUrl, realPhone] = await Promise.all([
    getWahaContactAvatar(sessionName, phone),
    getWahaContactPhone(sessionName, rawChatId),
  ])

  if (isNew) {
    conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerPhone: phone,
        customerName,
        customerAvatar: avatarUrl,
        customerRealPhone: realPhone,
        status: 'waiting_menu',
        unreadCount: 1,
        lastCustomerMessageAt: waTimestamp,
        customerWaitingSince: waTimestamp,
      },
    })
  } else {
    const wasResolved = existing!.status === 'resolved'
    const wasWaitingMenu = existing!.status === 'waiting_menu'
    const isOptionSelection = wasWaitingMenu && ['1', '2', '3', '4'].includes(text.trim())
    const optionSelected = isOptionSelection ? parseInt(text.trim()) : (wasResolved ? null : existing!.optionSelected)

    if (isOptionSelection) {
      optionSelectedForReply = optionSelected
    }

    // Determina o novo status
    let newStatus = existing!.status
    if (wasResolved) {
      newStatus = 'waiting_menu'
      isNew = true // dispara menu de boas-vindas
    } else if (wasWaitingMenu) {
      newStatus = isOptionSelection ? 'in_queue' : 'waiting_menu'
    }

    const updateData: any = {
      lastCustomerMessageAt: waTimestamp,
      status: newStatus,
      optionSelected,
      customerName,
      customerWaitingSince: wasResolved ? waTimestamp : (existing!.customerWaitingSince ?? waTimestamp),
      resolvedAt: wasResolved ? null : existing!.resolvedAt,
      unreadCount: wasResolved ? 1 : { increment: 1 },
    }
    if (avatarUrl && !existing!.customerAvatar) updateData.customerAvatar = avatarUrl
    if (realPhone && !existing!.customerRealPhone) updateData.customerRealPhone = realPhone

    await prisma.conversation.update({
      where: { id: existing!.id },
      data: updateData,
    })
    conversation = { ...existing!, optionSelected, customerAvatar: avatarUrl || existing!.customerAvatar }
  }

  // ── 1. Salva a mensagem recebida com o timestamp real do WhatsApp ──
  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'in',
      content: text,
      waMessageId,
      sentAt: waTimestamp,
    },
    include: { senderUser: { select: { id: true, name: true } } },
  })

  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  // ── 2. Notifica o n8n para processar respostas automáticas ──
  // chatId = identificador WAHA correto (@c.us ou @lid) para usar no sendText
  notifyN8n({
    conversationId: conversation.id,
    businessId: business.id,
    businessName: business.name,
    session: sessionName,
    phone,
    chatId: rawChatId,
    customerName,
    text,
    isNew,
    optionSelected: optionSelectedForReply,
  })

  return NextResponse.json({ status: 'ok' })
}
