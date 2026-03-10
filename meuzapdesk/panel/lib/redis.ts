import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Cliente singleton para publicar eventos (compartilhado entre rotas)
const globalForRedis = global as unknown as { redisPublisher: Redis }

export const redisPublisher: Redis =
  globalForRedis.redisPublisher ?? new Redis(REDIS_URL)

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redisPublisher = redisPublisher
}

// Cria um subscriber dedicado por conexão SSE (cada um precisa de sua própria conexão)
export function createRedisSubscriber(): Redis {
  return new Redis(REDIS_URL)
}

export function businessChannel(businessId: string): string {
  return `mzd:business:${businessId}`
}
