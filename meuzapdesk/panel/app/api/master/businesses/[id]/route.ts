import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

function superAdminOnly(role: string | undefined) {
  return role === 'SUPER_ADMIN'
}

// GET /api/master/businesses/[id]
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = parseInt(params.id)
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } },
      _count: {
        select: {
          conversations: true,
        },
      },
    },
  })

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(business)
}

// PATCH /api/master/businesses/[id]
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = parseInt(params.id)
  const data = await req.json()

  const updated = await prisma.business.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.whatsappNumber !== undefined && { whatsappNumber: data.whatsappNumber }),
      ...(data.wahaSession && { wahaSession: data.wahaSession }),
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/master/businesses/[id]
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { password } = await req.json()
  if (!password) {
    return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })
  }

  // Valida a senha do SUPER_ADMIN
  const adminUser = await prisma.user.findUnique({
    where: { email: (session!.user as any).email },
  })
  const valid = adminUser && await bcrypt.compare(password, adminUser.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 })
  }

  const id = parseInt(params.id)

  // Deleta em cascata: alerts → messages → conversations → users → business
  await prisma.$transaction([
    prisma.conversationAlert.deleteMany({ where: { conversation: { businessId: id } } }),
    prisma.message.deleteMany({ where: { conversation: { businessId: id } } }),
    prisma.conversation.deleteMany({ where: { businessId: id } }),
    prisma.user.deleteMany({ where: { businessId: id } }),
    prisma.business.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
