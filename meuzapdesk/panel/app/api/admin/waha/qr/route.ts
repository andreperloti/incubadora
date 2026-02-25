import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getWahaQrCode } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// GET /api/admin/waha/qr — retorna QR code em base64 para o frontend exibir
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const businessId = parseInt((session.user as any).businessId)
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business não encontrado' }, { status: 404 })

  const qr = await getWahaQrCode(business.wahaSession)
  if (!qr) {
    return NextResponse.json({ qr: null })
  }

  return NextResponse.json({ qr })
}
