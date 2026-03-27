import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { MenusClient } from './MenusClient'

export default async function MenusPage() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') redirect('/atendimento')

  const user = session.user as any
  const businessId = parseInt(user.businessId)

  const menus = await prisma.botMenu.findMany({
    where: { businessId },
    include: { options: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  return <MenusClient initialMenus={menus} />
}
