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

  // Últimas conversas resolvidas dos últimos 7 dias (histórico recente)
  // Deduplica por customerPhone mantendo apenas a mais recente por número,
  // e exclui números que já têm conversa ativa na fila.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const activePhones = new Set(active.map((c) => c.customerPhone))

  const recentRaw = await prisma.conversation.findMany({
    where: {
      businessId,
      status: 'resolved',
      lastCustomerMessageAt: { gte: sevenDaysAgo },
    },
    include,
    orderBy: { lastCustomerMessageAt: 'desc' },
    take: 100,
  })

  const seenPhones = new Set<string>()
  const recent = recentRaw.filter((c) => {
    if (activePhones.has(c.customerPhone)) return false
    if (seenPhones.has(c.customerPhone)) return false
    seenPhones.add(c.customerPhone)
    return true
  }).slice(0, 20)

  return (
    <AtendimentoClient
      conversations={JSON.parse(JSON.stringify(active))}
      recentConversations={JSON.parse(JSON.stringify(recent))}
      session={session}
    />
  )
}
