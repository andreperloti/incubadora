import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

const TMP_DIR = '/tmp/meuzapdesk-audio'

// Rota interna: serve o arquivo de áudio temporário para o WAHA baixar.
// Não requer autenticação — WAHA acessa via host.docker.internal.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Sanitiza o id para evitar path traversal
  const id = params.id.replace(/[^a-f0-9-]/gi, '')
  if (!id) return new Response('Not found', { status: 404 })

  try {
    const data = await readFile(join(TMP_DIR, `${id}.ogg`))
    return new Response(data, {
      headers: {
        'Content-Type': 'audio/ogg',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
