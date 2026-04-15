import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.startsWith('0')) return normalizePhone(digits.slice(1))
  if (digits.length <= 11 && !digits.startsWith('55')) return '55' + digits
  return digits
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const user = session.user as any
  const businessId = parseInt(user.businessId)
  const userId = parseInt(user.id)

  const body = await req.json()
  const rawPhone: string = body.phone ?? ''
  const name: string = body.name ?? ''

  if (!rawPhone) return NextResponse.json({ error: 'Telefone obrigatório' }, { status: 400 })

  const phone = normalizePhone(rawPhone)

  // Verifica se já existe conversa ativa para esse número
  const existing = await prisma.conversation.findFirst({
    where: {
      businessId,
      customerPhone: phone,
      status: { not: 'resolved' },
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      alerts: true,
    },
  })

  if (existing) return NextResponse.json({ conversation: existing })

  const conversation = await prisma.conversation.create({
    data: {
      businessId,
      customerPhone: phone,
      customerName: name || phone,
      status: 'in_progress',
      assignedUserId: userId,
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      alerts: true,
    },
  })

  broadcastToBusinessClients(String(businessId), {
    type: 'conversation_update',
    conversation,
  })

  return NextResponse.json({ conversation })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = parseInt((session.user as any).businessId)

  const conversations = await prisma.conversation.findMany({
    where: {
      businessId,
      status: { in: ['in_queue', 'in_progress', 'waiting_menu'] },
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      alerts: true,
    },
    orderBy: { customerWaitingSince: 'asc' },
  })

  return NextResponse.json(conversations)
}
