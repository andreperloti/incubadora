import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import { join, extname } from 'path'

const TMP_DIR = '/tmp/meuzapdesk-files'

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv',
  zip: 'application/zip',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Sanitiza: apenas alphanumeric, hífens e extensão simples — sem path traversal
  const id = params.id.replace(/[^a-zA-Z0-9._-]/g, '')
  if (!id || id.includes('..')) return new Response('Not found', { status: 404 })

  try {
    const data = await readFile(join(TMP_DIR, id))
    const ext = extname(id).slice(1).toLowerCase()
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
