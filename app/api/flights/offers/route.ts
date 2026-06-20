import { NextRequest, NextResponse } from 'next/server'
import { getOffer } from '@/lib/flights/duffel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  if (id.startsWith('off_') && process.env.DUFFEL_API_KEY) {
    try {
      const offer = await getOffer(id)
      return NextResponse.json({ offer, source: 'duffel' })
    } catch (err) {
      console.error('[flights/offers] Error:', err)
    }
  }

  return NextResponse.json({ offer: null, source: 'mock' })
}
