import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { code, amountToUse } = await req.json().catch(() => ({}))

  if (!code) return NextResponse.json({ error: 'Voucher code required' }, { status: 400 })

  const voucher = await prisma.voucher.findUnique({ where: { code: String(code).toUpperCase() } })

  if (!voucher) return NextResponse.json({ error: 'Invalid voucher code' }, { status: 404 })
  if (!voucher.active) return NextResponse.json({ error: 'This voucher is no longer active' }, { status: 400 })
  if (voucher.status === 'REDEEMED') return NextResponse.json({ error: 'This voucher has already been redeemed' }, { status: 400 })
  if (voucher.status === 'EXPIRED' || voucher.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This voucher has expired' }, { status: 400 })
  }
  if (voucher.usedCount >= voucher.maxUses) {
    return NextResponse.json({ error: 'This voucher has reached its usage limit' }, { status: 400 })
  }
  if (voucher.validFrom > new Date()) {
    return NextResponse.json({ error: 'This voucher is not yet valid' }, { status: 400 })
  }

  // Return voucher details for frontend to show discount preview
  return NextResponse.json({
    valid: true,
    code:         voucher.code,
    discountType: voucher.discountType,
    amount:       voucher.remainingAmount,
    currency:     voucher.currency,
    serviceType:  voucher.serviceType,
    tourName:     voucher.tourName,
    expiresAt:    voucher.expiresAt,
    message:      voucher.discountType === 'percentage'
      ? `${voucher.amount}% discount applied`
      : `${voucher.currency} ${voucher.remainingAmount.toFixed(2)} credit applied`,
  })
}

// Apply redemption (called after payment confirmation)
export async function PUT(req: NextRequest) {
  const { code, bookingId, amountUsed } = await req.json().catch(() => ({}))
  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })

  const voucher = await prisma.voucher.findUnique({ where: { code: String(code).toUpperCase() } })
  if (!voucher) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const used = Number(amountUsed) || voucher.remainingAmount
  const newRemaining = Math.max(0, voucher.remainingAmount - used)
  const newUsedCount = voucher.usedCount + 1
  const fullyRedeemed = newRemaining === 0 || newUsedCount >= voucher.maxUses

  await prisma.voucher.update({
    where: { code: voucher.code },
    data: {
      remainingAmount:  newRemaining,
      usedCount:        newUsedCount,
      status:           fullyRedeemed ? 'REDEEMED' : voucher.status,
      redeemedAt:       fullyRedeemed ? new Date() : voucher.redeemedAt,
      redeemedBookingId: bookingId ?? voucher.redeemedBookingId,
    },
  })

  return NextResponse.json({ success: true, remainingBalance: newRemaining })
}
