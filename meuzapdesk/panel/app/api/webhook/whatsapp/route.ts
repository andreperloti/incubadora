import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookToken } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage, buildMenuMessage } from '@/lib/whatsapp'
import { broadcastToBusinessClients } from '@/lib/sse'

// Verificação do webhook pelo Meta
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && verifyWebhookToken(token || '')) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// Recebimento de mensagens
export async function POST(req: NextRequest) {
  const body = await req.json()

  const entry = body?.entry?.[0]?.changes?.[0]?.value
  const message = entry?.messages?.[0]

  // Ignora notificações de status (delivered, read, etc.)
  if (!message) {
    return NextResponse.json({ status: 'ok' })
  }

  const phone = message.from
  const customerName = entry.contacts?.[0]?.profile?.name || phone
  const text = message.text?.body || ''
  const waMessageId = message.id
  const phoneNumberId = entry.metadata?.phone_number_id

  // Encontra o negócio pelo phoneNumberId
  const business = await prisma.business.findFirst({
    where: { waPhoneNumberId: phoneNumberId },
  })

  if (!business) {
    console.error(`Business não encontrado para phoneNumberId: ${phoneNumberId}`)
    return NextResponse.json({ status: 'ok' })
  }

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
      to: phone,
      message: buildMenuMessage(business.name),
      phoneNumberId: business.waPhoneNumberId,
      accessToken: business.waApiToken,
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
