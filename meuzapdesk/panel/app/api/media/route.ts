import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  const filename = req.nextUrl.searchParams.get('filename') || ''
  if (!url) return new Response('Missing url param', { status: 400 })

  // Só permite URLs que apontem para o próprio WAHA (segurança: evita SSRF)
  const wahaBase = WAHA_API_URL.replace(/\/$/, '')
  if (!url.startsWith(wahaBase + '/')) {
    return new Response('Forbidden', { status: 403 })
  }

  // Encaminha Range header para suportar streaming de áudio no browser
  const upstreamHeaders: Record<string, string> = { 'X-Api-Key': WAHA_API_KEY }
  const rangeHeader = req.headers.get('range')
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader

  const upstream = await fetch(url, { headers: upstreamHeaders }).catch(() => null)

  if (!upstream) return new Response('Media not found', { status: 404 })
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Media not found', { status: 404 })
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const body = await upstream.arrayBuffer()

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  }

  // Repassa headers de range response quando WAHA responde 206
  const contentRange = upstream.headers.get('content-range')
  if (contentRange) headers['Content-Range'] = contentRange

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers['Content-Length'] = contentLength

  if (filename) {
    const safe = filename.replace(/[^\w.\-]/g, '_')
    headers['Content-Disposition'] = `attachment; filename="${safe}"`
  }

  return new Response(body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  })
}
