import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var redis: Redis | null | undefined
}

function createRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    // No Redis configured — return null so callers degrade gracefully.
    // Avoids a ~9s Vercel cold-start timeout trying localhost:6379.
    return null
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 3) return null
      return Math.min(times * 100, 3000)
    },
    enableReadyCheck: false,
    lazyConnect: true,
  })

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message)
  })

  client.on('connect', () => {
    console.log('[Redis] Connected successfully')
  })

  return client
}

const redis: Redis | null = globalThis.redis !== undefined ? globalThis.redis : createRedisClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.redis = redis
}

export default redis

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null
  try {
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  if (!redis) return
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  } catch (err) {
    console.error('[Redis] Cache set error:', err)
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return
  try {
    await redis.del(key)
  } catch (err) {
    console.error('[Redis] Cache delete error:', err)
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  if (!redis) return false
  try {
    const exists = await redis.exists(key)
    return exists === 1
  } catch {
    return false
  }
}

export const CACHE_KEYS = {
  sabreToken: 'sabre:auth:token',
  flightSearch: (params: string) => `sabre:flights:${params}`,
  mergedFlightSearch: (params: string) => `walz:flights:${params}`,
  hotelSearch: (params: string) => `sabre:hotels:${params}`,
  pnrDetails: (pnr: string) => `sabre:pnr:${pnr}`,
}
