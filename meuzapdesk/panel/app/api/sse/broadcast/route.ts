import { NextRequest, NextResponse } from 'next/server'
import { broadcastToAll } from '@/lib/sse'

// Endpoint interno — chamado pelo n8n para emitir eventos SSE
// Protegido por IP (deve ser acessível apenas pelo container n8n)
export async function POST(req: NextRequest) {
  const body = await req.json()
  broadcastToAll(body)
  return NextResponse.json({ success: true })
}
