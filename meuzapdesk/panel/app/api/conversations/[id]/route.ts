import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  return NextResponse.json(conversation)
}
