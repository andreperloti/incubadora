import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, getWahaContactName } from '@/lib/whatsapp'
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

  const phone = rawFrom.replace('@c.us', '')
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

  // Resolve nome do contato: usa notifyName do payload ou busca no WAHA
  const customerName =
    notifyName ||
    (await getWahaContactName(sessionName, phone)) ||
    phone

  // Verifica se já existe conversa aberta
  const existing = await prisma.conversation.findFirst({
    where: {
      businessId: business.id,
      customerPhone: phone,
      status: { not: 'resolved' },
    },
    orderBy: { createdAt: 'desc' },
  })

  const isNew = !existing
  let optionSelectedForReply: number | null = null

  let conversation: typeof existing & {} = existing as any

  if (isNew) {
    conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerPhone: phone,
        customerName,
        status: 'waiting_menu',
        lastCustomerMessageAt: waTimestamp,
        customerWaitingSince: waTimestamp,
      },
    })
  } else {
    const wasWaitingMenu = existing!.status === 'waiting_menu'
    const isOptionSelection = wasWaitingMenu && ['1', '2', '3', '4'].includes(text.trim())
    const optionSelected = isOptionSelection ? parseInt(text.trim()) : existing!.optionSelected

    if (isOptionSelection) {
      optionSelectedForReply = optionSelected
    }

    await prisma.conversation.update({
      where: { id: existing!.id },
      data: {
        lastCustomerMessageAt: waTimestamp,
        status: wasWaitingMenu ? 'in_queue' : existing!.status,
        optionSelected,
        customerName,
        customerWaitingSince: (existing as any).customerWaitingSince ?? waTimestamp,
      },
    })
    conversation = { ...existing!, optionSelected } as any
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
  notifyN8n({
    conversationId: conversation.id,
    businessId: business.id,
    businessName: business.name,
    session: sessionName,
    phone,
    customerName,
    text,
    isNew,
    optionSelected: optionSelectedForReply,
  })

  return NextResponse.json({ status: 'ok' })
}
