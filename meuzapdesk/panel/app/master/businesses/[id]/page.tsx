import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { BusinessDetailClient } from './BusinessDetailClient'

export const dynamic = 'force-dynamic'

export default async function BusinessDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if ((session.user as any).role !== 'SUPER_ADMIN') redirect('/atendimento')

  return <BusinessDetailClient session={session} businessId={parseInt(params.id)} />
}
