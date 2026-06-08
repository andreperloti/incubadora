import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { importQueue, ensureImportWorker } from '@/lib/import-queue'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const user = session.user as any
  if (user.role !== 'OWNER') return new Response('Forbidden', { status: 403 })

  const businessId = parseInt(user.businessId)

  const body = await req.json().catch(() => ({}))
  const chatsLimit = Math.min(body.chatsLimit ?? 20, 50)
  const messagesPerChat = Math.min(body.messagesPerChat ?? 20, 300)

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business?.wahaSession) {
    return new Response(JSON.stringify({ error: 'Sessão WAHA não configurada' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  ensureImportWorker()

  const job = await importQueue.add('import', {
    businessId,
    wahaSession: business.wahaSession,
    chatsLimit,
    messagesPerChat,
    sinceDate: business.lastImportedAt?.toISOString(),
  })

  return new Response(JSON.stringify({ jobId: job.id }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  })
}
