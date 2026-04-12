// Integração com WAHA (WhatsApp HTTP API)
// Docs: https://waha.devlike.pro/docs/how-to/send-messages/

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

function wahaHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': WAHA_API_KEY,
  }
}

// Converte número de telefone para chatId do WAHA
// Ex: "5511999999999" → "5511999999999@c.us"
// Se já tiver sufixo @ (ex: @c.us ou @lid), retorna como está
export function toChatId(phone: string): string {
  if (phone.includes('@')) return phone
  const cleaned = phone.replace(/\D/g, '')
  return `${cleaned}@c.us`
}

// Tenta extrair número de telefone de um nome de contato como "+55 16 99119-8729"
// Retorna null se o nome não parecer um número de telefone
export function parsePhoneFromContactName(name: string): string | null {
  const digits = name.replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 15) return digits
  return null
}

interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendWhatsAppMessage({
  session,
  to,
  message,
}: {
  session: string
  to: string
  message: string
}): Promise<SendMessageResult> {
  try {
    const res = await fetch(`${WAHA_API_URL}/api/sendText`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({
        session,
        chatId: toChatId(to),
        text: message,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: data.message || 'Erro ao enviar mensagem' }
    }

    // data.id é um objeto no WEBJS engine; extrai o _serialized como string
    const messageId = typeof data.id === 'object'
      ? (data.id?._serialized ?? data.id?.id ?? null)
      : (data.id ?? null)

    return { success: true, messageId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function buildMenuMessage(businessName: string): string {
  return `Olá! Bem-vindo à ${businessName}. Como podemos ajudar?\n\n1️⃣ Orçamento — Já sei as peças e serviço\n2️⃣ Orçamento — Preciso de diagnóstico\n3️⃣ Status do meu serviço\n4️⃣ Fornecedores e outros assuntos`
}

export function buildMenuButtons(businessName: string) {
  return {
    body: `Olá! Bem-vindo à ${businessName}. Como podemos ajudar?`,
    footer: 'Toque para selecionar',
    buttons: [
      { type: 'reply' as const, text: '🔧 Orçamento (peças/serviço)', id: '1' },
      { type: 'reply' as const, text: '🔍 Orçamento (diagnóstico)',   id: '2' },
      { type: 'reply' as const, text: '📋 Status do meu serviço',     id: '3' },
      { type: 'reply' as const, text: '📦 Fornecedores e outros',     id: '4' },
    ],
  }
}

export async function sendMenuButtons(
  session: string,
  chatId: string,
  businessName: string
): Promise<{ messageId?: string }> {
  const menu = buildMenuButtons(businessName)
  try {
    const res = await fetch(`${WAHA_API_URL}/api/sendButtons`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({ session, chatId, ...menu }),
    })
    if (res.ok) {
      const data = await res.json()
      const messageId = typeof data.id === 'object'
        ? (data.id?._serialized ?? data.id?.id ?? undefined)
        : (data.id ?? undefined)
      return { messageId }
    }
    // Fallback: WAHA não suportou botões (ex: versão sem Plus), envia texto simples
    console.warn('[sendMenuButtons] fallback para texto, status:', res.status)
    await sendWhatsAppMessage({ session, to: chatId, message: buildMenuMessage(businessName) })
    return {}
  } catch (err) {
    console.error('[sendMenuButtons] erro:', err)
    await sendWhatsAppMessage({ session, to: chatId, message: buildMenuMessage(businessName) }).catch(() => {})
    return {}
  }
}

export const POLL_OPTIONS = [
  '🔧 Orçamento (peças/serviço)',
  '🔍 Orçamento (diagnóstico)',
  '📋 Status do meu serviço',
  '📦 Fornecedores e outros',
]

export function buildMenuPoll(businessName: string) {
  return {
    poll: {
      name: `Olá! Bem-vindo à ${businessName}. Como podemos ajudar?`,
      options: POLL_OPTIONS,
      multipleAnswers: false,
    },
  }
}

export async function sendMenuPoll(
  session: string,
  chatId: string,
  businessName: string
): Promise<{ messageId?: string }> {
  const body = buildMenuPoll(businessName)
  try {
    const res = await fetch(`${WAHA_API_URL}/api/sendPoll`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({ session, chatId, ...body }),
    })
    if (res.ok) {
      const data = await res.json()
      const messageId = typeof data.id === 'object'
        ? (data.id?._serialized ?? data.id?.id ?? undefined)
        : (data.id ?? undefined)
      return { messageId }
    }
    // Fallback: WAHA não suportou poll, envia texto simples
    console.warn('[sendMenuPoll] fallback para texto, status:', res.status)
    await sendWhatsAppMessage({ session, to: chatId, message: buildMenuMessage(businessName) })
    return {}
  } catch (err) {
    console.error('[sendMenuPoll] erro:', err)
    await sendWhatsAppMessage({ session, to: chatId, message: buildMenuMessage(businessName) }).catch(() => {})
    return {}
  }
}

const OPTION_SECTOR: Record<number, string> = {
  1: 'Orçamento — Já sei as peças e serviço',
  2: 'Orçamento — Preciso de diagnóstico',
  3: 'Status do meu serviço',
  4: 'Fornecedores e outros assuntos',
}

export function buildOptionAutoReply(option: number): string {
  const sector = OPTION_SECTOR[option]
  if (!sector) return ''
  return `Você será direcionado para o setor de: ${sector}. Em breve um atendente irá lhe atender! 😊`
}

export function buildSignedMessage(senderName: string, message: string): string {
  return `*${senderName}:*\n${message}`
}

// Envia mensagem de voz (PTT) via WAHA usando URL acessível pelo container
// Tenta /api/sendVoice; se não suportado (404), tenta /api/sendFile como fallback
export async function sendWhatsAppVoice({
  session,
  to,
  audioUrl,
  mimetype = 'audio/ogg; codecs=opus',
}: {
  session: string
  to: string
  audioUrl: string   // URL acessível pelo WAHA para baixar o áudio
  mimetype?: string
}): Promise<SendMessageResult> {
  const ext = mimetype.includes('webm') ? 'webm' : mimetype.includes('mp4') ? 'mp4' : 'ogg'
  const body = JSON.stringify({
    session,
    chatId: toChatId(to),
    file: { url: audioUrl, mimetype, filename: `voice.${ext}` },
    caption: '',
  })

  const tryEndpoint = async (endpoint: string): Promise<Response> =>
    fetch(`${WAHA_API_URL}${endpoint}`, {
      method: 'POST',
      headers: wahaHeaders(),
      body,
    })

  try {
    // Áudio já convertido para OGG/Opus pelo servidor — sendVoice envia como PTT
    let res = await tryEndpoint('/api/sendVoice')
    if (!res.ok) res = await tryEndpoint('/api/sendFile')

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: data.message || 'Erro ao enviar voz' }
    }

    const messageId = typeof data.id === 'object'
      ? (data.id?._serialized ?? data.id?.id ?? null)
      : (data.id ?? null)

    return { success: true, messageId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── Gerenciamento de Sessões WAHA ──────────────────────────────────────────

export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED'

export interface WahaSession {
  name: string
  status: WahaSessionStatus
  me?: { id: string; pushName: string }
}

export async function getWahaSession(session: string): Promise<WahaSession | null> {
  try {
    const res = await fetch(`${WAHA_API_URL}/api/sessions/${session}`, {
      headers: wahaHeaders(),
    })
    if (res.status === 404) return null
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function createWahaSession(
  session: string,
  webhookUrl: string
): Promise<boolean> {
  const webhookConfig = {
    webhooks: [{ url: webhookUrl, events: ['message', 'poll.vote'] }],
  }

  try {
    // Tenta criar a sessão
    const createRes = await fetch(`${WAHA_API_URL}/api/sessions`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({ name: session, config: webhookConfig }),
    })

    if (createRes.ok) return true

    // Se já existe (422), atualiza o webhook via PUT (não precisa re-escanear QR)
    if (createRes.status === 422) {
      const updateRes = await fetch(`${WAHA_API_URL}/api/sessions/${session}`, {
        method: 'PUT',
        headers: wahaHeaders(),
        body: JSON.stringify({ config: webhookConfig }),
      })
      return updateRes.ok
    }

    return false
  } catch {
    return false
  }
}

export async function startWahaSession(session: string): Promise<boolean> {
  try {
    const res = await fetch(`${WAHA_API_URL}/api/sessions/${session}/start`, {
      method: 'POST',
      headers: wahaHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function stopWahaSession(session: string): Promise<boolean> {
  try {
    // Deleta a sessão por completo para forçar novo QR ao reconectar
    const res = await fetch(`${WAHA_API_URL}/api/sessions/${session}`, {
      method: 'DELETE',
      headers: wahaHeaders(),
    })
    return res.ok || res.status === 404
  } catch {
    return false
  }
}

export async function getWahaQrCode(session: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${WAHA_API_URL}/api/${session}/auth/qr?format=image`,
      { headers: wahaHeaders() }
    )
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:image/png;base64,${base64}`
  } catch {
    return null
  }
}

// Valida o secret do webhook enviado como query param
export function verifyWebhookSecret(secret: string): boolean {
  return secret === (process.env.WAHA_WEBHOOK_SECRET || '')
}

// Busca a foto de perfil do contato no WAHA
// Retorna null se não houver foto ou der erro (privacidade, contato não encontrado, etc.)
export async function getWahaContactAvatar(
  session: string,
  phone: string
): Promise<string | null> {
  if (phone.includes('@lid')) return null
  try {
    const contactId = toChatId(phone)
    const res = await fetch(
      `${WAHA_API_URL}/api/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(session)}`,
      { headers: wahaHeaders() }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.profilePictureURL || null
  } catch {
    return null
  }
}

// Busca o número de telefone real de um contato @lid via WAHA
// Para @c.us: extrai direto do chatId. Para @lid: consulta a API de contatos.
export async function getWahaContactPhone(
  session: string,
  chatId: string
): Promise<string | null> {
  if (chatId.endsWith('@c.us')) return chatId.replace('@c.us', '')
  if (!chatId.endsWith('@lid')) return null
  try {
    const res = await fetch(
      `${WAHA_API_URL}/api/contacts?contactId=${encodeURIComponent(chatId)}&session=${encodeURIComponent(session)}`,
      { headers: wahaHeaders() }
    )
    if (!res.ok) return null
    const data = await res.json()
    // WAHA pode retornar 'number' (somente dígitos) ou 'id' em formato @c.us
    if (data?.number) return String(data.number)
    const id: string = data?.id || ''
    if (id.endsWith('@c.us')) return id.replace('@c.us', '')
    return null
  } catch {
    return null
  }
}

// Busca o nome do contato no WAHA (fallback quando notifyName não vem no payload)
// Retorna null se não encontrar ou der erro
export async function getWahaContactName(
  session: string,
  phone: string
): Promise<string | null> {
  // Contatos @lid não têm endpoint de lookup — skip
  if (phone.endsWith('@lid')) return null
  try {
    const contactId = toChatId(phone)
    const res = await fetch(
      `${WAHA_API_URL}/api/contacts?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(session)}`,
      { headers: wahaHeaders() }
    )
    if (!res.ok) return null
    const data = await res.json()
    // WAHA retorna { id, name, pushname, shortName, ... }
    const name = data?.name || data?.pushname || data?.shortName || null
    // Evita retornar o próprio número como nome
    if (name && name !== phone && name !== contactId) return name
    return null
  } catch {
    return null
  }
}

// Busca o nome de um chat @lid na visão geral de chats do WAHA
export async function getWahaChatName(
  session: string,
  chatId: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${WAHA_API_URL}/api/${session}/chats/overview?limit=100`,
      { headers: wahaHeaders() }
    )
    if (!res.ok) return null
    const chats: any[] = await res.json()
    const chat = chats.find((c: any) => {
      const id = typeof c.id === 'object' ? c.id?._serialized : c.id
      return id === chatId
    })
    return chat?.name || null
  } catch {
    return null
  }
}

// Busca a URL de mídia de uma mensagem via WAHA (downloadMedia=true)
// Retorna { url, mimetype } ou null se não encontrar
export async function getWahaMessageMedia(
  session: string,
  chatId: string,
  waMessageId: string
): Promise<{ url: string; mimetype: string } | null> {
  try {
    const res = await fetch(
      `${WAHA_API_URL}/api/${session}/chats/${encodeURIComponent(chatId)}/messages?limit=20&downloadMedia=true`,
      { headers: wahaHeaders() }
    )
    if (!res.ok) return null
    const msgs: any[] = await res.json()
    const msg = msgs.find((m: any) => {
      const id = typeof m.id === 'object' ? m.id?._serialized : m.id
      return id === waMessageId
    })
    if (!msg?.media?.url) return null
    // Normaliza para apontar ao próprio WAHA (independente do host na URL original)
    const wahaBase = WAHA_API_URL.replace(/\/$/, '')
    const url = msg.media.url.replace(/^https?:\/\/[^/]+/, wahaBase)
    return { url, mimetype: msg.media.mimetype || 'audio/ogg' }
  } catch {
    return null
  }
}
