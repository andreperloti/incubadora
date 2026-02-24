import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = parseInt((session.user as any).businessId)
  const conversationId = parseInt(params.id)

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
  })

  if (!conv) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'resolved', resolvedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
