import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogoSource = 'airhex' | 'travelpayouts'

interface SuccessResponse {
  logoUrl: string
  resolved: true
  source: LogoSource
}

interface FailureResponse {
  logoUrl: null
  resolved: false
}

type LogoResponse = SuccessResponse | FailureResponse

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEAD_TIMEOUT_MS = 10_000

/**
 * Send a HEAD request to `url` with a 10-second timeout.
 * Returns `true` if the server responds with 200 or 206.
 * Returns `false` for any non-2xx status or network/timeout error.
 */
async function isLogoReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      })
      return res.status === 200 || res.status === 206
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // Network error, CORS, timeout — treat as unavailable
    return false
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/airlines/logo
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse<LogoResponse | { error: string }>> {
  // 1. Auth
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || !('iataCode' in body)) {
    return NextResponse.json({ error: 'Missing iataCode field' }, { status: 400 })
  }

  const rawIata = (body as Record<string, unknown>).iataCode
  if (typeof rawIata !== 'string') {
    return NextResponse.json({ error: 'iataCode must be a string' }, { status: 400 })
  }

  const iataCode = rawIata.trim().toUpperCase()

  // Validate: 2-3 uppercase letters only
  if (!/^[A-Z]{2,3}$/.test(iataCode)) {
    return NextResponse.json(
      { error: 'iataCode must be 2-3 letters (e.g. "EK", "QR", "AAL")' },
      { status: 400 },
    )
  }

  // 3. Try logo sources in order
  const candidates: Array<{ url: string; source: LogoSource }> = [
    {
      url: `https://content.airhex.com/content/logos/airlines_${iataCode}_200_200_s.png`,
      source: 'airhex',
    },
    {
      url: `https://pics.avs.io/200/200/${iataCode}.png`,
      source: 'travelpayouts',
    },
  ]

  for (const { url, source } of candidates) {
    const reachable = await isLogoReachable(url)
    if (reachable) {
      const response: SuccessResponse = { logoUrl: url, resolved: true, source }
      return NextResponse.json(response, { status: 200 })
    }
  }

  // 4. No valid source found
  const response: FailureResponse = { logoUrl: null, resolved: false }
  return NextResponse.json(response, { status: 200 })
}
