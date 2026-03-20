import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { MasterDashboardClient } from './MasterDashboardClient'

export const dynamic = 'force-dynamic'

export default async function MasterPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if ((session.user as any).role !== 'SUPER_ADMIN') redirect('/atendimento')

  return <MasterDashboardClient session={session} />
}
