import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getWahaSession } from '@/lib/whatsapp'
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
    orderBy: { queuedAt: 'asc' },
  })

  // Normaliza todos os phones ativos (e nomes quando parecem telefone)
  // para lidar com o mesmo contato aparecendo como @c.us e @lid
  const activeNormalized = new Set<string>()
  for (const c of active) {
    activeNormalized.add(normalizePhone(c.customerPhone))
    if ((c as any).customerRealPhone) activeNormalized.add(normalizePhone((c as any).customerRealPhone))
    if (c.customerName) {
      const n = normalizePhone(c.customerName)
      if (n.length >= 10) activeNormalized.add(n)
    }
  }

  const recentRaw = await prisma.conversation.findMany({
    where: {
      businessId,
      status: 'resolved',
    },
    include,
    orderBy: { lastCustomerMessageAt: 'desc' },
    take: 100,
  })

  const seenNormalized = new Set<string>()
  const recent = recentRaw.filter((c) => {
    const phoneNorm = normalizePhone(c.customerPhone)
    const realPhoneNorm = (c as any).customerRealPhone ? normalizePhone((c as any).customerRealPhone) : null
    const nameNorm = c.customerName ? normalizePhone(c.customerName) : null

    // Exclui se já tem conversa ativa com esse número (checa phone e realPhone)
    if (activeNormalized.has(phoneNorm)) return false
    if (realPhoneNorm && activeNormalized.has(realPhoneNorm)) return false
    if (nameNorm && nameNorm.length >= 10 && activeNormalized.has(nameNorm)) return false

    // Deduplica: mantém apenas a mais recente por número normalizado
    if (seenNormalized.has(phoneNorm)) return false
    if (realPhoneNorm && seenNormalized.has(realPhoneNorm)) return false
    if (nameNorm && nameNorm.length >= 10 && seenNormalized.has(nameNorm)) return false

    seenNormalized.add(phoneNorm)
    if (realPhoneNorm) seenNormalized.add(realPhoneNorm)
    if (nameNorm && nameNorm.length >= 10) seenNormalized.add(nameNorm)
    return true
  }).slice(0, 20)

  // Opções do menu raiz — usadas como filtros na sidebar
  const rootMenu = await prisma.botMenu.findFirst({
    where: { businessId, isRoot: true },
    include: { options: { orderBy: { order: 'asc' } } },
  })
  const menuFilters = rootMenu?.options.map((o) => ({ order: o.order, label: o.label })) ?? []

  // Status da sessão WhatsApp
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { wahaSession: true },
  })
  let wahaConnected = false
  if (business?.wahaSession) {
    const wahaStatus = await getWahaSession(business.wahaSession)
    wahaConnected = wahaStatus?.status === 'WORKING'
  }

  return (
    <AtendimentoClient
      conversations={JSON.parse(JSON.stringify(active))}
      recentConversations={JSON.parse(JSON.stringify(recent))}
      menuFilters={menuFilters}
      session={session}
      wahaConnected={wahaConnected}
    />
  )
}
