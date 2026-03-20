import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

function superAdminOnly(role: string | undefined) {
  return role === 'SUPER_ADMIN'
}

// GET /api/master/businesses/[id]/users
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { businessId: parseInt(params.id) },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(users)
}

// POST /api/master/businesses/[id]/users — cria usuário em qualquer empresa
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, password, role } = await req.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const user = await prisma.user.create({
    data: {
      businessId: parseInt(params.id),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: role ?? 'MECHANIC',
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  })

  return NextResponse.json(user, { status: 201 })
}
