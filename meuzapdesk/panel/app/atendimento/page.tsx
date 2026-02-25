import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AtendimentoClient } from './AtendimentoClient'

export const dynamic = 'force-dynamic'

export default async function AtendimentoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

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
    orderBy: { lastCustomerMessageAt: 'asc' },
  })

  return (
    <AtendimentoClient
      conversations={JSON.parse(JSON.stringify(conversations))}
      session={session}
    />
  )
}
