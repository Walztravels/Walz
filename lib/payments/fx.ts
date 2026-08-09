const FX_MARGIN = 0.10  // 10% — one place to tune

export interface FxQuote {
  from:        string
  to:          string
  rate:        number     // Flutterwave's raw mid-rate
  marginRate:  number     // rate * (1 + FX_MARGIN)
  amountFrom:  number
  amountTo:    number     // rounded up to nearest ₦100
  source:      'flutterwave'
  fetchedAt:   Date
}

// ── In-memory cache (15-minute TTL) ──────────────────────────────────────────
interface CacheEntry { quote: FxQuote; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 15 * 60 * 1000

function cacheKey(from: string, to: string): string {
  return `fx:${from}:${to}`
}

function getCached(from: string, to: string): FxQuote | null {
  const entry = cache.get(cacheKey(from, to))
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(cacheKey(from, to)); return null }
  return entry.quote
}

function setCached(quote: FxQuote): void {
  cache.set(cacheKey(quote.from, quote.to), {
    quote,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

// ── Flutterwave rate fetch ────────────────────────────────────────────────────
export async function getFxQuote(
  from: string,
  to: string,
  amount: number,
): Promise<FxQuote | null> {
  const secret = process.env.FLW_SECRET_KEY
  if (!secret) return null

  const cached = getCached(from, to)
  if (cached) {
    // Scale the cached rate to the requested amount
    const amountToRaw  = amount * cached.marginRate
    const amountTo     = Math.ceil(amountToRaw / 100) * 100
    return { ...cached, amountFrom: amount, amountTo }
  }

  try {
    const url = `https://api.flutterwave.com/v3/transfers/rates?amount=${amount}&source_currency=${from}&destination_currency=${to}`
    const res = await fetch(url, {
      headers:      { Authorization: `Bearer ${secret}` },
      next:         { revalidate: 0 },
      signal:       AbortSignal.timeout(8000),
    })

    if (!res.ok) return null

    const json = await res.json()
    if (json.status !== 'success') return null

    // Flutterwave returns: { data: { rate, source: { amount }, destination: { amount } } }
    const rawRate: number = Number(json.data?.rate ?? 0)
    if (!rawRate) return null

    const marginRate   = rawRate * (1 + FX_MARGIN)
    const amountToRaw  = amount * marginRate
    const amountTo     = Math.ceil(amountToRaw / 100) * 100

    const quote: FxQuote = {
      from,
      to,
      rate:        rawRate,
      marginRate,
      amountFrom:  amount,
      amountTo,
      source:      'flutterwave',
      fetchedAt:   new Date(),
    }

    // Cache using a rate-only entry (amount = 1, scaled on read)
    const rateQuote: FxQuote = {
      ...quote,
      amountFrom: 1,
      amountTo:   Math.ceil(marginRate / 100) * 100,
    }
    setCached(rateQuote)

    return quote
  } catch {
    return null
  }
}

export { FX_MARGIN }
