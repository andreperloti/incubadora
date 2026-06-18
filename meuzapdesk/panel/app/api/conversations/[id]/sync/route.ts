import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSessionBusinessId } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

function wahaHeaders() {
  return { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY }
}

function extractId(id: unknown): string {
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id !== null) {
    const obj = id as Record<string, unknown>
    return (obj._serialized ?? obj.id ?? '') as string
  }
  return ''
}

async function fetchWahaMessages(wahaSession: string, chatId: string): Promise<any[] | null> {
  const res = await fetch(
    `${WAHA_API_URL}/api/${wahaSession}/chats/${encodeURIComponent(chatId)}/messages?limit=25&downloadMedia=false`,
    { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) }
  ).catch(() => null)

  if (!res?.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data : (data.messages ?? [])
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const businessId = getSessionBusinessId(session)
  if (!businessId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const conversationId = parseInt(params.id)

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: { business: { select: { wahaSession: true } } },
  })

  if (!conversation) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const wahaSession = conversation.business.wahaSession
  if (!wahaSession) return NextResponse.json({ newCount: 0 })

  const phone = conversation.customerPhone
  const chatIdCus = phone.includes('@') ? phone : `${phone}@c.us`

  let messages = await fetchWahaMessages(wahaSession, chatIdCus)

  // Se @c.us falhar, tenta resolver @lid via contacts API
  if (!messages) {
    const contactRes = await fetch(
      `${WAHA_API_URL}/api/${wahaSession}/contacts/${encodeURIComponent(chatIdCus)}`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(5_000) }
    ).catch(() => null)

    if (contactRes?.ok) {
      const contact = await contactRes.json()
      const lidId = Object.values(contact).find(
        (v): v is string => typeof v === 'string' && v.endsWith('@lid')
      )
      if (lidId) messages = await fetchWahaMessages(wahaSession, lidId)
    }
  }

  if (!messages || messages.length === 0) return NextResponse.json({ newCount: 0 })

  const validMsgs = messages.filter((m: any) => (m.body && String(m.body).trim()) || m.hasMedia)
  if (validMsgs.length === 0) return NextResponse.json({ newCount: 0 })

  const result = await prisma.message.createMany({
    data: validMsgs
      .map((msg: any) => {
        const waMessageId = extractId(msg.id)
        if (!waMessageId) return null
        const mediaUrl: string | null = msg.media?.url ?? null
        const mediaType: string | null = msg.media?.mimetype ?? null
        const content = msg.body && String(msg.body).trim()
          ? String(msg.body)
          : mediaType?.startsWith('audio') ? '🎵 Áudio'
          : mediaType?.startsWith('image') ? '📷 Imagem'
          : mediaType?.startsWith('video') ? '🎥 Vídeo'
          : '📎 Arquivo'
        return {
          conversationId,
          direction: (msg.fromMe ? 'out' : 'in') as 'out' | 'in',
          content,
          waMessageId,
          sentAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
          mediaUrl,
          mediaType,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    skipDuplicates: true,
  })

  if (result.count > 0) {
    // Atualiza lastCustomerMessageAt se tiver mensagem mais recente
    const latestIncoming = validMsgs
      .filter((m: any) => !m.fromMe && m.timestamp)
      .sort((a: any, b: any) => b.timestamp - a.timestamp)[0]
    if (latestIncoming) {
      const latestAt = new Date(latestIncoming.timestamp * 1000)
      if (!conversation.lastCustomerMessageAt || latestAt > conversation.lastCustomerMessageAt) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastCustomerMessageAt: latestAt },
        }).catch(() => {})
      }
    }
    broadcastToBusinessClients(String(businessId), { type: 'new_message', conversationId })
  }

  return NextResponse.json({ newCount: result.count })
}
