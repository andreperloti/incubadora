// Endpoint interno chamado pelo n8n para enviar mensagem de bot via WhatsApp,
// salvar no banco e fazer SSE broadcast. Unifica o que antes eram 2 chamadas separadas
// (WAHA + bot-message), simplificando o workflow do n8n.
//
// Autenticação: header X-Internal-Secret deve bater com INTERNAL_API_SECRET do .env.local

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { broadcastToBusinessClients } from '@/lib/sse'

function verifyInternalSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-internal-secret') ?? ''
  return secret === (process.env.INTERNAL_API_SECRET || '')
}

export async function POST(req: NextRequest) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { conversationId, content } = await req.json()

  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { business: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  // Envia via WAHA
  const waResult = await sendWhatsAppMessage({
    session: conversation.business.wahaSession,
    to: conversation.customerPhone,
    message: content.trim(),
  })

  // Log mas não bloqueia se WAHA falhar (mensagem ainda salva no painel)
  if (!waResult.success) {
    console.error('[bot-send] WAHA falhou:', waResult.error)
  }

  const savedMessage = await prisma.message.create({
    data: {
      conversationId,
      direction: 'out',
      content: content.trim(),
      waMessageId: waResult.messageId ?? null,
    },
    include: {
      senderUser: { select: { id: true, name: true } },
    },
  })

  broadcastToBusinessClients(String(conversation.businessId), {
    type: 'new_message',
    conversationId,
    message: savedMessage,
  })

  return NextResponse.json({ success: true, message: savedMessage })
}
