import { NextRequest, NextResponse } from 'next/server'
import { cacheGet, cacheSet } from '@/lib/redis'

export const dynamic = 'force-dynamic'

const REDIS_KEY = 'walz:flight-extras:config'

export const DEFAULT_EXTRAS = [
  { id: 'transfer',  name: 'Airport Transfer',     category: 'Transport',   price: 45,  enabled: true,  popular: true,  description: 'Private car to/from airport',        photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400&h=300&fit=crop&q=80' },
  { id: 'lounge',    name: 'Airport Lounge',       category: 'Comfort',     price: 35,  enabled: true,  popular: true,  description: 'Access 1,300+ lounges worldwide',     photo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=300&fit=crop&q=80' },
  { id: 'insurance', name: 'Travel Insurance',     category: 'Protection',  price: 24,  enabled: true,  popular: false, description: 'Comprehensive cover for your trip',   photo: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop&q=80' },
  { id: 'upgrade',   name: 'Cabin Upgrade',        category: 'Comfort',     price: 189, enabled: true,  popular: false, description: 'Upgrade to next cabin class',         photo: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=400&h=300&fit=crop&q=80' },
  { id: 'fasttrack', name: 'Fast Track Security',  category: 'Convenience', price: 18,  enabled: true,  popular: false, description: 'Skip the queues, save time',          photo: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400&h=300&fit=crop&q=80' },
  { id: 'baggage',   name: 'Extra Baggage (23kg)', category: 'Baggage',     price: 55,  enabled: true,  popular: false, description: '23kg checked bag — pre-paid',         photo: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400&h=300&fit=crop&q=80' },
  { id: 'esim',      name: 'Jade Connect eSIM',    category: 'Technology',  price: 9,   enabled: true,  popular: false, description: 'Data in 150+ countries from $9.99',   photo: 'https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=400&h=300&fit=crop&q=80' },
  { id: 'visa',      name: 'Visa Service',         category: 'Documents',   price: 99,  enabled: false, popular: false, description: 'We handle your visa application',     photo: 'https://images.unsplash.com/photo-1590099033615-be195f8d575c?w=400&h=300&fit=crop&q=80' },
]

export type FlightExtra = typeof DEFAULT_EXTRAS[number]

// GET — return all extras (from Redis or defaults)
export async function GET() {
  const cached = await cacheGet<FlightExtra[]>(REDIS_KEY)
  const extras = cached ?? DEFAULT_EXTRAS
  return NextResponse.json({ extras })
}

// POST — update one or all extras, persist to Redis
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Full replace
    if (Array.isArray(body)) {
      await cacheSet(REDIS_KEY, body, 60 * 60 * 24 * 365) // 1 year TTL
      return NextResponse.json({ ok: true, extras: body })
    }

    // Partial update: { id, field, value } or { id, ...fields }
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
