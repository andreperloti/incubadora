import { NextRequest, NextResponse } from 'next/server'
import { broadcastToAll } from '@/lib/sse'

function verifyInternalSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-internal-secret') ?? ''
  return secret !== '' && secret === (process.env.INTERNAL_API_SECRET || '')
}

// Endpoint interno — chamado pelo n8n para emitir eventos SSE
export async function POST(req: NextRequest) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  broadcastToAll(body)
  return NextResponse.json({ success: true })
}
