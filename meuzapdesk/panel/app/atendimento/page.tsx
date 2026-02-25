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

  const include = {
    assignedUser: { select: { id: true, name: true } },
    messages: { orderBy: { sentAt: 'desc' as const }, take: 1 },
    alerts: true,
  }

  // Conversas abertas — ordena por tempo de espera por resposta humana (mais antiga primeiro)
  const active = await prisma.conversation.findMany({
    where: {
      businessId,
      status: { in: ['in_queue', 'in_progress', 'waiting_menu'] },
    },
    include,
    orderBy: { customerWaitingSince: 'asc' },
  })

  // Últimas 10 conversas resolvidas (histórico recente)
  const recent = await prisma.conversation.findMany({
    where: { businessId, status: 'resolved' },
    include,
    orderBy: { lastCustomerMessageAt: 'desc' },
    take: 20,
  })

  return (
    <AtendimentoClient
      conversations={JSON.parse(JSON.stringify(active))}
      recentConversations={JSON.parse(JSON.stringify(recent))}
      session={session}
    />
  )
}
