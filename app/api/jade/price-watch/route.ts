import { NextRequest, NextResponse } from 'next/server'
import { createPriceWatch } from '@/lib/jade/intelligence'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = await createPriceWatch(body)
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
