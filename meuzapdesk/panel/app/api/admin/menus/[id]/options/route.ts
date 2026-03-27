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

// POST /api/admin/menus/[id]/options — adiciona opção ao menu
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const businessId = await getOwnerBusinessId()
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const menuId = parseInt(params.id)
  const menu = await prisma.botMenu.findFirst({ where: { id: menuId, businessId } })
  if (!menu) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const { label, nextMenuId, finalMessage, sectorName } = await req.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Label é obrigatório' }, { status: 400 })

  // Determina a próxima ordem
  const last = await prisma.botMenuOption.findFirst({
    where: { menuId },
    orderBy: { order: 'desc' },
  })
  const order = (last?.order ?? 0) + 1

  const option = await prisma.botMenuOption.create({
    data: {
      menuId,
      order,
      label: label.trim(),
      nextMenuId: nextMenuId ?? null,
      finalMessage: finalMessage?.trim() ?? null,
      sectorName: sectorName?.trim() ?? null,
    },
  })

  return NextResponse.json(option, { status: 201 })
}
