import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parsePhoneFromContactName } from '@/lib/whatsapp'

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

// Dado um chatId (ex: "5511999@c.us" ou "12345@lid") e o nome do chat,
// retorna o valor a usar como customerPhone no banco.
// Para @c.us: número puro. Para @lid: tenta extrair de name, senão usa o @lid.
function resolveCustomerPhone(chatId: string, chatName: string): string {
  if (chatId.endsWith('@c.us')) {
    return chatId.replace('@c.us', '')
  }
  // @lid: tenta usar o número contido no nome
  const phoneFromName = parsePhoneFromContactName(chatName)
  return phoneFromName ?? chatId
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

  // Usa chats/overview que retorna tanto @c.us quanto @lid com nome e última mensagem
  const chatsRes = await fetch(
    `${WAHA_API_URL}/api/${wahaSession}/chats/overview?limit=${chatsLimit}`,
    { headers: wahaHeaders() }
  ).catch(() => null)

  // Fallback para endpoint /chats se overview não existir
  const fallbackRes = chatsRes?.ok ? null : await fetch(
    `${WAHA_API_URL}/api/${wahaSession}/chats?limit=${chatsLimit}`,
    { headers: wahaHeaders() }
  ).catch(() => null)

  const activeRes = chatsRes?.ok ? chatsRes : fallbackRes

  if (!activeRes?.ok) {
    return NextResponse.json(
      { error: 'Erro ao buscar conversas do WAHA. Verifique se o WhatsApp está conectado.' },
      { status: 502 }
    )
  }

  const chatsData = await activeRes.json()
  const allChats: any[] = Array.isArray(chatsData) ? chatsData : (chatsData.chats ?? [])

  // Filtra apenas chats individuais (exclui grupos, broadcasts e o próprio WhatsApp Business)
  const individualChats = allChats
    .filter((c: any) => {
      const id = extractId(c.id)
      if (c.isGroup || c.isBroadcast) return false
      if (id === '0@c.us' || id.endsWith('@broadcast') || id.endsWith('@newsletter')) return false
      return id.endsWith('@c.us') || id.endsWith('@lid')
    })
    .slice(0, chatsLimit)

  let importedConversations = 0
  let importedMessages = 0
  let skippedChats = 0

  for (const chat of individualChats) {
    const chatId = extractId(chat.id)
    const chatName = chat.name || chat.displayName || ''
    const customerPhone = resolveCustomerPhone(chatId, chatName)
    const customerName = chatName || customerPhone

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

    // Verifica se já existe conversa — busca tanto pelo phone quanto pelo @lid
    const searchPhones = Array.from(new Set([customerPhone, chatId].filter(Boolean)))
    let conversation = await prisma.conversation.findFirst({
      where: { businessId, customerPhone: { in: searchPhones } },
      orderBy: { createdAt: 'desc' },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          businessId,
          customerPhone,
          customerName,
          status: 'resolved',
          lastCustomerMessageAt: lastMsgAt,
          resolvedAt: new Date(),
        },
      })
      importedConversations++
    } else {
      // Atualiza nome se estava vazio ou era o próprio phone
      if (!conversation.customerName || conversation.customerName === conversation.customerPhone) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { customerName },
        })
      }
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
