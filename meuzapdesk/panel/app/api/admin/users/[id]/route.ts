import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function ownerOnly(session: any) {
  if (!session || (session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  return null
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const denied = ownerOnly(session)
  if (denied) return denied

  const businessId = parseInt((session!.user as any).businessId)
  const userId = parseInt(params.id)
  const body = await req.json()

  // Garante que só edita usuários do mesmo business
  const existing = await prisma.user.findFirst({
    where: { id: userId, businessId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.email !== undefined) data.email = body.email
  if (body.role !== undefined) data.role = body.role === 'OWNER' ? 'OWNER' : 'MECHANIC'
  if (body.active !== undefined) data.active = Boolean(body.active)

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })

  return NextResponse.json(user)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const denied = ownerOnly(session)
  if (denied) return denied

  const businessId = parseInt((session!.user as any).businessId)
  const userId = parseInt(params.id)

  const existing = await prisma.user.findFirst({
    where: { id: userId, businessId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  // Soft-delete: apenas desativa
  const user = await prisma.user.update({
    where: { id: userId },
    data: { active: false },
    select: { id: true, name: true, email: true, role: true, active: true },
  })

  return NextResponse.json(user)
}
