// Broadcast via Redis Pub/Sub — funciona com múltiplos processos/workers
// e não perde clientes em hot reloads do Next.js
import { redisPublisher, businessChannel } from './redis'

export function broadcastToBusinessClients(businessId: string, data: object) {
  const message = JSON.stringify(data)
  redisPublisher.publish(businessChannel(businessId), message).catch((err) => {
    console.error('[SSE] Falha ao publicar no Redis:', err)
  })
}

// Mantido para compatibilidade — não utilizado com Redis Pub/Sub
export function broadcastToAll(_data: object) {
  console.warn('[SSE] broadcastToAll não implementado com Redis Pub/Sub')
}
