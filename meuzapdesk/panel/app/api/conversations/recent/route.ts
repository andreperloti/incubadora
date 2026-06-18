import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSessionBusinessId } from '@/lib/auth'
import { prisma } from '@/lib/db'

function normalizePhone(phone: string): string {
  return phone.replace(/@\S+$/, '').replace(/\D/g, '')
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = getSessionBusinessId(session)
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const include = {
    assignedUser: { select: { id: true, name: true } },
    messages: { orderBy: { sentAt: 'desc' as const }, take: 1 },
    alerts: true,
  }

  // Busca telefones ativos para exclusão via SQL (evita carregar 100 resolvidas só pra filtrar)
  const active = await prisma.conversation.findMany({
    where: { businessId, status: { in: ['in_queue', 'in_progress', 'waiting_menu'] } },
    select: { customerPhone: true },
  })

  const activePhones = active.map((c) => c.customerPhone)

  // Exclui diretamente no banco conversas cujo telefone está ativo
  // Carrega apenas 30 candidatas (precisamos de 20 únicas após dedup de número)
  const recentRaw = await prisma.conversation.findMany({
    where: {
      businessId,
      status: 'resolved',
      customerPhone: activePhones.length > 0 ? { notIn: activePhones } : undefined,
    },
    include,
    orderBy: { lastCustomerMessageAt: 'desc' },
    take: 30,
  })

  // Dedup em memória apenas para remover variações do mesmo número dentro dos resultados
  const seenNormalized = new Set<string>()
  const recent = recentRaw.filter((c) => {
    const phoneNorm = normalizePhone(c.customerPhone)
    if (seenNormalized.has(phoneNorm)) return false
    seenNormalized.add(phoneNorm)
    return true
  }).slice(0, 20)

  return NextResponse.json(recent)
}
