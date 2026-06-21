import { NextRequest, NextResponse } from 'next/server'
import { cacheGet, cacheSet } from '@/lib/redis'
import { DEFAULT_EXTRAS, type FlightExtra } from '@/lib/flights/extras'

export const dynamic = 'force-dynamic'

const REDIS_KEY = 'walz:flight-extras:config'

export async function GET() {
  const cached = await cacheGet<FlightExtra[]>(REDIS_KEY)
  const extras = cached ?? DEFAULT_EXTRAS
  return NextResponse.json({ extras })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (Array.isArray(body)) {
      await cacheSet(REDIS_KEY, body, 60 * 60 * 24 * 365)
      return NextResponse.json({ ok: true, extras: body })
    }

    const { id, ...updates } = body as { id: string } & Partial<FlightExtra>
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const current = await cacheGet<FlightExtra[]>(REDIS_KEY) ?? DEFAULT_EXTRAS
    const updated = current.map(e => e.id === id ? { ...e, ...updates } : e)
    await cacheSet(REDIS_KEY, updated, 60 * 60 * 24 * 365)
    return NextResponse.json({ ok: true, extras: updated })
  } catch (err) {
    console.error('[extras] POST error:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
