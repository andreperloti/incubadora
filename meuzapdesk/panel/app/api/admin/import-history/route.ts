import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

function wahaHeaders() {
  return { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY }
}

// Normaliza IDs do WAHA — podem ser string ou objeto {_serialized, user, server}
function extractId(id: unknown): string {
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id !== null) {
    const obj = id as Record<string, unknown>
    return (obj._serialized ?? obj.id ?? '') as string
  }
  return ''
}

function extractPhone(chatId: unknown): string {
  return extractId(chatId).replace('@c.us', '')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const businessId = parseInt(user.businessId)

  const body = await req.json().catch(() => ({}))
  const chatsLimit = Math.min(body.chatsLimit ?? 20, 50)
  const messagesPerChat = Math.min(body.messagesPerChat ?? 100, 300)

  // Busca sessão WAHA do negócio
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business?.wahaSession) {
    return NextResponse.json({ error: 'Sessão WAHA não configurada' }, { status: 400 })
  }

  const wahaSession = business.wahaSession

  // Busca lista de chats do WAHA
  const chatsRes = await fetch(
    `${WAHA_API_URL}/api/${wahaSession}/chats?limit=${chatsLimit}`,
    { headers: wahaHeaders() }
  ).catch(() => null)

  if (!chatsRes?.ok) {
    return NextResponse.json(
      { error: 'Erro ao buscar conversas do WAHA. Verifique se o WhatsApp está conectado.' },
      { status: 502 }
    )
  }

  const chatsData = await chatsRes.json()
  const allChats: any[] = Array.isArray(chatsData) ? chatsData : (chatsData.chats ?? [])

  // Filtra apenas chats individuais (@c.us) — o id pode ser objeto ou string
  const individualChats = allChats
    .filter((c: any) => {
      const serialized = extractId(c.id)
      return serialized.endsWith('@c.us') && !c.isGroup
    })
    .slice(0, chatsLimit)

  let importedConversations = 0
  let importedMessages = 0
  let skippedChats = 0

  for (const chat of individualChats) {
    const chatId = extractId(chat.id)
    const phone = extractPhone(chat.id)
    const customerName = chat.name || chat.displayName || phone

    // Busca mensagens do chat
    const msgsRes = await fetch(
      `${WAHA_API_URL}/api/${wahaSession}/chats/${encodeURIComponent(chatId)}/messages?limit=${messagesPerChat}&downloadMedia=false`,
      { headers: wahaHeaders() }
    ).catch(() => null)

    if (!msgsRes?.ok) {
      skippedChats++
      continue
    }

    const msgsData = await msgsRes.json()
    const messages: any[] = Array.isArray(msgsData) ? msgsData : (msgsData.messages ?? [])

    // Ignora chats sem mensagens de texto
    const textMessages = messages.filter((m: any) => m.body && String(m.body).trim())
    if (textMessages.length === 0) {
      skippedChats++
      continue
    }

    // Ordena por timestamp crescente
    textMessages.sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

    const lastMsg = textMessages[textMessages.length - 1]
    const lastMsgAt = lastMsg.timestamp ? new Date(lastMsg.timestamp * 1000) : new Date()

    // Verifica se já existe uma conversa para esse telefone
    let conversation = await prisma.conversation.findFirst({
      where: { businessId, customerPhone: phone },
      orderBy: { createdAt: 'desc' },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          businessId,
          customerPhone: phone,
          customerName,
          status: 'resolved',
          lastCustomerMessageAt: lastMsgAt,
          resolvedAt: new Date(),
        },
      })
      importedConversations++
    }

    // Carrega IDs já existentes para evitar duplicatas
    const existing = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      select: { waMessageId: true },
    })
    const existingIds = new Set(existing.map((m) => m.waMessageId).filter(Boolean))

    // Salva as mensagens novas
    for (const msg of textMessages) {
      const waMessageId = extractId(msg.id)
      if (!waMessageId || existingIds.has(waMessageId)) continue

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: msg.fromMe ? 'out' : 'in',
          content: String(msg.body),
          waMessageId,
          sentAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
        },
      })
      importedMessages++
    }
  }

  return NextResponse.json({
    success: true,
    imported: { conversations: importedConversations, messages: importedMessages },
    skippedChats,
    totalChatsProcessed: individualChats.length,
  })
}
