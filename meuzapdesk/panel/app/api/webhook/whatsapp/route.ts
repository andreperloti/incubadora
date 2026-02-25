import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, sendWhatsAppMessage, buildMenuMessage, getWahaContactName } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

// Payload do WAHA ao receber uma mensagem:
// { event: "message", session: "nome-da-sessao", payload: { id, from, body, notifyName, fromMe, ... } }

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

  const rawPhone: string = rawFrom
  const phone = rawPhone.replace('@c.us', '')
  const notifyName: string = payload?.notifyName || payload?.pushName || ''
  const text: string = payload?.body ?? ''
  const waMessageId: string = payload?.id ?? ''

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
  let conversation = await prisma.conversation.findFirst({
    where: {
      businessId: business.id,
      customerPhone: phone,
      status: { not: 'resolved' },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!conversation) {
    // Nova conversa — cria e envia menu
    conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerPhone: phone,
        customerName,
        status: 'waiting_menu',
        lastCustomerMessageAt: new Date(),
      },
    })

    await sendWhatsAppMessage({
      session: sessionName,
      to: phone,
      message: buildMenuMessage(business.name),
    })
  } else {
    // Conversa existente — detecta seleção de opção ou mensagem normal
    let optionSelected = conversation.optionSelected
    if (conversation.status === 'waiting_menu' && ['1', '2', '3', '4'].includes(text.trim())) {
      optionSelected = parseInt(text.trim())
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastCustomerMessageAt: new Date(),
        status: conversation.status === 'waiting_menu' ? 'in_queue' : conversation.status,
        optionSelected,
        customerName,
      },
    })
  }

  // Salva a mensagem recebida
  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'in',
      content: text,
      waMessageId,
    },
    include: { senderUser: { select: { id: true, name: true } } },
  })

  // Notifica painel via SSE
  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  return NextResponse.json({ status: 'ok' })
}
