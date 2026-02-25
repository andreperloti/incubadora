import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  getWahaSession,
  createWahaSession,
  startWahaSession,
  stopWahaSession,
  getWahaQrCode,
} from '@/lib/whatsapp'

async function requireOwner() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') return null
  return session
}

// GET /api/admin/waha — status da sessão do business atual
export async function GET() {
  const session = await requireOwner()
  if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const businessId = parseInt((session.user as any).businessId)
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business não encontrado' }, { status: 404 })

  const wahaSession = await getWahaSession(business.wahaSession)

  return NextResponse.json({
    sessionName: business.wahaSession,
    status: wahaSession?.status ?? 'STOPPED',
    me: wahaSession?.me ?? null,
  })
}

// POST /api/admin/waha — ações: start, stop
export async function POST(req: NextRequest) {
  const session = await requireOwner()
  if (!session) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const businessId = parseInt((session.user as any).businessId)
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business não encontrado' }, { status: 404 })

  const { action } = await req.json()
  const sessionName = business.wahaSession

  // URL do webhook: usa WAHA_WEBHOOK_BASE_URL se definido (necessário quando WAHA roda
  // em Docker e precisa de host.docker.internal para alcançar o Next.js no host)
  const webhookSecret = process.env.WAHA_WEBHOOK_SECRET || ''
  const panelUrl = process.env.WAHA_WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const webhookUrl = `${panelUrl}/api/webhook/whatsapp?secret=${webhookSecret}`

  if (action === 'start') {
    // Garante que a sessão existe no WAHA (cria se necessário)
    await createWahaSession(sessionName, webhookUrl)
    const ok = await startWahaSession(sessionName)
    return NextResponse.json({ success: ok })
  }

  if (action === 'stop') {
    const ok = await stopWahaSession(sessionName)
    return NextResponse.json({ success: ok })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}

// GET /api/admin/waha/qr — imagem do QR code em base64
// Esse endpoint é chamado separadamente pelo frontend para exibir o QR
export { GET as HEAD }
