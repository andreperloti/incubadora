import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parsePhoneFromContactName } from '@/lib/whatsapp'

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

function resolveCustomerPhone(chatId: string, chatName: string): string {
  if (chatId.endsWith('@c.us')) {
    return chatId.replace('@c.us', '')
  }
  const phoneFromName = parsePhoneFromContactName(chatName)
  return phoneFromName ?? chatId
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const user = session.user as any
  if (user.role !== 'OWNER') return new Response('Forbidden', { status: 403 })

  const businessId = parseInt(user.businessId)

  const body = await req.json().catch(() => ({}))
  const chatsLimit = Math.min(body.chatsLimit ?? 20, 50)
  const messagesPerChat = Math.min(body.messagesPerChat ?? 100, 300)

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business?.wahaSession) {
    return new Response(JSON.stringify({ error: 'Sessão WAHA não configurada' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const wahaSession = business.wahaSession

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Verifica se o número conectado mudou
        send({ type: 'status', message: 'Verificando número conectado...' })
        const sessionRes = await fetch(
          `${WAHA_API_URL}/api/sessions/${wahaSession}`,
          { headers: wahaHeaders() }
        ).catch(() => null)

        if (sessionRes?.ok) {
          const sessionData = await sessionRes.json()
          const connectedPhone = sessionData?.me?.id?.replace('@c.us', '') || ''

          if (connectedPhone && connectedPhone !== business.whatsappNumber) {
            send({ type: 'status', message: `Número alterado para ${connectedPhone}. Limpando conversas anteriores...` })

            // Limpa conversas e mensagens antigas do business
            await prisma.message.deleteMany({
              where: { conversation: { businessId } },
            })
            await prisma.conversationAlert.deleteMany({
              where: { conversation: { businessId } },
            })
            await prisma.conversation.deleteMany({
              where: { businessId },
            })

            // Atualiza o número do business
            await prisma.business.update({
              where: { id: businessId },
              data: { whatsappNumber: connectedPhone },
            })
          }
        }

        send({ type: 'status', message: 'Buscando conversas do WhatsApp...' })

        const chatsRes = await fetch(
          `${WAHA_API_URL}/api/${wahaSession}/chats/overview?limit=${chatsLimit}`,
          { headers: wahaHeaders() }
        ).catch(() => null)

        const fallbackRes = chatsRes?.ok ? null : await fetch(
          `${WAHA_API_URL}/api/${wahaSession}/chats?limit=${chatsLimit}`,
          { headers: wahaHeaders() }
        ).catch(() => null)

        const activeRes = chatsRes?.ok ? chatsRes : fallbackRes

        if (!activeRes?.ok) {
          send({ type: 'error', message: 'Erro ao buscar conversas do WAHA. Verifique se o WhatsApp está conectado.' })
          controller.close()
          return
        }

        const chatsData = await activeRes.json()
        const allChats: any[] = Array.isArray(chatsData) ? chatsData : (chatsData.chats ?? [])

        const individualChats = allChats
          .filter((c: any) => {
            const id = extractId(c.id)
            if (c.isGroup || c.isBroadcast) return false
            if (id === '0@c.us' || id.endsWith('@broadcast') || id.endsWith('@newsletter')) return false
            return id.endsWith('@c.us') || id.endsWith('@lid')
          })
          .slice(0, chatsLimit)

        const total = individualChats.length
        send({ type: 'total', total })

        let importedConversations = 0
        let importedMessages = 0

        for (let i = 0; i < individualChats.length; i++) {
          const chat = individualChats[i]
          const chatId = extractId(chat.id)
          const chatName = chat.name || chat.displayName || ''
          const customerPhone = resolveCustomerPhone(chatId, chatName)
          const customerName = chatName || customerPhone

          send({
            type: 'progress',
            current: i + 1,
            total,
            chatName: customerName,
          })

          const msgsRes = await fetch(
            `${WAHA_API_URL}/api/${wahaSession}/chats/${encodeURIComponent(chatId)}/messages?limit=${messagesPerChat}&downloadMedia=false`,
            { headers: wahaHeaders() }
          ).catch(() => null)

          if (!msgsRes?.ok) continue

          const msgsData = await msgsRes.json()
          const messages: any[] = Array.isArray(msgsData) ? msgsData : (msgsData.messages ?? [])

          const textMessages = messages.filter((m: any) => m.body && String(m.body).trim())
          if (textMessages.length === 0) continue

          textMessages.sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

          const lastMsg = textMessages[textMessages.length - 1]
          const lastMsgAt = lastMsg.timestamp ? new Date(lastMsg.timestamp * 1000) : new Date()

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
            if (!conversation.customerName || conversation.customerName === conversation.customerPhone) {
              await prisma.conversation.update({
                where: { id: conversation.id },
                data: { customerName },
              })
            }
          }

          const existing = await prisma.message.findMany({
            where: { conversationId: conversation.id },
            select: { waMessageId: true },
          })
          const existingIds = new Set(existing.map((m) => m.waMessageId).filter(Boolean))

          let chatMessages = 0
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
            chatMessages++
            importedMessages++
          }
        }

        send({
          type: 'done',
          imported: { conversations: importedConversations, messages: importedMessages },
          totalChatsProcessed: total,
        })
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
