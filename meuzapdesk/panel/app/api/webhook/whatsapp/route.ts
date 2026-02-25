import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, sendWhatsAppMessage, buildMenuMessage, buildOptionAutoReply, getWahaContactName } from '@/lib/whatsapp'
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

  // Flags para decidir o que enviar após salvar a mensagem do cliente
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
        // Marca desde quando o cliente está esperando resposta humana
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
        // Preserva a data original se já estava esperando; inicia nova espera se humano já respondeu
        customerWaitingSince: (existing as any).customerWaitingSince ?? waTimestamp,
      },
    })
    conversation = { ...existing!, optionSelected } as any
  }

  // ── 1. Salva a mensagem recebida PRIMEIRO com o timestamp real do WhatsApp ──
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

  // ── 2. Envia respostas automáticas DEPOIS (sentAt = now() > waTimestamp) ──

  if (isNew) {
    // Nova conversa — envia menu de boas-vindas
    const menuText = buildMenuMessage(business.name)
    const menuResult = await sendWhatsAppMessage({
      session: sessionName,
      to: phone,
      message: menuText,
    })

    const menuMsg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'out',
        content: menuText,
        waMessageId: menuResult.messageId ?? null,
      },
      include: { senderUser: { select: { id: true, name: true } } },
    })

    broadcastToBusinessClients(String(business.id), {
      type: 'new_message',
      conversationId: conversation.id,
      message: menuMsg,
    })
  } else if (optionSelectedForReply !== null) {
    // Opção selecionada — envia auto-resposta com o setor
    const autoReplyText = buildOptionAutoReply(optionSelectedForReply)
    if (autoReplyText) {
      const autoResult = await sendWhatsAppMessage({
        session: sessionName,
        to: phone,
        message: autoReplyText,
      })

      const autoMsg = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'out',
          content: autoReplyText,
          waMessageId: autoResult.messageId ?? null,
        },
        include: { senderUser: { select: { id: true, name: true } } },
      })

      broadcastToBusinessClients(String(business.id), {
        type: 'new_message',
        conversationId: conversation.id,
        message: autoMsg,
      })
    }
  }

  return NextResponse.json({ status: 'ok' })
}
