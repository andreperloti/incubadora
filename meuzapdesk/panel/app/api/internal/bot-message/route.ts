// Endpoint interno chamado pelo n8n para salvar mensagem de bot no banco e
// fazer SSE broadcast para o painel. NÃO envia para o WhatsApp — o n8n faz isso.
//
// Autenticação: header X-Internal-Secret deve bater com INTERNAL_API_SECRET do .env.local

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastToBusinessClients } from '@/lib/sse'

function verifyInternalSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-internal-secret') ?? ''
  return secret === (process.env.INTERNAL_API_SECRET || '')
}

export async function POST(req: NextRequest) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { conversationId, content, waMessageId } = await req.json()

  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, businessId: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  const savedMessage = await prisma.message.create({
    data: {
      conversationId,
      direction: 'out',
      content: content.trim(),
      waMessageId: waMessageId ?? null,
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
