import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { UsersClient } from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') {
    redirect('/dashboard')
  }

  const businessId = parseInt((session.user as any).businessId)

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

  return <UsersClient users={JSON.parse(JSON.stringify(users))} />
}
