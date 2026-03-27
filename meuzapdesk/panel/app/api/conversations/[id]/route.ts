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

  const { business: _b, ...convData } = conversation

  // Zera não lidas imediatamente (não bloqueia na resposta)
  prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  }).catch(() => {})

  // Busca avatar/telefone em background se ainda não tiver (fire-and-forget)
  if (!conversation.customerAvatar || !conversation.customerRealPhone) {
    Promise.all([
      conversation.customerAvatar ? Promise.resolve(null) : getWahaContactAvatar(conversation.business.wahaSession, conversation.customerPhone),
      conversation.customerRealPhone ? Promise.resolve(null) : getWahaContactPhone(conversation.business.wahaSession, conversation.customerPhone),
    ]).then(([newAvatar, newRealPhone]) => {
      if (newAvatar || newRealPhone) {
        prisma.conversation.update({
          where: { id: conversationId },
          data: {
            ...(newAvatar ? { customerAvatar: newAvatar } : {}),
            ...(newRealPhone ? { customerRealPhone: newRealPhone } : {}),
          },
        }).catch(() => {})
      }
    }).catch(() => {})
  }

  return NextResponse.json({
    ...convData,
    unreadCount: 0,
  })
}
