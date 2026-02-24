const WA_API_URL = 'https://graph.facebook.com/v18.0'

interface SendMessageParams {
  to: string
  message: string
  phoneNumberId?: string
  accessToken?: string
}

interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendWhatsAppMessage({
  to,
  message,
  phoneNumberId = process.env.WA_PHONE_NUMBER_ID!,
  accessToken = process.env.WA_ACCESS_TOKEN!,
}: SendMessageParams): Promise<SendMessageResult> {
  try {
    const response = await fetch(`${WA_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error?.message || 'Erro desconhecido' }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
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

export function verifyWebhookToken(token: string): boolean {
  return token === process.env.WA_VERIFY_TOKEN
}
