import { NextRequest, NextResponse } from 'next/server'

// DEPRECATED — use /api/webhooks/stripe instead.
// Update your Stripe webhook configuration to:
// https://www.walztravels.com/api/webhooks/stripe
// This shim forwards requests for backward compatibility.

export async function POST(req: NextRequest) {
  console.warn('[Deprecated] /api/visa/webhook/stripe — forwarding to /api/webhooks/stripe')

  const body    = await req.text()
  const headers = new Headers()
  req.headers.forEach((v, k) => headers.set(k, v))

  const res = await fetch(
    new URL('/api/webhooks/stripe', req.url),
    { method: 'POST', headers, body }
  )
  return new NextResponse(await res.text(), { status: res.status })
}
