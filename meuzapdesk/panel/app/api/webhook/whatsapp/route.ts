import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, getWahaContactName, getWahaChatName, parsePhoneFromContactName, getWahaContactAvatar, getWahaContactPhone, buildOptionAutoReply, sendWhatsAppMessage, POLL_OPTIONS, getWahaMessageMedia } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

// Payload do WAHA ao receber uma mensagem:
// { event: "message", session: "nome-da-sessao", payload: { id, from, body, timestamp, notifyName, fromMe, ... } }


export async function POST(req: NextRequest) {
  // Valida o secret na query string
  const secret = req.nextUrl.searchParams.get('secret') ?? ''
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Voto em enquete (poll.vote)
  if (body.event === 'poll.vote') {
    return handlePollVote(body)
  }

  // Ignora eventos que não sejam mensagens recebidas
  if (body.event !== 'message') {
    return NextResponse.json({ status: 'ignored' })
  }

  const sessionName: string = body.session
  const payload = body.payload


  // Ignora mensagens enviadas por nós mesmos, de grupos, newsletters ou broadcasts
  const rawFrom: string = payload?.from ?? ''
  if (
    payload?.fromMe ||
    rawFrom.endsWith('@g.us') ||
    rawFrom.endsWith('@newsletter') ||
    rawFrom.endsWith('@broadcast')
  ) {
    return NextResponse.json({ status: 'ignored' })
  }

  // Para @c.us: usa apenas o número. Para @lid: mantém o ID completo como identificador (necessário para envio de resposta).
  const phone = rawFrom.endsWith('@c.us') ? rawFrom.replace('@c.us', '') : rawFrom
  const notifyName: string = payload?.notifyName || payload?.pushName || ''
  const text: string = payload?.body ?? ''
  // payload.id pode ser objeto {_serialized, id, ...} no engine WEBJS
  const waMessageId: string = typeof payload?.id === 'object'
    ? (payload.id?._serialized ?? payload.id?.id ?? '')
    : (payload?.id ?? '')
  // Timestamp real da mensagem no WhatsApp (Unix segundos → Date)
  const waTimestamp: Date = payload?.timestamp
    ? new Date(payload.timestamp * 1000)
    : new Date()

  // Detecta mensagens de mídia — no engine WEBJS, type fica em payload._data.type
  const msgType: string = payload?.type ?? payload?._data?.type ?? ''
  const hasMedia: boolean = payload?.hasMedia === true
  const isAudio = hasMedia && (msgType === 'ptt' || msgType === 'audio' || msgType === 'voice')
  const isFile = hasMedia && !isAudio && (
    msgType === 'image' || msgType === 'document' || msgType === 'video' ||
    msgType === 'sticker' || msgType === 'gif'
  )

  // Ignora se não tem texto nem mídia reconhecida
  if (!phone || (!text && !isAudio && !isFile)) {
    return NextResponse.json({ status: 'ignored' })
  }

  // Para mídia: busca URL via API do WAHA (webhook não inclui media sem config especial)
  let mediaUrl: string | null = payload?.media?.url ?? null
  let mediaType: string | null = payload?.media?.mimetype ?? null
  if ((isAudio || isFile) && !mediaUrl && waMessageId) {
    const media = await getWahaMessageMedia(sessionName, rawFrom, waMessageId)
    if (media) {
      mediaUrl = media.url
      mediaType = media.mimetype
    }
  }

  // Nome do arquivo: vem em diferentes campos dependendo do engine/versão do WAHA
  const incomingFilename: string =
    payload?.media?.filename ??
    payload?._data?.filename ??
    payload?.filename ??
    ''
  const fileLabel = msgType === 'image' ? '🖼️ Imagem'
    : msgType === 'video' ? '🎥 Vídeo'
    : incomingFilename ? `📎 ${incomingFilename}`
    : '📎 Arquivo'
  const effectiveText = text || (isAudio ? '🎵 Áudio' : isFile ? fileLabel : '')

  // Encontra o negócio pela sessão WAHA
  const business = await prisma.business.findFirst({
    where: { wahaSession: sessionName },
  })

  if (!business) {
    console.error(`Business não encontrado para sessão WAHA: ${sessionName}`)
    return NextResponse.json({ status: 'ok' })
  }

  // Resolve nome do contato:
  // 1. notifyName/pushName do payload
  // 2. Para @c.us: lookup no WAHA contacts
  // 3. Para @lid: busca nome na lista de chats do WAHA
  // 4. Fallback: phone
  let customerName = notifyName
  if (!customerName) {
    if (rawFrom.endsWith('@lid')) {
      const chatName = await getWahaChatName(sessionName, rawFrom)
      if (chatName) {
        customerName = chatName
      }
    } else {
      customerName = (await getWahaContactName(sessionName, phone)) || phone
    }
  }
  if (!customerName) customerName = phone

  return handleMessage({
    business, sessionName, phone,
    rawChatId: rawFrom, customerName,
    text: effectiveText, waMessageId, waTimestamp,
    mediaUrl, mediaType,
  })
}

