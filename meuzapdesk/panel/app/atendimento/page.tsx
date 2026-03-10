import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AtendimentoClient } from './AtendimentoClient'

export const dynamic = 'force-dynamic'

// Normaliza phone para comparação: remove @c.us/@lid e não-dígitos
// Ex: "54919830708295@lid" → "54919830708295", "+55 16 99119-8729" → "5516991198729"
function normalizePhone(phone: string): string {
  return phone.replace(/@\S+$/, '').replace(/\D/g, '')
}

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

  // Normaliza todos os phones ativos (e nomes quando parecem telefone)
  // para lidar com o mesmo contato aparecendo como @c.us e @lid
  const activeNormalized = new Set<string>()
  for (const c of active) {
    activeNormalized.add(normalizePhone(c.customerPhone))
    if (c.customerName) {
      const n = normalizePhone(c.customerName)
      if (n.length >= 10) activeNormalized.add(n)
    }
  }

  // Últimas conversas resolvidas dos últimos 7 dias (histórico recente)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

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

  const seenNormalized = new Set<string>()
  const recent = recentRaw.filter((c) => {
    const phoneNorm = normalizePhone(c.customerPhone)
    const nameNorm = c.customerName ? normalizePhone(c.customerName) : null

    // Exclui se já tem conversa ativa com esse número
    if (activeNormalized.has(phoneNorm)) return false
    if (nameNorm && nameNorm.length >= 10 && activeNormalized.has(nameNorm)) return false

    // Deduplica: mantém apenas a mais recente por número normalizado
    if (seenNormalized.has(phoneNorm)) return false
    if (nameNorm && nameNorm.length >= 10 && seenNormalized.has(nameNorm)) return false

    seenNormalized.add(phoneNorm)
    if (nameNorm && nameNorm.length >= 10) seenNormalized.add(nameNorm)
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
