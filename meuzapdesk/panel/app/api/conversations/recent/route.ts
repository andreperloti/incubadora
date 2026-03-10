import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
    select: { customerPhone: true },
  })

  const activePhones = new Set(active.map((c) => c.customerPhone))
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

  const seenPhones = new Set<string>()
  const recent = recentRaw.filter((c) => {
    if (activePhones.has(c.customerPhone)) return false
    if (seenPhones.has(c.customerPhone)) return false
    seenPhones.add(c.customerPhone)
    return true
  }).slice(0, 20)

  return NextResponse.json(recent)
}