async function handlePollVote(body: any) {
  const sessionName: string = body.session
  const vote = body.payload?.vote
  const poll = body.payload?.poll
  const sender = body.payload?.sender

  const selectedOption: string = vote?.selectedOptions?.[0] ?? ''
  const optionNumber = POLL_OPTIONS.indexOf(selectedOption) + 1 // 0 = não encontrado
  const rawChatId: string = sender?.id ?? poll?.chatId ?? ''

  if (!optionNumber || !rawChatId) {
    return NextResponse.json({ status: 'ignored' })
  }

  const phone = rawChatId.endsWith('@c.us') ? rawChatId.replace('@c.us', '') : rawChatId

  const business = await prisma.business.findFirst({ where: { wahaSession: sessionName } })
  if (!business) return NextResponse.json({ status: 'ok' })

  const realPhone = await getWahaContactPhone(sessionName, rawChatId)
  const phoneAliases = Array.from(new Set(
    [phone, rawChatId, realPhone].filter(Boolean) as string[]
  ))

  const conversation = await prisma.conversation.findFirst({
    where: {
      businessId: business.id,
      customerPhone: { in: phoneAliases },
      status: { not: 'resolved' },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!conversation) return NextResponse.json({ status: 'ok' })

  // Salva a escolha do cliente como mensagem de entrada
  const savedMessage = await prisma.message.create({
    data: { conversationId: conversation.id, direction: 'in', content: selectedOption, sentAt: new Date() },
    include: { senderUser: { select: { id: true, name: true } } },
  })

  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  // Atualiza status e opção selecionada
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'in_queue', optionSelected: optionNumber, lastCustomerMessageAt: new Date() },
  })

  // Envia auto-reply
  const reply = buildOptionAutoReply(optionNumber)
  if (reply) {
    sendWhatsAppMessage({ session: sessionName, to: rawChatId, message: reply })
      .then(() => saveBotMessage(conversation.id, reply, business.id))
      .catch(() => {})
  }

  return NextResponse.json({ status: 'ok' })
}

function saveBotMessage(conversationId: number, content: string, businessId: number, waMessageId?: string | null) {
  prisma.message.create({
    data: { conversationId, direction: 'out', content, senderUserId: null, waMessageId: waMessageId ?? null },
    include: { senderUser: { select: { id: true, name: true } } },
  })
  .then((msg) => {
    broadcastToBusinessClients(String(businessId), { type: 'new_message', conversationId, message: msg })
  })
  .catch((err) => console.error('[bot-save]', err))
}

