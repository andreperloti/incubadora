import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardClient } from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // MECHANICs use the WhatsApp-style queue at /atendimento
  const role = (session.user as any).role
  if (role !== 'OWNER') redirect('/atendimento')

  return <DashboardClient session={session} />
}
