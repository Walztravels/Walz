// ComfortPass error taxonomy.
// Error codes come from the CP API; internal codes are prefixed CP_.

export class ComfortPassError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message)
    this.name = 'ComfortPassError'
  }
}

export class ComfortPassConfigError extends ComfortPassError {
  constructor(message: string) {
    super(message, 'CP_CONFIG_ERROR', undefined, false)
    this.name = 'ComfortPassConfigError'
  }
}

export class ComfortPassAuthError extends ComfortPassError {
  constructor() {
    super('ComfortPass authentication failed — check API key', 'CP_AUTH_ERROR', 401, false)
    this.name = 'ComfortPassAuthError'
  }
}

export class ComfortPassRateLimitError extends ComfortPassError {
  constructor(retryAfterMs?: number) {
    super('ComfortPass rate limit reached', 'CP_RATE_LIMIT', 429, true)
    this.name = 'ComfortPassRateLimitError'
    this.retryAfterMs = retryAfterMs ?? 2000
  }
  retryAfterMs: number
}

export class ComfortPassTimeoutError extends ComfortPassError {
  constructor(method: string, path: string) {
    super(`ComfortPass ${method} ${path} timed out`, 'CP_TIMEOUT', undefined, false)
    this.name = 'ComfortPassTimeoutError'
  }
}

export class ComfortPassBookingConflictError extends ComfortPassError {
  constructor(public readonly existingRef?: string) {
    super('Duplicate booking detected — request already submitted', 'CP_BOOKING_CONFLICT', 409, false)
    this.name = 'ComfortPassBookingConflictError'
  }
}

export class ComfortPassServiceUnavailableError extends ComfortPassError {
  constructor() {
    super('ComfortPass service unavailable', 'CP_SERVICE_UNAVAILABLE', 503, true)
    this.name = 'ComfortPassServiceUnavailableError'
  }
}

export class ComfortPassInsufficientBalanceError extends ComfortPassError {
  constructor() {
    super('ComfortPass balance insufficient for this booking', 'CP_INSUFFICIENT_BALANCE', 402, false)
    this.name = 'ComfortPassInsufficientBalanceError'
  }
}

// Map known CP API error codes to strongly-typed errors
export function parseApiError(body: unknown, httpStatus: number): ComfortPassError {
  const code   = (body as Record<string, unknown>)?.code   as string | undefined
  const message = (body as Record<string, unknown>)?.message as string | undefined

  if (httpStatus === 401 || httpStatus === 403) return new ComfortPassAuthError()
  if (httpStatus === 429)                        return new ComfortPassRateLimitError()
  if (httpStatus === 503)                        return new ComfortPassServiceUnavailableError()
  if (httpStatus === 409 || code === 'DUPLICATE_BOOKING') {
    return new ComfortPassBookingConflictError()
  }
  if (code === 'INSUFFICIENT_BALANCE') {
    return new ComfortPassInsufficientBalanceError()
  }

  const retryable = httpStatus >= 500
  return new ComfortPassError(
    message ?? `ComfortPass error: HTTP ${httpStatus}`,
    code ?? `CP_HTTP_${httpStatus}`,
    httpStatus,
    retryable,
  )
}
