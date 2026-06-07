import { Queue, Worker, Job } from 'bullmq'
import { redisPublisher, createRedisSubscriber } from './redis'
import { broadcastToBusinessClients } from './sse'
import { prisma } from './db'
import { parsePhoneFromContactName, normalizePhone } from './whatsapp'

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
  if (chatId.endsWith('@c.us')) return normalizePhone(chatId)
  const phoneFromName = parsePhoneFromContactName(chatName)
  return phoneFromName ? normalizePhone(phoneFromName) : chatId
}

export function importProgressChannel(jobId: string) {
  return `mzd:import:${jobId}`
}

export interface ImportJobData {
  businessId: number
  wahaSession: string
  chatsLimit: number
  messagesPerChat: number
  sinceDate?: string
}

const connection = { host: 'localhost', port: 6379 }

const globalForQueue = global as unknown as { importQueue: Queue }
export const importQueue: Queue =
  globalForQueue.importQueue ??
  new Queue('import-history', { connection })

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.importQueue = importQueue
}

async function processImport(job: Job<ImportJobData>) {
  const { businessId, wahaSession, chatsLimit, messagesPerChat, sinceDate } = job.data
  const jobId = job.id!

  function send(data: object) {
    redisPublisher.publish(importProgressChannel(jobId), JSON.stringify(data)).catch(() => {})
  }

  try {
    send({ type: 'status', message: 'Verificando número conectado...' })

    const business = await prisma.business.findUnique({ where: { id: businessId } })
    if (!business) {
      send({ type: 'error', message: 'Empresa não encontrada' })
      return
    }

    const sessionRes = await fetch(
      `${WAHA_API_URL}/api/sessions/${wahaSession}`,
      { headers: wahaHeaders() }
    ).catch(() => null)

    if (sessionRes?.ok) {
      const sessionData = await sessionRes.json()
      const connectedPhone = sessionData?.me?.id?.replace('@c.us', '') || ''

      if (connectedPhone && connectedPhone !== business.whatsappNumber) {
        send({ type: 'status', message: `Número alterado para ${connectedPhone}. Limpando conversas anteriores...` })

        await prisma.message.deleteMany({ where: { conversation: { businessId } } })
        await prisma.conversationAlert.deleteMany({ where: { conversation: { businessId } } })
        await prisma.conversation.deleteMany({ where: { businessId } })
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
      return
    }

    const chatsData = await activeRes.json()
    const allChats: any[] = Array.isArray(chatsData) ? chatsData : (chatsData.chats ?? [])

    const sinceTimestamp = sinceDate ? Math.floor(new Date(sinceDate).getTime() / 1000) : null

    const individualChats = allChats
      .filter((c: any) => {
        const id = extractId(c.id)
        if (c.isGroup || c.isBroadcast) return false
        if (id === '0@c.us' || id.endsWith('@broadcast') || id.endsWith('@newsletter')) return false
        if (!id.endsWith('@c.us') && !id.endsWith('@lid')) return false
        // Filtro incremental: ignora chats sem atividade após lastImportedAt
        if (sinceTimestamp) {
          const lastTs = (c.lastMessage as any)?.timestamp ?? 0
          if (lastTs < sinceTimestamp) return false
        }
        return true
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

      let resolvedChatId = chatId
      if (chatId.endsWith('@lid')) {
        const contactRes = await fetch(
          `${WAHA_API_URL}/api/${wahaSession}/contacts/${encodeURIComponent(chatId)}`,
          { headers: wahaHeaders() }
        ).catch(() => null)
        if (contactRes?.ok) {
          const contactData = await contactRes.json()
          if (contactData?.id?.endsWith('@c.us')) resolvedChatId = contactData.id
        }
      }

      const customerPhone = resolveCustomerPhone(resolvedChatId, chatName)
      const customerName = chatName || customerPhone

      send({ type: 'progress', current: i + 1, total, chatName: customerName })

      const msgsRes = await fetch(
        `${WAHA_API_URL}/api/${wahaSession}/chats/${encodeURIComponent(resolvedChatId)}/messages?limit=${messagesPerChat}&downloadMedia=false`,
        { headers: wahaHeaders() }
      ).catch(() => null)

      const overviewLastMsgTs: number | undefined = (chat.lastMessage as any)?.timestamp
      const fallbackLastMsgAt = overviewLastMsgTs ? new Date(overviewLastMsgTs * 1000) : new Date()

      let textMessages: any[] = []
      if (msgsRes?.ok) {
        const msgsData = await msgsRes.json()
        const messages: any[] = Array.isArray(msgsData) ? msgsData : (msgsData.messages ?? [])
        textMessages = messages.filter((m: any) => m.body && String(m.body).trim())
        textMessages.sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      }

      const lastMsgAt = textMessages.length > 0
        ? (textMessages[textMessages.length - 1].timestamp
            ? new Date(textMessages[textMessages.length - 1].timestamp * 1000)
            : fallbackLastMsgAt)
        : fallbackLastMsgAt

      // Busca com e sem DDI para evitar duplicatas por formato diferente
      const withoutDdi = customerPhone.startsWith('55') ? customerPhone.slice(2) : customerPhone
      const searchPhones = Array.from(new Set([customerPhone, withoutDdi, resolvedChatId, chatId].filter(Boolean)))
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
        broadcastToBusinessClients(String(businessId), {
          type: 'conversation_imported',
          conversation: { id: conversation.id, customerPhone, customerName },
        })
      } else {
        if (!conversation.customerName || conversation.customerName === conversation.customerPhone) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { customerName },
          })
        }
      }

      if (textMessages.length === 0) continue

      const existing = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        select: { waMessageId: true },
      })
      const existingIds = new Set(existing.map((m) => m.waMessageId).filter(Boolean))

      let newMessages = 0
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
        newMessages++
      }

      if (newMessages > 0) {
        // Usa conversation_imported para não crashar o handler de SSE do atendimento,
        // que espera o campo message presente em eventos new_message
        broadcastToBusinessClients(String(businessId), {
          type: 'conversation_imported',
          conversation: { id: conversation.id, customerPhone, customerName },
        })
      }
    }

    // Salva timestamp do último import bem-sucedido
    await prisma.business.update({
      where: { id: businessId },
      data: { lastImportedAt: new Date() },
    })

    send({
      type: 'done',
      imported: { conversations: importedConversations, messages: importedMessages },
      totalChatsProcessed: total,
    })
  } catch (err) {
    send({ type: 'error', message: String(err) })
  }
}

// Worker singleton — inicializado uma única vez por processo
const globalForWorker = global as unknown as { importWorker: Worker }
if (!globalForWorker.importWorker) {
  globalForWorker.importWorker = new Worker('import-history', processImport, { connection })
  globalForWorker.importWorker.on('failed', (job, err) => {
    console.error('[ImportWorker] Job falhou:', job?.id, err)
  })
}
