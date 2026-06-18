import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSessionBusinessId } from '@/lib/auth'
import { prisma } from '@/lib/db'

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

function extractWaMessageId(id: unknown): string {
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id !== null) {
    const obj = id as Record<string, unknown>
    return (obj._serialized ?? obj.id ?? '') as string
  }
  return ''
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = getSessionBusinessId(session)
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const conversationId = parseInt(params.id)
  const beforeParam = req.nextUrl.searchParams.get('before')
  if (!beforeParam) return NextResponse.json({ error: 'Parâmetro before obrigatório' }, { status: 400 })

  const beforeTs = parseInt(beforeParam, 10)
  if (isNaN(beforeTs)) return NextResponse.json({ error: 'Parâmetro before inválido' }, { status: 400 })

  const beforeDate = new Date(beforeTs * 1000)

  const dbMessages = await prisma.message.findMany({
    where: { conversationId, sentAt: { lt: beforeDate } },
    orderBy: { sentAt: 'desc' },
    take: 25,
    include: {
      senderUser: { select: { id: true, name: true } },
    },
  })

  if (dbMessages.length >= 25) {
    const messages = dbMessages.reverse()
    return NextResponse.json({ messages, hasMore: messages.length >= 25 })
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: { business: { select: { wahaSession: true } } },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  const { wahaSession } = conversation.business
  const chatId = encodeURIComponent(conversation.customerPhone + '@c.us')

  let wahaMessages: any[] = []
  try {
    const res = await fetch(
      `${WAHA_API_URL}/api/${wahaSession}/chats/${chatId}/messages?limit=25&downloadMedia=false`,
      {
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (res.ok) {
      const data = await res.json()
      const all: any[] = Array.isArray(data) ? data : (data.messages ?? [])
      wahaMessages = all.filter(
        (m: any) => m.body && String(m.body).trim() && m.timestamp < beforeTs
      )
    }
  } catch {}

  if (wahaMessages.length > 0) {
    await prisma.message.createMany({
      data: wahaMessages
        .map((m: any) => {
          const waMessageId = extractWaMessageId(m.id)
          if (!waMessageId) return null
          return {
            conversationId,
            direction: (m.fromMe ? 'out' : 'in') as 'out' | 'in',
            content: String(m.body),
            waMessageId,
            sentAt: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
          }
        })
        .filter((m): m is NonNullable<typeof m> => m !== null),
      skipDuplicates: true,
    })
  }

  const allMessages = await prisma.message.findMany({
    where: { conversationId, sentAt: { lt: beforeDate } },
    orderBy: { sentAt: 'desc' },
    take: 25,
    include: {
      senderUser: { select: { id: true, name: true } },
    },
  })

  const messages = allMessages.reverse()
  return NextResponse.json({ messages, hasMore: messages.length >= 25 })
}
