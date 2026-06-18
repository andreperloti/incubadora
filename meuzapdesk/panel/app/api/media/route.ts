import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

function tmpPath(ext: string) {
  return join(tmpdir(), `mzd_audio_${randomBytes(6).toString('hex')}${ext}`)
}

// Converte OGG/Opus do WhatsApp (16kHz) para WebM/Opus (48kHz) que o Chrome suporta
function convertOggToWebm(inputBuffer: ArrayBuffer): Buffer | null {
  const inPath = tmpPath('.oga')
  const outPath = tmpPath('.webm')
  try {
    writeFileSync(inPath, Buffer.from(inputBuffer))
    execFileSync('ffmpeg', [
      '-y', '-i', inPath,
      '-c:a', 'libopus',
      '-ar', '48000',
      '-f', 'webm',
      '-cluster_size_limit', '2M',
      '-cues_to_front', 'yes',
      outPath,
    ], { timeout: 10_000, stdio: 'ignore' })
    return readFileSync(outPath)
  } catch {
    return null
  } finally {
    try { unlinkSync(inPath) } catch {}
    try { unlinkSync(outPath) } catch {}
  }
}

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

  const upstream = await fetch(url, {
    headers: { 'X-Api-Key': WAHA_API_KEY },
  }).catch(() => null)

  if (!upstream?.ok) return new Response('Media not found', { status: 404 })

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const body = await upstream.arrayBuffer()

  // OGG/Opus do WhatsApp (16kHz) não é suportado nativamente pelo Chrome.
  // Convertemos para WebM/Opus (48kHz) que todos os browsers modernos suportam.
  if (contentType.startsWith('audio/ogg') || url.endsWith('.oga') || url.endsWith('.ogg')) {
    const webm = convertOggToWebm(body)
    if (webm) {
      const headers: Record<string, string> = {
        'Content-Type': 'audio/webm; codecs=opus',
        'Content-Length': String(webm.length),
        'Cache-Control': 'private, max-age=3600',
      }
      if (filename) {
        const safe = filename.replace(/[^\w.\-]/g, '_').replace(/\.(oga|ogg)$/, '.webm')
        headers['Content-Disposition'] = `attachment; filename="${safe}"`
      }
      return new Response(webm.buffer as ArrayBuffer, { status: 200, headers })
    }
    // Fallback: serve o original sem conversão se o ffmpeg falhar
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  }

  if (filename) {
    const safe = filename.replace(/[^\w.\-]/g, '_')
    headers['Content-Disposition'] = `attachment; filename="${safe}"`
  }

  return new Response(body, { status: 200, headers })
}
