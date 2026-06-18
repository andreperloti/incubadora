import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSessionBusinessId } from '@/lib/auth'
import { prisma } from '@/lib/db'

const PAGE_SIZE = 20

function normalizePhone(phone: string): string {
  return phone.replace(/@\S+$/, '').replace(/\D/g, '')
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = getSessionBusinessId(session)
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const skip = parseInt(req.nextUrl.searchParams.get('skip') ?? '0', 10) || 0

  const include = {
    assignedUser: { select: { id: true, name: true } },
    messages: { orderBy: { sentAt: 'desc' as const }, take: 1 },
    alerts: true,
  }

  const active = await prisma.conversation.findMany({
    where: { businessId, status: { in: ['in_queue', 'in_progress', 'waiting_menu'] } },
    select: { customerPhone: true },
  })

  const activePhones = active.map((c) => c.customerPhone)

  // Busca candidatas suficientes para obter PAGE_SIZE únicas após dedup
  // Usa um multiplicador generoso para cobrir duplicatas de número
  const FETCH_SIZE = (skip + PAGE_SIZE) * 3 + 30
  const recentRaw = await prisma.conversation.findMany({
    where: {
      businessId,
      status: 'resolved',
      customerPhone: activePhones.length > 0 ? { notIn: activePhones } : undefined,
    },
    include,
    orderBy: { lastCustomerMessageAt: 'desc' },
    take: FETCH_SIZE,
  })

  const seenNormalized = new Set<string>()
  const allUnique = recentRaw.filter((c) => {
    const phoneNorm = normalizePhone(c.customerPhone)
    if (seenNormalized.has(phoneNorm)) return false
    seenNormalized.add(phoneNorm)
    return true
  })

  const page = allUnique.slice(skip, skip + PAGE_SIZE)
  const hasMore = allUnique.length > skip + PAGE_SIZE

  return NextResponse.json({ conversations: page, hasMore })
}
