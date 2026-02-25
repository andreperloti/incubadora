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
export function toChatId(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  return `${cleaned}@c.us`
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

    return { success: true, messageId: data.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function buildMenuMessage(businessName: string): string {
  return `Olá! Bem-vindo à ${businessName}. Como podemos ajudar?\n\n1️⃣ Orçamento — Já sei as peças e serviço\n2️⃣ Orçamento — Preciso de diagnóstico\n3️⃣ Status do meu serviço\n4️⃣ Fornecedores e outros assuntos`
}

export function buildSignedMessage(senderName: string, message: string): string {
  return `${senderName}: ${message}`
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
  try {
    const res = await fetch(`${WAHA_API_URL}/api/sessions`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({
        name: session,
        config: {
          webhooks: [
            {
              url: webhookUrl,
              events: ['message'],
            },
          ],
        },
      }),
    })
    return res.ok || res.status === 422 // 422 = sessão já existe
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
    const res = await fetch(`${WAHA_API_URL}/api/sessions/${session}/stop`, {
      method: 'POST',
      headers: wahaHeaders(),
    })
    return res.ok
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
