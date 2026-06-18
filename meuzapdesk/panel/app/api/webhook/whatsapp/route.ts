import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, getWahaContactName, getWahaChatName, parsePhoneFromContactName, getWahaContactAvatar, getWahaContactPhone, buildOptionAutoReply, sendWhatsAppMessage, POLL_OPTIONS, getWahaMessageMedia, normalizePhone } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'
import { logError, logInfo } from '@/lib/logger'

// Payload do WAHA ao receber uma mensagem:
// { event: "message", session: "nome-da-sessao", payload: { id, from, body, timestamp, notifyName, fromMe, ... } }


export async function POST(req: NextRequest) {
  // Aceita secret no header X-Webhook-Secret (preferido) ou query string (legado)
  const secret = req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
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


  // Mensagens enviadas por nós (fromMe) — do painel ou do celular direto
  if (payload?.fromMe) {
    const rawTo: string = payload?.to ?? ''
    // Ignora grupos, newsletters e broadcasts
    if (!rawTo || rawTo.endsWith('@g.us') || rawTo.endsWith('@newsletter') || rawTo.endsWith('@broadcast')) {
      return NextResponse.json({ status: 'ignored' })
    }
    return handleOutgoingFromPhone({ sessionName, payload, rawTo })
      .catch((err: unknown) => {
        logError('webhook', 'Erro ao processar mensagem de saída', { sessionName, error: String(err) }).catch(() => {})
        return NextResponse.json({ status: 'ok' })
      })
  }

  // Ignora mensagens de entrada de grupos, newsletters ou broadcasts
  const rawFrom: string = payload?.from ?? ''
  if (
    rawFrom.endsWith('@g.us') ||
    rawFrom.endsWith('@newsletter') ||
    rawFrom.endsWith('@broadcast')
  ) {
    return NextResponse.json({ status: 'ignored' })
  }

  // Para @c.us: normaliza para padrão 55DDNNNNNNNNN. Para @lid: mantém o ID completo.
  const phone = rawFrom.endsWith('@c.us') ? normalizePhone(rawFrom) : rawFrom
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
    logError('webhook', `Business não encontrado para sessão WAHA: ${sessionName}`, { sessionName, phone }).catch(() => {})
    return NextResponse.json({ error: 'session not found' }, { status: 422 })
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
  // Se o nome ainda é um @lid ou está vazio, usa o número real como fallback mais legível
  if (!customerName || customerName === phone) {
    const realPhoneFallback = phone.endsWith('@lid')
      ? null
      : phone
    customerName = realPhoneFallback || phone
  }

  return handleMessage({
    business, sessionName, phone,
    rawChatId: rawFrom, customerName,
    text: effectiveText, waMessageId, waTimestamp,
    mediaUrl, mediaType,
  }).catch((err: unknown) => {
    logError('webhook', 'Erro ao processar mensagem', { phone, sessionName, error: String(err) }, business?.id).catch(() => {})
    return NextResponse.json({ status: 'ok' })
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

  const phone = rawChatId.endsWith('@c.us') ? normalizePhone(rawChatId) : rawChatId

  const business = await prisma.business.findFirst({ where: { wahaSession: sessionName } })
  if (!business) return NextResponse.json({ status: 'ok' })

  const realPhone = await getWahaContactPhone(sessionName, rawChatId)
  const withoutDdi = phone.startsWith('55') ? phone.slice(2) : phone
  const phoneAliases = Array.from(new Set(
    [phone, withoutDdi, rawChatId, realPhone].filter(Boolean) as string[]
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

async function mergeDuplicateConversations(businessId: number, phones: string[], keepId: number) {
  const others = await prisma.conversation.findMany({
    where: {
      businessId,
      customerPhone: { in: phones },
      status: { not: 'resolved' },
      id: { not: keepId },
    },
    select: { id: true },
  })
  if (others.length === 0) return

  const dupIds = others.map((c) => c.id)
  await prisma.message.updateMany({
    where: { conversationId: { in: dupIds } },
    data: { conversationId: keepId },
  })
  await prisma.conversationAlert.updateMany({
    where: { conversationId: { in: dupIds } },
    data: { conversationId: keepId },
  }).catch(() => {})
  await prisma.conversation.updateMany({
    where: { id: { in: dupIds } },
    data: { status: 'resolved', resolvedAt: new Date() },
  })
  for (const dupId of dupIds) {
    broadcastToBusinessClients(String(businessId), { type: 'conversation_resolved', conversationId: dupId })
  }
}

async function saveBotMessage(conversationId: number, content: string, businessId: number, waMessageId?: string | null): Promise<void> {
  try {
    const msg = await prisma.message.create({
      data: { conversationId, direction: 'out', content, senderUserId: null, waMessageId: waMessageId ?? null },
      include: { senderUser: { select: { id: true, name: true } } },
    })
    broadcastToBusinessClients(String(businessId), { type: 'new_message', conversationId, message: msg })
  } catch (err) {
    logError('webhook', 'Erro ao salvar mensagem do bot', { conversationId, error: String(err) }).catch(() => {})
  }
}

async function handleOutgoingFromPhone({
  sessionName, payload, rawTo,
}: {
  sessionName: string
  payload: any
  rawTo: string
}) {
  const waMessageId: string = typeof payload?.id === 'object'
    ? (payload.id?._serialized ?? payload.id?.id ?? '')
    : (payload?.id ?? '')

  const business = await prisma.business.findFirst({ where: { wahaSession: sessionName } })
  if (!business) return NextResponse.json({ status: 'ok' })

  // Dedup: mensagem já salva pelo /api/messages ou bot → ignora
  if (waMessageId) {
    const existing = await prisma.message.findFirst({ where: { waMessageId } })
    if (existing) return NextResponse.json({ status: 'ok' })
  }

  const text: string = payload?.body ?? ''
  const waTimestamp: Date = payload?.timestamp ? new Date(payload.timestamp * 1000) : new Date()
  const hasMedia: boolean = payload?.hasMedia === true
  const msgType: string = payload?.type ?? payload?._data?.type ?? ''
  const isAudio = hasMedia && (msgType === 'ptt' || msgType === 'audio' || msgType === 'voice')
  const isFile = hasMedia && !isAudio
  const fileLabel = msgType === 'image' ? '🖼️ Imagem'
    : msgType === 'video' ? '🎥 Vídeo'
    : '📎 Arquivo'
  const content = text || (isAudio ? '🎵 Áudio' : isFile ? fileLabel : '')

  if (!content) return NextResponse.json({ status: 'ignored' })

  // Resolve @lid → número real (necessário porque o banco armazena o número, não o @lid)
  const realPhone = await getWahaContactPhone(sessionName, rawTo)
  const normalizedTo = rawTo.endsWith('@c.us') ? normalizePhone(rawTo) : rawTo
  const basePhone = realPhone ?? normalizedTo
  const withoutDdi = basePhone.startsWith('55') ? basePhone.slice(2) : basePhone
  const phoneAliases = Array.from(new Set([normalizedTo, realPhone, withoutDdi, rawTo].filter(Boolean) as string[]))

  const conversation = await prisma.conversation.findFirst({
    where: {
      businessId: business.id,
      customerPhone: { in: phoneAliases },
      status: { not: 'resolved' },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!conversation) return NextResponse.json({ status: 'ok' })

  const wahaApiUrl = (process.env.WAHA_API_URL || 'http://localhost:3002').replace(/\/$/, '')
  const rawMediaUrl: string | null = payload?.media?.url ?? null
  const resolvedMediaUrl = rawMediaUrl ? rawMediaUrl.replace(/^https?:\/\/[^/]+/, wahaApiUrl) : null
  const mediaType: string | null = payload?.media?.mimetype ?? null

  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'out',
      content,
      waMessageId: waMessageId || null,
      sentAt: waTimestamp,
      mediaUrl: resolvedMediaUrl,
      mediaType,
    },
    include: { senderUser: { select: { id: true, name: true } } },
  })

  // Agente respondeu pelo celular: zera timer de espera
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { customerWaitingSince: null },
  })

  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  return NextResponse.json({ status: 'ok' })
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

  const normalizedPhone = phone.endsWith('@c.us') ? normalizePhone(phone) : normalizePhone(phone)
  const withoutDdi = normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone
  const phoneAliases = Array.from(new Set(
    [normalizedPhone, withoutDdi, rawChatId, realPhone, parsePhoneFromContactName(customerName)].filter(Boolean) as string[]
  ))

  // Busca menu raiz configurado (determina modo dinâmico vs hardcoded)
  const rootMenu = await prisma.botMenu.findFirst({
    where: { businessId: business.id, isRoot: true },
    include: { options: { orderBy: { order: 'asc' } } },
  })

  const menuInclude = { currentMenu: { include: { options: { orderBy: { order: 'asc' as const } } } } }

  // Busca ativas ordenadas da mais ANTIGA para a mais nova (mantém a mais antiga como canônica)
  const activeConversations = await prisma.conversation.findMany({
    where: {
      businessId: business.id,
      customerPhone: { in: phoneAliases },
      status: { not: 'resolved' },
    },
    include: menuInclude,
    orderBy: { createdAt: 'asc' },
  })

  // Deduplicação: mantém a MAIS ANTIGA, move mensagens das duplicatas para ela e resolve as extras
  if (activeConversations.length > 1) {
    const canonical = activeConversations[0]
    const duplicateIds = activeConversations.slice(1).map((c) => c.id)
    await prisma.message.updateMany({
      where: { conversationId: { in: duplicateIds } },
      data: { conversationId: canonical.id },
    })
    await prisma.conversationAlert.updateMany({
      where: { conversationId: { in: duplicateIds } },
      data: { conversationId: canonical.id },
    }).catch(() => {})
    await prisma.conversation.updateMany({
      where: { id: { in: duplicateIds } },
      data: { status: 'resolved', resolvedAt: new Date() },
    })
    // Notifica o frontend para remover as conversas duplicadas
    for (const dupId of duplicateIds) {
      broadcastToBusinessClients(String(business.id), { type: 'conversation_resolved', conversationId: dupId })
    }
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

  // Para @lid, se não temos nome real, usa o número real como nome legível
  const nameToCreate = (customerName && !customerName.includes('@'))
    ? customerName
    : (realPhone ? realPhone : customerName)

  if (isNew) {
    conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerPhone: phone,
        customerName: nameToCreate,
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
            // Usa sectorName se definido, caso contrário usa o label da opção
            newSector = selectedOpt.sectorName?.trim() || selectedOpt.label?.trim() || null
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

    // Só atualiza o nome se melhorou (nome real > @lid/phone)
    const existingNameIsPlaceholder = !existing!.customerName || existing!.customerName.includes('@')
    const newNameIsBetter = customerName && !customerName.includes('@')
    const nameToUse = (existingNameIsPlaceholder && newNameIsBetter) ? customerName
      : (!existing!.customerName ? customerName : existing!.customerName)

    const updateData: any = {
      lastCustomerMessageAt: waTimestamp,
      status: newStatus,
      optionSelected,
      customerName: nameToUse,
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
  const wahaApiUrl = (process.env.WAHA_API_URL || 'http://localhost:3002').replace(/\/$/, '')
  const resolvedMediaUrl = mediaUrl
    ? mediaUrl.replace(/^https?:\/\/[^/]+/, wahaApiUrl)
    : null

  // Pré-checagem rápida antes de tentar INSERT (evita P2002 no caso comum)
  if (waMessageId) {
    const dup = await prisma.message.findFirst({ where: { waMessageId } })
    if (dup) return NextResponse.json({ status: 'ok' })
  }

  try {
    savedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id, direction: 'in', content: text,
        ...(waMessageId ? { waMessageId } : {}),
        sentAt: waTimestamp, mediaUrl: resolvedMediaUrl, mediaType,
      },
      include: { senderUser: { select: { id: true, name: true } } },
    })
  } catch (e: any) {
    // P2002 = unique constraint violation: race condition com webhook duplicado
    if (e.code === 'P2002' && waMessageId) return NextResponse.json({ status: 'ok' })
    throw e
  }

  broadcastToBusinessClients(String(business.id), {
    type: 'new_message',
    conversationId: conversation.id,
    message: savedMessage,
  })

  // Post-save dedup: sincronizado para garantir que duplicatas criadas por race condition
  // sejam consolidadas antes de processar ações do bot.
  await mergeDuplicateConversations(business.id, phoneAliases, conversation.id).catch(() => {})

  // ── 2. Executa ação do bot (await garante que save + broadcast acontecem antes do retorno)
  switch (botAction) {
    case 'send_menu':
    case 'resend_current': {
      const msg = botMenuMessage!
      const r = await sendWhatsAppMessage({ session: sessionName, to: rawChatId, message: msg })
        .catch(() => ({ success: false as const, messageId: null }))
      await saveBotMessage(conversation.id, msg, business.id, r.messageId ?? undefined)
      break
    }
    case 'send_final': {
      const r = await sendWhatsAppMessage({ session: sessionName, to: rawChatId, message: botFinalMessage! })
        .catch(() => ({ success: false as const, messageId: null }))
      await saveBotMessage(conversation.id, botFinalMessage!, business.id, r.messageId ?? undefined)
      break
    }
  }

  return NextResponse.json({ status: 'ok' })
}
