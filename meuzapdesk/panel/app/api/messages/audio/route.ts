import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppVoice } from '@/lib/whatsapp'
import { broadcastToBusinessClients } from '@/lib/sse'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'

const TMP_DIR = '/tmp/meuzapdesk-audio'
const WEBHOOK_BASE = process.env.WAHA_WEBHOOK_BASE_URL || 'http://host.docker.internal:3000'
const WAHA_CONTAINER = process.env.WAHA_CONTAINER_NAME || 'meuzapdesk-waha-1'

// Converte qualquer formato de áudio para OGG/Opus usando ffmpeg no container WAHA
function convertToOgg(inputBuffer: Buffer): Buffer {
  return execFileSync('docker', [
    'exec', '-i', WAHA_CONTAINER,
    'ffmpeg',
    '-i', 'pipe:0',
    '-c:a', 'libopus',
    '-b:a', '24k',
    '-ar', '48000',
    '-ac', '1',
    '-f', 'ogg',
    'pipe:1',
    '-loglevel', 'error',
  ], { input: inputBuffer, maxBuffer: 10 * 1024 * 1024 })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const conversationId = parseInt(formData.get('conversationId') as string)
  const audioFile = formData.get('audio') as File | null

  if (!conversationId || !audioFile) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
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

  const arrayBuffer = await audioFile.arrayBuffer()
  const inputBuffer = Buffer.from(arrayBuffer)

  // Converte para OGG/Opus (sendVoice exige este formato para PTT)
  let oggBuffer: Buffer
  try {
    oggBuffer = convertToOgg(inputBuffer)
  } catch (err) {
    console.error('[audio] ffmpeg conversion error:', err)
    return NextResponse.json({ error: 'Erro ao converter áudio' }, { status: 500 })
  }

  // Salva o OGG convertido em /tmp para servir ao WAHA via URL
  const id = randomUUID()
  const tmpPath = join(TMP_DIR, `${id}.ogg`)
  await mkdir(TMP_DIR, { recursive: true })
  await writeFile(tmpPath, oggBuffer)

  const audioUrl = `${WEBHOOK_BASE}/api/messages/audio-temp/${id}`

  // Prefere o número real (@c.us) — sendVoice não aceita @lid no WEBJS
  const recipient = conversation.customerRealPhone || conversation.customerPhone

  const waResult = await sendWhatsAppVoice({
    session: conversation.business.wahaSession,
    to: recipient,
    audioUrl,
    mimetype: 'audio/ogg; codecs=opus',
  })

  if (!waResult.success) {
    unlink(tmpPath).catch(() => {})
    return NextResponse.json({ error: `Erro ao enviar: ${waResult.error}` }, { status: 502 })
  }

  // Mantém o arquivo por 1 hora para o AudioPlayer do painel conseguir reproduzir
  setTimeout(() => unlink(tmpPath).catch(() => {}), 60 * 60 * 1000)

  // URL relativa acessível diretamente pelo painel (sem proxy WAHA)
  const panelMediaUrl = `/api/messages/audio-temp/${id}`

  const savedMessage = await prisma.message.create({
    data: {
      conversationId,
      direction: 'out',
      content: '🎵 Áudio',
      senderUserId: userId,
      waMessageId: waResult.messageId ?? null,
      mediaUrl: panelMediaUrl,
      mediaType: 'audio/ogg; codecs=opus',
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
