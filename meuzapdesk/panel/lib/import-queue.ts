import { Queue, Worker, Job } from 'bullmq'
import { redisPublisher, createRedisSubscriber } from './redis'
import { broadcastToBusinessClients } from './sse'
import { prisma } from './db'
import { parsePhoneFromContactName, normalizePhone, isWhatsAppId } from './whatsapp'
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
    send({ type: 'status', message: 'Carregando lista de conversas do WhatsApp...' })

    const business = await prisma.business.findUnique({ where: { id: businessId } })
    if (!business) {
      send({ type: 'error', message: 'Empresa não encontrada' })
      return
    }

    const chatsRes = await fetch(
      `${WAHA_API_URL}/api/${wahaSession}/chats/overview?limit=${chatsLimit}`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(120_000) }
    ).catch(() => null)

    const fallbackRes = chatsRes?.ok ? null : await fetch(
      `${WAHA_API_URL}/api/${wahaSession}/chats?limit=${chatsLimit}`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(60_000) }
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

      async function fetchMessages(id: string) {
        return fetch(
          `${WAHA_API_URL}/api/${wahaSession}/chats/${encodeURIComponent(id)}/messages?limit=${messagesPerChat}&downloadMedia=false`,
          { headers: wahaHeaders(), signal: AbortSignal.timeout(10000) }
        ).catch(() => null)
      }

      let msgsRes = await fetchMessages(resolvedChatId)
      // Se @lid ou @c.us falhar, tenta o outro formato
      if (!msgsRes?.ok && resolvedChatId !== chatId) {
        msgsRes = await fetchMessages(chatId)
      }

      // lastMessage do overview — usado como fallback quando WAHA não consegue carregar o chat completo.
      // Isso acontece porque o WhatsApp Web (WEBJS) só carrega mensagens de chats que foram "abertos"
      // na sessão atual. Para chats não abertos, cria a conversa com só a última mensagem do overview.
      const overviewLastMsg: any = chat.lastMessage ?? null
      const overviewLastMsgTs: number | undefined = overviewLastMsg?.timestamp
      const fallbackLastMsgAt = overviewLastMsgTs ? new Date(overviewLastMsgTs * 1000) : new Date(0)

      let textMessages: any[] = []

      if (msgsRes?.ok) {
        const msgsData = await msgsRes.json()
        const messages: any[] = Array.isArray(msgsData) ? msgsData : (msgsData.messages ?? [])
        textMessages = messages.filter((m: any) => {
          const body = m.body ? String(m.body).trim() : ''
          return (body && !isWhatsAppId(body)) || m.hasMedia
        })
        textMessages.sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      } else if (overviewLastMsg) {
        // WAHA não conseguiu carregar o histórico — usa a última mensagem do overview como fallback
        const body = (overviewLastMsg.body || '').trim()
        if ((body && !isWhatsAppId(body)) || overviewLastMsg.hasMedia) {
          textMessages = [overviewLastMsg]
        }
      } else {
        // Sem mensagens acessíveis e sem lastMessage — pula
        return
      }

      const lastMsgAt = textMessages.length > 0
        ? (textMessages[textMessages.length - 1].timestamp
            ? new Date(textMessages[textMessages.length - 1].timestamp * 1000)
            : fallbackLastMsgAt)
        : fallbackLastMsgAt

      const withoutDdi = customerPhone.startsWith('55') ? customerPhone.slice(2) : customerPhone
      const searchPhones = Array.from(new Set([customerPhone, withoutDdi, resolvedChatId, chatId].filter(Boolean)))
      // Somente dígitos puros para cruzar com customerRealPhone (que nunca tem @suffix)
      const numericPhones = searchPhones.filter((p) => /^\d+$/.test(p))
      let conversation = await prisma.conversation.findFirst({
        where: {
          businessId,
          OR: [
            { customerPhone: { in: searchPhones } },
            ...(numericPhones.length > 0 ? [{ customerRealPhone: { in: numericPhones } }] : []),
          ],
        },
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
            const mediaUrl: string | null = msg.media?.url ?? null
            const mediaType: string | null = msg.media?.mimetype ?? null
            // Body padrão para mensagens de mídia sem texto
            const content = msg.body && String(msg.body).trim()
              ? String(msg.body)
              : mediaType?.startsWith('audio') ? '🎵 Áudio'
              : mediaType?.startsWith('image') ? '📷 Imagem'
              : mediaType?.startsWith('video') ? '🎥 Vídeo'
              : '📎 Arquivo'
            return {
              conversationId: conversation!.id,
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

