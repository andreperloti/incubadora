import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function normalizePhone(phone: string): string {
  return phone.replace(/@\S+$/, '').replace(/\D/g, '')
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = parseInt((session.user as any).businessId)

  const include = {
    assignedUser: { select: { id: true, name: true } },
    messages: { orderBy: { sentAt: 'desc' as const }, take: 1 },
    alerts: true,
  }

  const active = await prisma.conversation.findMany({
    where: { businessId, status: { in: ['in_queue', 'in_progress', 'waiting_menu'] } },
    select: { customerPhone: true, customerName: true },
  })

  const activeNormalized = new Set<string>()
  for (const c of active) {
    activeNormalized.add(normalizePhone(c.customerPhone))
    if (c.customerName) {
      const n = normalizePhone(c.customerName)
      if (n.length >= 10) activeNormalized.add(n)
    }
  }

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

    if (activeNormalized.has(phoneNorm)) return false
    if (nameNorm && nameNorm.length >= 10 && activeNormalized.has(nameNorm)) return false

    if (seenNormalized.has(phoneNorm)) return false
    if (nameNorm && nameNorm.length >= 10 && seenNormalized.has(nameNorm)) return false

    seenNormalized.add(phoneNorm)
    if (nameNorm && nameNorm.length >= 10) seenNormalized.add(nameNorm)
    return true
  }).slice(0, 20)

  return NextResponse.json(recent)
}
