import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = parseInt((session.user as any).businessId)

  const conversations = await prisma.conversation.findMany({
    where: {
      businessId,
      status: { in: ['in_queue', 'in_progress', 'waiting_menu'] },
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      alerts: true,
    },
    orderBy: { customerWaitingSince: 'asc' },
  })

  return NextResponse.json(conversations)
}
