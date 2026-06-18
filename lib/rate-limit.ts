interface RateLimitEntry {
  count:   number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export interface RateLimitConfig {
  key:      string
  limit:    number
  windowMs: number
}

export interface RateLimitResult {
  allowed:   boolean
  remaining: number
  resetAt:   number
}

export function rateLimit(config: RateLimitConfig): RateLimitResult {
  const now      = Date.now()
  const existing = store.get(config.key)

  if (existing && now > existing.resetAt) {
    store.delete(config.key)
  }

  const entry = store.get(config.key)

  if (!entry) {
    store.set(config.key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt }
}

export function adminLoginRateLimit(ip: string): RateLimitResult {
  return rateLimit({
    key:      `admin-login:${ip}`,
    limit:    5,
    windowMs: 15 * 60 * 1000,
  })
}
