import { NextResponse } from 'next/server'
import { botChatwootOrNull } from '@/lib/chatwoot/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const TOKEN = botChatwootOrNull()?.token ?? ''
  const BASE  = 'https://chat.walztravels.com'

  const result: Record<string, unknown> = {
    tokenSet:  TOKEN.length > 0,
    timestamp: new Date().toISOString(),
  }

  if (!TOKEN) {
    result.chatwootConnected = false
    result.note = 'No Chatwoot token configured — live check skipped'
    return NextResponse.json(result)
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
