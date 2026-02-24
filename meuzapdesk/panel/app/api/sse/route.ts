import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addSSEClient, removeSSEClient } from '@/lib/sse'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response('Não autorizado', { status: 401 })
  }

  const businessId = (session.user as any).businessId
  const clientId = randomUUID()

  const stream = new ReadableStream({
    start(controller) {
      addSSEClient(clientId, controller, businessId)

      // Heartbeat a cada 30s para manter a conexão viva
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        removeSSEClient(clientId)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
