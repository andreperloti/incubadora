import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createRedisSubscriber, businessChannel } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response('Não autorizado', { status: 401 })
  }

  const businessId = String((session.user as any).businessId)
  const channel = businessChannel(businessId)

  // Cada conexão SSE tem seu próprio subscriber Redis dedicado
  const subscriber = createRedisSubscriber()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // Controller fechado — cleanup no abort
        }
      }

      // Mensagens chegam via evento 'message' — o callback de subscribe é apenas confirmação
      subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          send(`data: ${message}\n\n`)
        }
      })

      // Repassa mensagens do Redis para o browser via SSE
      await subscriber.subscribe(channel)

      // Heartbeat a cada 25s para manter a conexão viva (proxies cortam após 30s)
      const heartbeat = setInterval(() => {
        send(': heartbeat\n\n')
      }, 25000)

      req.signal.addEventListener('abort', async () => {
        clearInterval(heartbeat)
        await subscriber.unsubscribe(channel)
        subscriber.disconnect()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // desativa buffer do nginx
    },
  })
}