async function handleMessage({
  business, sessionName, phone, rawChatId, customerName, text, waMessageId, waTimestamp, mediaUrl, mediaType,
}: {
  business: { id: number; name: string }
  sessionName: string
  phone: string
  rawChatId: string
  customerName: string
  text: string
  waMessageId: string
  waTimestamp: Date
  mediaUrl: string | null
  mediaType: string | null
}) {
  const realPhone = await getWahaContactPhone(sessionName, rawChatId)

  const phoneAliases = Array.from(new Set(
    [phone, rawChatId, realPhone, parsePhoneFromContactName(customerName)].filter(Boolean) as string[]
  ))

  // Busca menu raiz configurado (determina modo dinâmico vs hardcoded)
  const rootMenu = await prisma.botMenu.findFirst({
    where: { businessId: business.id, isRoot: true },
    include: { options: { orderBy: { order: 'asc' } } },
  })

  const menuInclude = { currentMenu: { include: { options: { orderBy: { order: 'asc' as const } } } } }

  const activeConversations = await prisma.conversation.findMany({
    where: {
      businessId: business.id,
      customerPhone: { in: phoneAliases },
      status: { not: 'resolved' },
    },
    include: menuInclude,
    orderBy: { createdAt: 'desc' },
  })

  if (activeConversations.length > 1) {
    const idsToResolve = activeConversations.slice(1).map((c) => c.id)
    await prisma.conversation.updateMany({
      where: { id: { in: idsToResolve } },
      data: { status: 'resolved', resolvedAt: new Date() },
    })
  }

  let existing: typeof activeConversations[0] | null = activeConversations[0] ?? null
  if (!existing) {
    existing = await prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        customerPhone: { in: phoneAliases },
        status: 'resolved',
      },
      include: menuInclude,
      orderBy: { createdAt: 'desc' },
    })
  }

  const avatarUrl = await getWahaContactAvatar(sessionName, phone)

  let isNew = !existing
  let conversation: any = existing

  // Plano de ação do bot (determinado durante a atualização de status)
  type BotAction = 'send_menu' | 'send_final' | 'resend_current' | 'none'
  let botAction: BotAction = 'none'
  let botMenuMessage: string | null = null
  let botFinalMessage: string | null = null

  if (isNew) {
    conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerPhone: phone,
        customerName,
        customerAvatar: avatarUrl,
        customerRealPhone: realPhone,
        status: rootMenu ? 'waiting_menu' : 'in_queue',
        unreadCount: 1,
        lastCustomerMessageAt: waTimestamp,
        customerWaitingSince: waTimestamp,
        currentMenuId: rootMenu?.id ?? null,
      },
    })
    if (rootMenu) {
      botAction = 'send_menu'
      botMenuMessage = rootMenu.message
    }
  } else {
    const wasResolved = existing!.status === 'resolved'
    const wasWaitingMenu = existing!.status === 'waiting_menu'
    const currentMenuData = (existing as any).currentMenu as any

    let newStatus: string = existing!.status
    let optionSelected: number | null = existing!.optionSelected  // preserva a última opção; só atualiza quando o cliente selecionar novamente
    let newCurrentMenuId: number | null | undefined = undefined
    let newSector: string | null | undefined = undefined

    if (wasResolved) {
      newCurrentMenuId = rootMenu?.id ?? null
      if (rootMenu) {
        newStatus = 'waiting_menu'
        isNew = true
        botAction = 'send_menu'
        botMenuMessage = rootMenu.message
      } else {
        newStatus = 'in_queue'
        isNew = true
      }
    } else if (wasWaitingMenu) {
      if (currentMenuData) {
        // Modo dinâmico: navega pela árvore de menus
        const num = parseInt(text.trim())
        const selectedOpt = isNaN(num) ? null : currentMenuData.options.find((o: any) => o.order === num)

        if (selectedOpt) {
          if (selectedOpt.nextMenuId) {
            const nextMenu = await prisma.botMenu.findUnique({ where: { id: selectedOpt.nextMenuId } })
            if (nextMenu) {
              newCurrentMenuId = nextMenu.id
              botAction = 'send_menu'
              botMenuMessage = nextMenu.message
            } else {
              botAction = 'resend_current'
              botMenuMessage = currentMenuData.message
            }
          } else {
            newStatus = 'in_queue'
            optionSelected = selectedOpt.order
            botAction = 'send_final'
            botFinalMessage = selectedOpt.finalMessage?.trim() || 'Obrigado! Um atendente vai te ajudar em breve. 😊'
            if (selectedOpt.sectorName) newSector = selectedOpt.sectorName
          }
        } else {
          botAction = 'resend_current'
          botMenuMessage = currentMenuData.message
        }
      } else if (rootMenu) {
        // Menu dinâmico configurado mas conversa sem currentMenuId (edge case): atribui raiz
        newCurrentMenuId = rootMenu.id
        botAction = 'send_menu'
        botMenuMessage = rootMenu.message
      } else {
        // Sem menu configurado: vai direto para a fila, sem resposta automática
        newStatus = 'in_queue'
      }
    }

    const updateData: any = {
      lastCustomerMessageAt: waTimestamp,
      status: newStatus,
      optionSelected,
      customerName,
      customerWaitingSince: wasResolved ? waTimestamp : (existing!.customerWaitingSince ?? waTimestamp),
      resolvedAt: wasResolved ? null : existing!.resolvedAt,
      unreadCount: wasResolved ? 1 : { increment: 1 },
    }
    if (newCurrentMenuId !== undefined) updateData.currentMenuId = newCurrentMenuId
    if (newSector !== undefined) updateData.sector = newSector
    if (avatarUrl && !existing!.customerAvatar) updateData.customerAvatar = avatarUrl
    if (realPhone && !existing!.customerRealPhone) updateData.customerRealPhone = realPhone

    await prisma.conversation.update({ where: { id: existing!.id }, data: updateData })
    conversation = { ...existing!, optionSelected, customerAvatar: avatarUrl || existing!.customerAvatar }
  }

  // ── 1. Salva a mensagem (idempotente)
  let savedMessage: any
  // Normaliza a URL de mídia para sempre apontar ao WAHA (independente do host na URL original)
  // Ex: http://host.docker.internal:3000/api/files/... ou http://localhost:3000/api/files/...
  //     → http://localhost:3002/api/files/...
  const wahaApiUrl = (process.env.WAHA_API_URL || 'http://localhost:3002').replace(/\/$/, '')
  const resolvedMediaUrl = mediaUrl
    ? mediaUrl.replace(/^https?:\/\/[^/]+/, wahaApiUrl)
    : null

  if (waMessageId) {
    const dup = await prisma.message.findFirst({
      where: { waMessageId },
      include: { senderUser: { select: { id: true, name: true } } },
    })
    if (dup) return NextResponse.json({ status: 'ok' })
    savedMessage = await prisma.message.create({
      data: { conversationId: conversation.id, direction: 'in', content: text, waMessageId, sentAt: waTimestamp, mediaUrl: resolvedMediaUrl, mediaType },
      include: { senderUser: { select: { id: true, name: true } } },
    })
  } else {
    savedMessage = await prisma.message.create({
      data: { conversationId: conversation.id, direction: 'in', content: text, sentAt: waTimestamp, mediaUrl: resolvedMediaUrl, mediaType },
      include: { senderUser: { select: { id: true, name: true } } },
    })
  }

  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  // ── 2. Executa ação do bot
  switch (botAction) {
    case 'send_menu':
    case 'resend_current': {
      const msg = botMenuMessage!
      sendWhatsAppMessage({ session: sessionName, to: rawChatId, message: msg })
        .then((r) => saveBotMessage(conversation.id, msg, business.id, r.messageId ?? undefined))
        .catch(() => {})
      break
    }
    case 'send_final': {
      sendWhatsAppMessage({ session: sessionName, to: rawChatId, message: botFinalMessage! })
        .then(() => saveBotMessage(conversation.id, botFinalMessage!, business.id))
        .catch(() => {})
      break
    }
  }

  return NextResponse.json({ status: 'ok' })
}
