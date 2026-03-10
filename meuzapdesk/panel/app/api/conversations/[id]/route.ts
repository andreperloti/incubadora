import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getWahaContactAvatar, getWahaContactPhone } from '@/lib/whatsapp'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = parseInt((session.user as any).businessId)
  const conversationId = parseInt(params.id)

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: {
      messages: {
        orderBy: { sentAt: 'asc' },
        include: {
          senderUser: { select: { id: true, name: true } },
        },
      },
      assignedUser: { select: { id: true, name: true } },
      alerts: true,
      business: { select: { wahaSession: true } },
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  // Busca avatar e número real se ainda não tiver
  const [newAvatar, newRealPhone] = await Promise.all([
    conversation.customerAvatar ? Promise.resolve(null) : getWahaContactAvatar(conversation.business.wahaSession, conversation.customerPhone),
    conversation.customerRealPhone ? Promise.resolve(null) : getWahaContactPhone(conversation.business.wahaSession, conversation.customerPhone),
  ])

  // Zera não lidas, salva avatar e número real se encontrados
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      unreadCount: 0,
      ...(newAvatar ? { customerAvatar: newAvatar } : {}),
      ...(newRealPhone ? { customerRealPhone: newRealPhone } : {}),
    },
  })

  const { business: _b, ...convData } = conversation

  return NextResponse.json({
    ...convData,
    unreadCount: 0,
    customerAvatar: newAvatar ?? conversation.customerAvatar,
    customerRealPhone: newRealPhone ?? conversation.customerRealPhone,
  })
}
