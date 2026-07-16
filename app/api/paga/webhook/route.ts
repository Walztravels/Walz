import { NextRequest, NextResponse } from 'next/server'
import { verifyPagaWebhookHash }     from '@/lib/paga'
import { prisma }                    from '@/lib/db'
import { Resend }                    from 'resend'

const SYMBOLS: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: 'GH₵', CAD: 'CA$', KES: 'KSh', AED: 'AED',
}

export const dynamic = 'force-dynamic'

/**
 * Paga Collect webhook — POST notifications for completed payments.
 *
 * Set your webhook URL in the Paga merchant dashboard to:
 *   https://walztravels.com/api/paga/webhook
 *
 * Paga sends a JSON payload with at least:
 *   { amount, timeStamp, paymentReference, hash, ... }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>

    const amount           = String(body.amount ?? '')
    const timestamp        = String(body.timeStamp ?? body.timestamp ?? '')
    const paymentReference = String(body.paymentReference ?? body.reference ?? '')
    const receivedHash     = String(body.hash ?? '')

    // Verify webhook authenticity before processing
    if (!verifyPagaWebhookHash({ amount, timestamp, paymentReference, receivedHash })) {
      console.warn('[paga/webhook] Hash mismatch — possible tampered payload', {
        paymentReference,
        amount,
        timestamp,
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Find the matching PaymentLink by txRef
    const txRef = String(body.merchantReference ?? body.txRef ?? paymentReference)
    if (!txRef) {
      return NextResponse.json({ error: 'No reference found' }, { status: 400 })
    }

    const link = await prisma.paymentLink.findUnique({ where: { txRef } })
    if (!link) {
      // Not necessarily an error — may be a checkout payment without a DB record
      console.info('[paga/webhook] No PaymentLink found for txRef:', txRef)
      return NextResponse.json({ received: true })
    }

    if (link.status !== 'paid') {
      await prisma.paymentLink.update({
        where: { txRef },
        data: {
          status:    'paid',
          paidAt:    new Date(),
          payerName: (body.payerName ?? body.sourceAccountName ?? null) as string | null,
          payerBank: (body.payerBank ?? body.sourceBank         ?? null) as string | null,
        },
      })

      // Send payment confirmation email
      if (link.clientEmail && process.env.RESEND_API_KEY) {
        const resend    = new Resend(process.env.RESEND_API_KEY)
        const currency  = (link.currency ?? 'NGN') as string
        const symbol    = SYMBOLS[currency] ?? currency
        const amtNum    = Number(link.amount)
        const amountFmt = `${symbol}${amtNum.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
        resend.emails.send({
          from:    'Walz Travels Billing <billing@walztravels.com>',
          to:      link.clientEmail,
          subject: `Payment Confirmed — ${amountFmt} | Walz Travels`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.w{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.h{background:#060f1e;padding:28px 30px;text-align:center}
.h h1{color:#C9A84C;margin:0;font-size:20px;font-weight:800}
.h p{color:rgba(255,255,255,.4);margin:5px 0 0;font-size:12px}
.b{padding:28px 30px}
.badge{display:inline-block;background:#DCFCE7;border:2px solid #86EFAC;border-radius:50px;color:#166534;font-weight:700;font-size:13px;padding:6px 18px;margin-bottom:16px}
.amt{text-align:center;background:#FFFBEB;border:2px solid #C9A84C;border-radius:12px;padding:22px;margin:18px 0}
.amt-num{font-size:42px;font-weight:800;color:#92400E;line-height:1}
.amt-desc{color:#78350F;font-size:14px;margin-top:8px}
.ref{background:#F3F4F6;border-radius:10px;padding:16px;margin:16px 0;font-size:12px;color:#6B7280;font-family:monospace;word-break:break-all}
.f{background:#060f1e;padding:16px;text-align:center}
.f p{color:rgba(255,255,255,.3);font-size:10px;margin:0}
</style></head><body>
<div class="w">
  <div class="h"><h1>Walz Travels</h1><p>Payment Confirmation</p></div>
  <div class="b">
    <div style="text-align:center"><span class="badge">✓ Payment Confirmed</span></div>
    <p style="font-size:14px;color:#111">Dear <strong>${link.clientName || 'Valued Client'}</strong>,</p>
    <p style="font-size:13px;color:#6B7280">We have received and confirmed your payment. Our team will be in touch shortly.</p>
    <div class="amt">
      <div class="amt-num">${amountFmt}</div>
      <div class="amt-desc">${link.description || 'Payment to Walz Travels'}</div>
    </div>
    <div class="ref"><strong style="color:#374151">Payment Reference:</strong> ${txRef}</div>
    <p style="font-size:12px;color:#9CA3AF;text-align:center">
      Questions? <a href="https://wa.me/12317902336" style="color:#C9A84C">WhatsApp us</a> or email
      <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a>
    </p>
  </div>
  <div class="f"><p>Walz Travels · Secure Payment · Keep this as your receipt</p></div>
</div></body></html>`,
        }).catch(e => console.error('[paga/webhook] email error:', (e as Error).message))
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: unknown) {
    console.error('[paga/webhook] ERROR:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
