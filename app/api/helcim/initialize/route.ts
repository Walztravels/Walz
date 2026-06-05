import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { initializeHelcimCheckout } from '@/lib/helcim'

const schema = z.object({
  amount:        z.number().positive(),
  currency:      z.string().length(3),
  invoiceNumber: z.string().optional(),
  customerCode:  z.string().optional(),
})

/**
 * POST /api/helcim/initialize
 *
 * Creates a Helcim Pay checkout session.
 * Returns { checkoutToken, secretToken } for the frontend to mount HelcimPay.js.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const session = await initializeHelcimCheckout(parsed.data)
    return NextResponse.json(session)
  } catch (err) {
    console.error('[Helcim Initialize]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to initialise Helcim checkout' },
      { status: 502 }
    )
  }
}
