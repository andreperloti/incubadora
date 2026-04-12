import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const businessId = parseInt(user.businessId)
  const menuId = parseInt(params.id)

  const menu = await prisma.botMenu.findFirst({ where: { id: menuId, businessId } })
  if (!menu) return NextResponse.json({ error: 'Menu não encontrado' }, { status: 404 })

  const body = await req.json()
  const order: number[] = body.order // array de optionIds na nova ordem

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order deve ser um array de IDs' }, { status: 400 })
  }

  await prisma.$transaction(
    order.map((optionId, index) =>
      prisma.botMenuOption.updateMany({
        where: { id: optionId, menuId },
        data: { order: index + 1 },
      })
    )
  )

  return NextResponse.json({ status: 'ok' })
}
