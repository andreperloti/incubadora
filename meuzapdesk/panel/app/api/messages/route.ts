import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage, buildSignedMessage } from '@/lib/whatsapp'
import { broadcastToBusinessClients } from '@/lib/sse'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { conversationId, message } = await req.json()

  if (!conversationId || !message?.trim()) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const user = session.user as any
  const businessId = parseInt(user.businessId)
  const userId = parseInt(user.id)

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: { business: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  const signedMessage = buildSignedMessage(user.name, message.trim())

  // Envia para o WhatsApp
  const waResult = await sendWhatsAppMessage({
    to: conversation.customerPhone,
    message: signedMessage,
    accessToken: conversation.business.waApiToken,
    phoneNumberId: conversation.business.waPhoneNumberId,
  })

  if (!waResult.success) {
    return NextResponse.json({ error: `Erro ao enviar: ${waResult.error}` }, { status: 502 })
  }

  // Salva no banco
  const savedMessage = await prisma.message.create({
    data: {
      conversationId,
      direction: 'out',
      content: signedMessage,
      senderUserId: userId,
      waMessageId: waResult.messageId,
    },
    include: {
      senderUser: { select: { id: true, name: true } },
    },
  })

  // Atualiza status da conversa
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'in_progress',
      assignedUserId: userId,
    },
  })

  // Notifica outros clientes conectados via SSE
  broadcastToBusinessClients(String(businessId), {
    type: 'new_message',
    conversationId,
    message: savedMessage,
  })

  return NextResponse.json({ success: true, message: savedMessage })
}
