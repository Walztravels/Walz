import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
  const BASE  = 'https://chat.walztravels.com'

  const result: Record<string, unknown> = {
    tokenSet:    !!process.env.CHATWOOT_API_TOKEN,
    tokenFirst4: TOKEN.slice(0, 4),
    timestamp:   new Date().toISOString(),
  }

  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 6000)

    const res = await fetch(`${BASE}/api/v1/profile`, {
      signal:  controller.signal,
      headers: {
        'Content-Type':     'application/json',
        'api_access_token': TOKEN,
      },
    })
    const txt = await res.text()
    try {
      const json = JSON.parse(txt)
      result.chatwootStatus    = res.status
      result.chatwootEmail     = json.email
      result.chatwootName      = json.name
      result.chatwootConnected = res.ok
    } catch {
      result.chatwootStatus = res.status
      result.chatwootRaw    = txt.slice(0, 200)
    }
  } catch (e: unknown) {
    result.chatwootError     = String(e)
    result.chatwootConnected = false
  }

  return NextResponse.json(result)
}
