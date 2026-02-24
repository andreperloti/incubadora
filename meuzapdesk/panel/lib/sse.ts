// Gerenciador de conexões SSE em memória (por processo)
// Para produção com múltiplos pods, migrar para Redis Pub/Sub

type SSEClient = {
  id: string
  controller: ReadableStreamDefaultController
  businessId: string
}

const clients = new Map<string, SSEClient>()

export function addSSEClient(id: string, controller: ReadableStreamDefaultController, businessId: string) {
  clients.set(id, { id, controller, businessId })
}

export function removeSSEClient(id: string) {
  clients.delete(id)
}

export function broadcastToBusinessClients(businessId: string, data: object) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  const encoder = new TextEncoder()

  for (const client of clients.values()) {
    if (client.businessId === businessId) {
      try {
        client.controller.enqueue(encoder.encode(message))
      } catch {
        clients.delete(client.id)
      }
    }
  }
}

export function broadcastToAll(data: object) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  const encoder = new TextEncoder()

  for (const client of clients.values()) {
    try {
      client.controller.enqueue(encoder.encode(message))
    } catch {
      clients.delete(client.id)
    }
  }
}
