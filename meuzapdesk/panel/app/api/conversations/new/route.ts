import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage, buildSignedMessage, toChatId } from '@/lib/whatsapp'
import { broadcastToBusinessClients } from '@/lib/sse'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const user = session.user as any
  const businessId = parseInt(user.businessId)
  const userId = parseInt(user.id)

  const { phone, message } = await req.json()
  if (!phone?.trim()) {
    return NextResponse.json({ error: 'Número de telefone obrigatório' }, { status: 400 })
  }

  const rawDigits = phone.replace(/\D/g, '')
  // Normaliza DDI Brasil: se vier só DDD+número (10-11 dígitos), adiciona 55
  const customerPhone = (rawDigits.length === 10 || rawDigits.length === 11)
    ? '55' + rawDigits
    : rawDigits
  if (customerPhone.length < 12 || customerPhone.length > 15) {
    return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business?.wahaSession) {
    return NextResponse.json({ error: 'Sessão WhatsApp não configurada' }, { status: 400 })
  }

  // Reutiliza conversa existente ou cria nova
  let conversation = await prisma.conversation.findFirst({
    where: { businessId, customerPhone },
    orderBy: { createdAt: 'desc' },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        businessId,
        customerPhone,
        customerName: customerPhone,
        status: 'in_progress',
        assignedUserId: userId,
        queuedAt: new Date(),
      },
    })
  }

  // Envia mensagem se fornecida
  if (message?.trim()) {
    const signedMessage = buildSignedMessage(user.name, message.trim())

    const waResult = await sendWhatsAppMessage({
      session: business.wahaSession,
      to: customerPhone,
      message: signedMessage,
    })

    if (!waResult.success) {
      return NextResponse.json({ error: `Erro ao enviar: ${waResult.error}` }, { status: 502 })
    }

    const savedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'out',
        content: signedMessage,
        senderUserId: userId,
        waMessageId: waResult.messageId,
      },
      include: { senderUser: { select: { id: true, name: true } } },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'in_progress',
        assignedUserId: userId,
        customerWaitingSince: null,
        unreadCount: 0,
        lastCustomerMessageAt: new Date(),
      },
    })

    broadcastToBusinessClients(String(businessId), {
      type: 'new_message',
      conversationId: conversation.id,
      message: savedMessage,
    })
  } else {
    broadcastToBusinessClients(String(businessId), {
      type: 'new_message',
      conversationId: conversation.id,
    })
  }

  return NextResponse.json({ conversation })
}
