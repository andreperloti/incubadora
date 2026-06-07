import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createRedisSubscriber } from '@/lib/redis'
import { importProgressChannel } from '@/lib/import-queue'

// Garante que o worker está inicializado
import '@/lib/import-queue'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return new Response('Missing jobId', { status: 400 })

  const encoder = new TextEncoder()
  const subscriber = createRedisSubscriber()

  const stream = new ReadableStream({
    async start(controller) {
      const channel = importProgressChannel(jobId)

      subscriber.subscribe(channel, (err) => {
        if (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Falha ao assinar canal' })}\n\n`))
          controller.close()
          subscriber.disconnect()
        }
      })

      subscriber.on('message', (_ch: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`))

        try {
          const parsed = JSON.parse(message)
          if (parsed.type === 'done' || parsed.type === 'error') {
            controller.close()
            subscriber.disconnect()
          }
        } catch {}
      })
    },
    cancel() {
      subscriber.disconnect()
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
