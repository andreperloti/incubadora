import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function getOwnerBusinessId() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const user = session.user as any
  if (user.role !== 'OWNER') return null
  return parseInt(user.businessId)
}

// PUT /api/admin/menus/[id] — edita menu
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const businessId = await getOwnerBusinessId()
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const menuId = parseInt(params.id)
  const { name, message, isRoot } = await req.json()

  const existing = await prisma.botMenu.findFirst({ where: { id: menuId, businessId } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (isRoot && !existing.isRoot) {
    await prisma.botMenu.updateMany({
      where: { businessId, isRoot: true },
      data: { isRoot: false },
    })
  }

  const menu = await prisma.botMenu.update({
    where: { id: menuId },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(message?.trim() ? { message: message.trim() } : {}),
      ...(isRoot !== undefined ? { isRoot } : {}),
    },
    include: { options: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json(menu)
}

// DELETE /api/admin/menus/[id] — remove menu
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const businessId = await getOwnerBusinessId()
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const menuId = parseInt(params.id)
  const existing = await prisma.botMenu.findFirst({ where: { id: menuId, businessId } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  await prisma.botMenu.delete({ where: { id: menuId } })

  return NextResponse.json({ ok: true })
}
