import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppFile } from '@/lib/whatsapp'
import { broadcastToBusinessClients } from '@/lib/sse'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

const TMP_DIR = '/tmp/meuzapdesk-files'
const WEBHOOK_BASE = process.env.WAHA_WEBHOOK_BASE_URL || 'http://host.docker.internal:3000'
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const conversationId = parseInt(formData.get('conversationId') as string)
  const file = formData.get('file') as File | null

  if (!conversationId || !file) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande (máx 20 MB)' }, { status: 413 })
  }

  const user = session.user as any
  const businessId = parseInt(user.businessId)
  const userId = parseInt(user.id)

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: { business: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  // Salva o arquivo em /tmp para servir ao WAHA via URL
  const id = randomUUID()
  const ext = extname(file.name) || ''
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const tmpPath = join(TMP_DIR, `${id}${ext}`)

  await mkdir(TMP_DIR, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(tmpPath, buffer)

  const fileUrl = `${WEBHOOK_BASE}/api/messages/file-temp/${id}${ext}`
  const recipient = conversation.customerRealPhone || conversation.customerPhone

  const waResult = await sendWhatsAppFile({
    session: conversation.business.wahaSession,
    to: recipient,
    fileUrl,
    mimetype: file.type || 'application/octet-stream',
    filename: safeFilename,
  })

  if (!waResult.success) {
    unlink(tmpPath).catch(() => {})
    return NextResponse.json({ error: `Erro ao enviar: ${waResult.error}` }, { status: 502 })
  }

  // Mantém o arquivo por 1 hora para o painel conseguir visualizar/baixar
  setTimeout(() => unlink(tmpPath).catch(() => {}), 60 * 60 * 1000)

  const panelMediaUrl = `/api/messages/file-temp/${id}${ext}`
  const contentLabel = file.type.startsWith('image/') ? '🖼️ Imagem' : `📎 ${safeFilename}`

  const savedMessage = await prisma.message.create({
    data: {
      conversationId,
      direction: 'out',
      content: contentLabel,
      senderUserId: userId,
      waMessageId: waResult.messageId ?? null,
      mediaUrl: panelMediaUrl,
      mediaType: file.type || 'application/octet-stream',
    },
    include: {
      senderUser: { select: { id: true, name: true } },
    },
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'in_progress',
      assignedUserId: userId,
      customerWaitingSince: null,
      unreadCount: 0,
    },
  })

  broadcastToBusinessClients(String(businessId), {
    type: 'new_message',
    conversationId,
    message: savedMessage,
  })

  return NextResponse.json({ success: true, message: savedMessage })
}
