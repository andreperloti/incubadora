import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function getOwnerBusinessId(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const user = session.user as any
  if (user.role !== 'OWNER') return null
  return parseInt(user.businessId)
}

// GET /api/admin/menus — lista todos os menus com opções
export async function GET(req: NextRequest) {
  const businessId = await getOwnerBusinessId(req)
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const menus = await prisma.botMenu.findMany({
    where: { businessId },
    include: { options: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(menus)
}

// POST /api/admin/menus — cria novo menu
export async function POST(req: NextRequest) {
  const businessId = await getOwnerBusinessId(req)
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { name, message, isRoot } = await req.json()
  if (!name?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Nome e mensagem são obrigatórios' }, { status: 400 })
  }

  // Se isRoot, garante que só existe um root por business
  if (isRoot) {
    await prisma.botMenu.updateMany({
      where: { businessId, isRoot: true },
      data: { isRoot: false },
    })
  }

  const menu = await prisma.botMenu.create({
    data: { businessId, name: name.trim(), message: message.trim(), isRoot: !!isRoot },
    include: { options: true },
  })

  return NextResponse.json(menu, { status: 201 })
}
