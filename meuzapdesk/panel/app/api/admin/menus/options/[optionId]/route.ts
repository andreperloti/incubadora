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

// PUT /api/admin/menus/options/[optionId] — edita opção
export async function PUT(
  req: NextRequest,
  { params }: { params: { optionId: string } }
) {
  const businessId = await getOwnerBusinessId()
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const optionId = parseInt(params.optionId)
  const option = await prisma.botMenuOption.findFirst({
    where: { id: optionId },
    include: { menu: true },
  })
  if (!option || option.menu.businessId !== businessId) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  const { label, nextMenuId, finalMessage, sectorName } = await req.json()

  const updated = await prisma.botMenuOption.update({
    where: { id: optionId },
    data: {
      ...(label?.trim() ? { label: label.trim() } : {}),
      nextMenuId: nextMenuId !== undefined ? (nextMenuId ?? null) : option.nextMenuId,
      finalMessage: finalMessage !== undefined ? (finalMessage?.trim() ?? null) : option.finalMessage,
      sectorName: sectorName !== undefined ? (sectorName?.trim() ?? null) : option.sectorName,
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/admin/menus/options/[optionId] — remove opção
export async function DELETE(
  req: NextRequest,
  { params }: { params: { optionId: string } }
) {
  const businessId = await getOwnerBusinessId()
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const optionId = parseInt(params.optionId)
  const option = await prisma.botMenuOption.findFirst({
    where: { id: optionId },
    include: { menu: true },
  })
  if (!option || option.menu.businessId !== businessId) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  await prisma.botMenuOption.delete({ where: { id: optionId } })

  return NextResponse.json({ ok: true })
}
