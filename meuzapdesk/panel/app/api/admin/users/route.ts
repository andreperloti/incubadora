import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function ownerOnly(session: any) {
  if (!session || (session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  return null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = ownerOnly(session)
  if (denied) return denied

  const businessId = parseInt((session!.user as any).businessId)

  const users = await prisma.user.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const denied = ownerOnly(session)
  if (denied) return denied

  const businessId = parseInt((session!.user as any).businessId)
  const body = await req.json()
  const { name, email, password, role } = body

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Campos obrigatórios: name, email, password' }, { status: 400 })
  }

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      businessId,
      name,
      email,
      passwordHash,
      role: role === 'OWNER' ? 'OWNER' : 'MECHANIC',
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })

  return NextResponse.json(user, { status: 201 })
}
