import { NextRequest, NextResponse } from 'next/server'
import { getFxQuote } from '@/lib/payments/fx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from   = (searchParams.get('from')   ?? 'GBP').toUpperCase()
  const to     = (searchParams.get('to')     ?? 'NGN').toUpperCase()
  const amount = Number(searchParams.get('amount') ?? 1320)

  if (!from || !to || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'from, to, and amount are required' }, { status: 400 })
  }

  const quote = await getFxQuote(from, to, amount)
  if (!quote) {
    return NextResponse.json({ available: false }, { status: 200 })
  }

  return NextResponse.json({ available: true, quote })
}
