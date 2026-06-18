import { Queue, Worker, Job } from 'bullmq'
import { redisPublisher, createRedisSubscriber } from './redis'
import { broadcastToBusinessClients } from './sse'
import { prisma } from './db'
import { parsePhoneFromContactName, normalizePhone } from './whatsapp'
import { logError, logInfo, logWarn } from './logger'

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

globalForQueue.importQueue = importQueue

// Worker inicializado de forma lazy — NÃO no top-level do módulo,
// para não quebrar o registo de Server Actions no Next.js.
export function ensureImportWorker(): void {
  const g = global as unknown as { importWorker: Worker }
  if (g.importWorker) return
  g.importWorker = new Worker('import-history', processImport, { connection })
  g.importWorker.on('failed', (job, err) => {
    logError('import', `Job falhou: ${job?.id}`, { jobId: job?.id, error: String(err), data: job?.data }).catch(() => {})
  })
}

async function processImport(job: Job<ImportJobData>) {
  const { businessId, wahaSession, chatsLimit, messagesPerChat, sinceDate } = job.data
  const jobId = job.id!

  function send(data: object) {
    redisPublisher.publish(importProgressChannel(jobId), JSON.stringify(data)).catch(() => {})
  }

  try {
    logInfo('import', `Importação iniciada`, { businessId, wahaSession, chatsLimit, messagesPerChat }, businessId).catch(() => {})
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
      const errMsg = 'Erro ao buscar conversas do WAHA. Verifique se o WhatsApp está conectado.'
      logError('import', errMsg, { businessId, wahaSession }, businessId).catch(() => {})
      send({ type: 'error', message: errMsg })
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
    let processedCount = 0
    const BATCH_SIZE = 3

    async function processChat(chat: any) {
      const chatId = extractId(chat.id)
      const chatName = chat.name || chat.displayName || ''

      let resolvedChatId = chatId
      if (chatId.endsWith('@lid')) {
        const contactRes = await fetch(
          `${WAHA_API_URL}/api/${wahaSession}/contacts/${encodeURIComponent(chatId)}`,
          { headers: wahaHeaders(), signal: AbortSignal.timeout(5000) }
        ).catch(() => null)
        if (contactRes?.ok) {
          const contactData = await contactRes.json()
          if (contactData?.id?.endsWith('@c.us')) resolvedChatId = contactData.id
        }
      }

      const customerPhone = resolveCustomerPhone(resolvedChatId, chatName)
      const customerName = chatName || customerPhone

      const msgsRes = await fetch(
        `${WAHA_API_URL}/api/${wahaSession}/chats/${encodeURIComponent(resolvedChatId)}/messages?limit=${messagesPerChat}&downloadMedia=false`,
        { headers: wahaHeaders(), signal: AbortSignal.timeout(10000) }
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
      } else if (!conversation.customerName || conversation.customerName === conversation.customerPhone) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { customerName },
        })
      }

      processedCount++
      send({ type: 'progress', current: processedCount, total, chatName: customerName })

      if (textMessages.length === 0) return

      // createMany com skipDuplicates substitui findMany + loop de creates individuais
      const result = await prisma.message.createMany({
        data: textMessages
          .map((msg: any) => {
            const waMessageId = extractId(msg.id)
            if (!waMessageId) return null
            return {
              conversationId: conversation!.id,
              direction: (msg.fromMe ? 'out' : 'in') as 'out' | 'in',
              content: String(msg.body),
              waMessageId,
              sentAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
            }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null),
        skipDuplicates: true,
      })

      if (result.count > 0) {
        importedMessages += result.count
        broadcastToBusinessClients(String(businessId), {
          type: 'conversation_imported',
          conversation: { id: conversation!.id, customerPhone, customerName },
        })
      }
    }

    // Processa chats em batches paralelos de BATCH_SIZE
    for (let i = 0; i < individualChats.length; i += BATCH_SIZE) {
      const batch = individualChats.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map((chat: any) => processChat(chat).catch((err) => {
        logWarn('import', `Erro ao processar chat: ${err}`, { businessId }).catch(() => {})
      })))
    }

    // Só atualiza lastImportedAt se algo foi realmente importado
    // (evita que um import vazio bloqueie o próximo import incremental)
    if (importedMessages > 0 || importedConversations > 0) {
      await prisma.business.update({
        where: { id: businessId },
        data: { lastImportedAt: new Date() },
      })
    }

    logInfo('import', `Importação concluída`, {
      businessId, wahaSession,
      newConversations: importedConversations,
      newMessages: importedMessages,
      totalChats: total,
    }, businessId).catch(() => {})
    send({
      type: 'done',
      imported: { conversations: importedConversations, messages: importedMessages },
      totalChatsProcessed: total,
    })
  } catch (err) {
    logError('import', `Erro durante importação: ${String(err)}`, { businessId, wahaSession, error: String(err) }, businessId).catch(() => {})
    send({ type: 'error', message: String(err) })
  }
}

