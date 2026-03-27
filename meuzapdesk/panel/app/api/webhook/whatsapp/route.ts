import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, getWahaContactName, getWahaChatName, parsePhoneFromContactName, getWahaContactAvatar, getWahaContactPhone, sendMenuButtons, buildMenuMessage, buildOptionAutoReply, sendWhatsAppMessage } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

// Payload do WAHA ao receber uma mensagem:
// { event: "message", session: "nome-da-sessao", payload: { id, from, body, timestamp, notifyName, fromMe, ... } }


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

  // Botão interativo clicado (WAHA envia como buttons_response ou interactive)
  const buttonId: string | null =
    (payload?.type === 'buttons_response' || payload?.type === 'interactive')
      ? (payload?.selectedButtonId ?? payload?.selectedId ?? payload?.body ?? null)
      : null

  if (!phone || (!text && !buttonId)) {
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
    text, buttonId, waMessageId, waTimestamp,
  })
}

function saveBotMessage(conversationId: number, content: string, businessId: number, waMessageId?: string | null) {
  prisma.message.create({
    data: { conversationId, direction: 'out', content, senderUserId: null, waMessageId: waMessageId ?? null },
    include: { senderUser: { select: { id: true, name: true } } },
  })
  .then((msg) => {
    broadcastToBusinessClients(String(businessId), { type: 'new_message', conversationId, message: msg })
  })
  .catch((err) => console.error('[bot-save]', err))
}

async function handleMessage({
  business, sessionName, phone, rawChatId, customerName, text, buttonId, waMessageId, waTimestamp,
}: {
  business: { id: number; name: string }
  sessionName: string
  phone: string
  rawChatId: string
  customerName: string
  text: string
  buttonId: string | null
  waMessageId: string
  waTimestamp: Date
}) {
  // Resolve o número real antes do lookup para garantir match quando o contato
  // chega como @lid mas a conversa foi criada/importada com o número @c.us.
  // Para @c.us retorna imediatamente (sem chamada HTTP); para @lid consulta o WAHA.
  const realPhone = await getWahaContactPhone(sessionName, rawChatId)

  // Monta lista de aliases de telefone para o lookup.
  const phoneAliases = Array.from(new Set(
    [phone, rawChatId, realPhone, parsePhoneFromContactName(customerName)].filter(Boolean) as string[]
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
  let existing: typeof activeConversations[0] | null = activeConversations[0] ?? null
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

  // Busca foto de perfil (realPhone já foi resolvido acima)
  const avatarUrl = await getWahaContactAvatar(sessionName, phone)

  let newStatus: string = existing?.status ?? 'waiting_menu'

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
    const selectedRaw = buttonId ?? text.trim()
    const isOptionSelection = wasWaitingMenu && ['1', '2', '3', '4'].includes(selectedRaw)
    const optionSelected = isOptionSelection ? parseInt(selectedRaw) : (wasResolved ? null : existing!.optionSelected)

    if (isOptionSelection) {
      optionSelectedForReply = optionSelected
    }

    // Determina o novo status
    newStatus = existing!.status
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

  // ── 1. Salva a mensagem — idempotente: verifica duplicata pelo waMessageId antes de inserir
  // (waMessageId tem índice único parcial no DB mas não é @unique no schema Prisma)
  let savedMessage: any
  if (waMessageId) {
    const existing = await prisma.message.findFirst({
      where: { waMessageId },
      include: { senderUser: { select: { id: true, name: true } } },
    })
    if (existing) {
      // Mensagem já salva (replay do histórico WAHA) — não duplica
      return NextResponse.json({ status: 'ok' })
    }
    savedMessage = await prisma.message.create({
      data: { conversationId: conversation.id, direction: 'in', content: text || buttonId || '', waMessageId, sentAt: waTimestamp },
      include: { senderUser: { select: { id: true, name: true } } },
    })
  } else {
    savedMessage = await prisma.message.create({
      data: { conversationId: conversation.id, direction: 'in', content: text || buttonId || '', sentAt: waTimestamp },
      include: { senderUser: { select: { id: true, name: true } } },
    })
  }

  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  // ── 2. Bot: envia menu e auto-reply diretamente via WAHA ─────────────────
  const menuText = buildMenuMessage(business.name)

  if (isNew) {
    sendMenuButtons(sessionName, rawChatId, business.name)
      .then((r) => {
        saveBotMessage(conversation.id, menuText, business.id, r.messageId)
      })
      .catch(() => {})
  }

  if (optionSelectedForReply !== null) {
    const reply = buildOptionAutoReply(optionSelectedForReply)
    if (reply) {
      sendWhatsAppMessage({ session: sessionName, to: rawChatId, message: reply })
        .then(() => saveBotMessage(conversation.id, reply, business.id))
        .catch(() => {})
    }
  }

  // Re-envia menu se ainda em waiting_menu sem opção selecionada (texto livre)
  if (!isNew && optionSelectedForReply === null && newStatus === 'waiting_menu') {
    sendMenuButtons(sessionName, rawChatId, business.name)
      .then((r) => {
        saveBotMessage(conversation.id, menuText, business.id, r.messageId)
      })
      .catch(() => {})
  }

  return NextResponse.json({ status: 'ok' })
}
