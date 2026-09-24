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

export function duffelTicketRateLimit(email: string): RateLimitResult {
  return rateLimit({ key: `duffel-ticket:${email}`, limit: 20, windowMs: 60 * 60 * 1000 })
}

export function ticketGeneratorRateLimit(email: string): RateLimitResult {
  return rateLimit({ key: `ticket-gen:${email}`, limit: 30, windowMs: 60 * 60 * 1000 })
}

export function flightSearchRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `flight-search:${ip}`, limit: 50, windowMs: 10 * 60 * 1000 })
}

export function signupRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `signup:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 })
}

export function forgotPasswordRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `forgot:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 })
}

// Trip builder endpoints
export function tripMyRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `trip-my:${ip}`, limit: 30, windowMs: 60 * 1000 })
}

export function tripClaimRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `trip-claim:${ip}`, limit: 10, windowMs: 60 * 1000 })
}

export function tripRevalidateRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `trip-reval:${ip}`, limit: 20, windowMs: 60 * 1000 })
}

// Public consent capture (POST /api/consent/sms-customer-care). Generous
// enough that a real person correcting a typo and resubmitting is never
// blocked, tight enough that the endpoint cannot be used to mass-write
// consent rows for numbers the submitter does not own.
// Keyed per consent purpose so each purpose has its own budget, and sized so
// a shared mobile-carrier / office NAT address does not silently drop
// genuine consent.
export function consentCaptureRateLimit(ip: string, purpose = 'sms'): RateLimitResult {
  return rateLimit({ key: `consent-capture:${purpose}:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 })
}

// Public WhatsApp marketing preferences (POST /api/whatsapp/preferences).
// A SEPARATE limiter from consentCaptureRateLimit — different table,
// different channel. Same reasoning: generous enough for a real person to
// correct a typo and resubmit, tight enough that the endpoint cannot be
// used to mass-write WhatsApp consent rows for numbers the submitter does
// not own, or to probe many numbers quickly for enumeration.
export function whatsappPreferenceRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `whatsapp-preference:${ip}`, limit: 10, windowMs: 10 * 60 * 1000 })
}

// WhatsApp OTP send/verify (P1 fix). Separate, tighter limiters from the
// general preferences one above — sending a real WhatsApp message costs
// money and verify-attempts are also bounded per-code in the DB, but an
// IP-level cap is defense-in-depth against sweeping many different numbers
// from one source.
export function whatsappOtpSendRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `whatsapp-otp-send:${ip}`, limit: 5, windowMs: 10 * 60 * 1000 })
}
export function whatsappOtpVerifyRateLimit(ip: string): RateLimitResult {
  return rateLimit({ key: `whatsapp-otp-verify:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 })
}
