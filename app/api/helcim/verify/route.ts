import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyHelcimTransaction, isTransactionValid } from '@/lib/helcim'

const schema = z.object({
  transactionId:  z.union([z.string(), z.number()]),
  expectedAmount: z.number().positive(),
  expectedCurrency: z.string().length(3),
})

/**
 * POST /api/helcim/verify
 *
 * Server-side verification of a completed Helcim transaction.
 * Call this after the frontend receives HELCIM_PAY_OK.
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

  const { transactionId, expectedAmount, expectedCurrency } = parsed.data

  try {
    const tx = await verifyHelcimTransaction(transactionId)
    if (!tx) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    if (!isTransactionValid(tx, expectedAmount, expectedCurrency)) {
      return NextResponse.json(
        { error: `Payment verification failed: status=${tx.status}, amount=${tx.amount} ${tx.currency}` },
        { status: 402 }
      )
    }

    return NextResponse.json({
      verified: true,
      transactionId: tx.transactionId,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      cardType: tx.cardType,
      cardNumber: tx.cardNumber,
    })
  } catch (err) {
    console.error('[Helcim Verify]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 502 }
    )
  }
}
