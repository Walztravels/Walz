import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { sendVoucherEmail, sendVoucherAdminNotification } from '@/lib/voucher-email'
import { verifyHelcimTransaction, isTransactionValid } from '@/lib/helcim'

const CURRENCIES: Record<string, string> = {
  usd: 'USD', gbp: 'GBP', cad: 'CAD',
}

const schema = z.object({
  // Voucher details
  serviceType: z.enum(['visa', 'flight', 'tour']),
  amount:      z.number().positive(),
  currency:    z.string().min(3).max(3).toUpperCase(),
  tourName:    z.string().optional(),

  // Buyer
  senderName:  z.string().min(1),
  senderEmail: z.string().email(),

  // Recipient
  recipientName:  z.string().min(1),
  recipientEmail: z.string().email(),
  personalMessage: z.string().max(500).optional(),

  // Delivery
  sendNow:              z.boolean().default(true),
  scheduledDeliveryDate: z.string().optional(),

  // Payment
  gateway:       z.enum(['flutterwave', 'stripe', 'helcim']),
  transactionId:      z.string().optional(),  // flutterwave
  paymentIntentId:    z.string().optional(),  // stripe
  helcimTransactionId: z.union([z.string(), z.number()]).optional(), // helcim
})

function generateCode(serviceType: string): string {
  const prefix = serviceType === 'visa' ? 'VISA' : serviceType === 'flight' ? 'FLT' : 'TOUR'
  const random = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `WALZ-${prefix}-${random}`
}

async function verifyFlutterwave(transactionId: string, expectedAmount: number, expectedCurrency: string) {
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
  })
  const data = await res.json()
  if (data.status !== 'success' || data.data.status !== 'successful') return null
  if (data.data.currency.toUpperCase() !== expectedCurrency.toUpperCase()) return null
  if (Math.abs(data.data.amount - expectedAmount) > 1) return null
  return data.data
}

async function verifyStripe(paymentIntentId: string) {
  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (pi.status !== 'succeeded') return null
  return pi
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const d = parsed.data

  // ── Verify payment ───────────────────────────────────────────────────────────
  let paymentRef = ''
  if (d.gateway === 'flutterwave') {
    if (!d.transactionId) return NextResponse.json({ error: 'transactionId required' }, { status: 400 })
    const verified = await verifyFlutterwave(d.transactionId, d.amount, d.currency)
    if (!verified) return NextResponse.json({ error: 'Payment verification failed' }, { status: 402 })
    paymentRef = String(verified.id)
  } else if (d.gateway === 'helcim') {
    if (!d.helcimTransactionId) return NextResponse.json({ error: 'helcimTransactionId required' }, { status: 400 })
    const tx = await verifyHelcimTransaction(d.helcimTransactionId)
    if (!tx || !isTransactionValid(tx, d.amount, d.currency)) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 402 })
    }
    paymentRef = String(tx.transactionId)
  } else {
    if (!d.paymentIntentId) return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })
    const verified = await verifyStripe(d.paymentIntentId)
    if (!verified) return NextResponse.json({ error: 'Payment verification failed' }, { status: 402 })
    paymentRef = verified.id
  }

  // ── Generate unique code ─────────────────────────────────────────────────────
  let code = generateCode(d.serviceType)
  let attempts = 0
  while (attempts < 5) {
    const exists = await prisma.voucher.findUnique({ where: { code } })
    if (!exists) break
    code = generateCode(d.serviceType)
    attempts++
  }

  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  const scheduledDate = d.scheduledDeliveryDate ? new Date(d.scheduledDeliveryDate) : null
  const shouldSendNow = d.sendNow || !scheduledDate || scheduledDate <= new Date()

  // ── Save to DB ───────────────────────────────────────────────────────────────
  const voucher = await prisma.voucher.create({
    data: {
      code,
      voucherKind:   'gift',
      serviceType:   d.serviceType,
      discountType:  'fixed',
      amount:        d.amount,
      currency:      d.currency,
      remainingAmount: d.amount,
      tourName:      d.tourName ?? null,
      maxUses:       1,
      status:        shouldSendNow ? 'SENT' : 'PURCHASED',
      active:        true,
      senderName:    d.senderName,
      senderEmail:   d.senderEmail,
      recipientName:  d.recipientName,
      recipientEmail: d.recipientEmail,
      personalMessage: d.personalMessage ?? null,
      scheduledDeliveryDate: scheduledDate,
      sentAt:        shouldSendNow ? new Date() : null,
      paymentReference: paymentRef,
      paymentGateway: d.gateway,
      paidAmount:    d.amount,
      expiresAt,
    },
  })

  // ── Send emails ──────────────────────────────────────────────────────────────
  if (shouldSendNow) {
    try {
      await sendVoucherEmail({
        recipientName:   d.recipientName,
        recipientEmail:  d.recipientEmail,
        senderName:      d.senderName,
        code,
        serviceType:     d.serviceType,
        amount:          d.amount,
        currency:        d.currency,
        tourName:        d.tourName,
        personalMessage: d.personalMessage,
        expiresAt,
      })
    } catch (err) {
      console.error('Voucher email failed:', err)
    }

    try {
      await sendVoucherAdminNotification({
        code,
        senderName:     d.senderName,
        senderEmail:    d.senderEmail,
        recipientName:  d.recipientName,
        recipientEmail: d.recipientEmail,
        serviceType:    d.serviceType,
        amount:         d.amount,
        currency:       d.currency,
        gateway:        d.gateway,
        paymentRef,
      })
    } catch (err) {
      console.error('Admin notification failed:', err)
    }
  }

  return NextResponse.json({ success: true, code, voucherId: voucher.id }, { status: 201 })
}
