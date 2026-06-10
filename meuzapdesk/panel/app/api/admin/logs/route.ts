import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const businessId = parseInt(user.businessId)
  const { searchParams } = req.nextUrl
  const level = searchParams.get('level') // error | warn | info | null = all
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  const logs = await prisma.systemLog.findMany({
    where: {
      businessId,
      ...(level ? { level } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(logs)
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const businessId = parseInt(user.businessId)
  await prisma.systemLog.deleteMany({ where: { businessId } })

  return NextResponse.json({ ok: true })
}
