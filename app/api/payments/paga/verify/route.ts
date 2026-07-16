import { NextRequest, NextResponse } from 'next/server'
import { verifyPagaTransaction }    from '@/lib/paga'
import { prisma }                   from '@/lib/db'
import { Resend }                   from 'resend'

export const dynamic = 'force-dynamic'

const SYMBOLS: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: 'GH₵', CAD: 'CA$', KES: 'KSh', AED: 'AED',
}

async function sendConfirmationEmail(opts: {
  clientEmail: string
  clientName:  string | null
  amount:      number
  currency:    string
  description: string | null
  txRef:       string
  chargeRef?:  string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[paga/verify] RESEND_API_KEY not set — skipping email'); return }

  const resend    = new Resend(apiKey)
  const symbol    = SYMBOLS[opts.currency] ?? opts.currency
  const amountFmt = `${symbol}${Number(opts.amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  await resend.emails.send({
    from:    'Walz Travels Billing <billing@walztravels.com>',
    to:      opts.clientEmail,
    subject: `Payment Confirmed — ${amountFmt} | Walz Travels`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
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
</style></head>
<body>
<div class="w">
  <div class="h">
    <h1>Walz Travels</h1>
    <p>Payment Confirmation</p>
  </div>
  <div class="b">
    <div style="text-align:center"><span class="badge">✓ Payment Confirmed</span></div>
    <p style="font-size:14px;color:#111">Dear <strong>${opts.clientName || 'Valued Client'}</strong>,</p>
    <p style="font-size:13px;color:#6B7280">We have received and confirmed your payment. Thank you — our team will be in touch shortly to process your booking.</p>
    <div class="amt">
      <div class="amt-num">${amountFmt}</div>
      <div class="amt-desc">${opts.description || 'Payment to Walz Travels'}</div>
    </div>
    <div class="ref">
      <strong style="color:#374151">Payment Reference:</strong> ${opts.txRef}
      ${opts.chargeRef ? `<br><strong style="color:#374151">Paga Reference:</strong> ${opts.chargeRef}` : ''}
    </div>
    <p style="font-size:12px;color:#9CA3AF;text-align:center">
      Questions? <a href="https://wa.me/12317902336" style="color:#C9A84C">WhatsApp us</a> or email
      <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a>
    </p>
  </div>
  <div class="f"><p>Walz Travels · Secure Payment · This is your payment receipt — please keep it for your records</p></div>
</div>
</body></html>`,
  })
}

export async function GET(req: NextRequest) {
  const ref       = req.nextUrl.searchParams.get('ref')
  const confirmed = req.nextUrl.searchParams.get('confirmed') === 'true'
  const chargeRef = req.nextUrl.searchParams.get('chargeRef') ?? undefined

  if (!ref) {
    return NextResponse.json({ verified: false, error: 'No reference' }, { status: 400 })
  }

  // ── Trusted redirect path: Paga sent status_code=0 to charge_url ─────────
  // We trust Paga's own redirect rather than calling their verify API.
  if (confirmed) {
    try {
      const link = await prisma.paymentLink.findFirst({
        where: { OR: [{ txRef: ref }, { txRef: chargeRef }] },
      })

      if (link && link.status !== 'paid') {
        await prisma.paymentLink.update({
          where: { id: link.id },
          data:  { status: 'paid', paidAt: new Date() },
        })

        if (link.clientEmail) {
          await sendConfirmationEmail({
            clientEmail: link.clientEmail,
            clientName:  link.clientName,
            amount:      Number(link.amount),
            currency:    link.currency ?? 'NGN',
            description: link.description,
            txRef:       link.txRef,
            chargeRef,
          }).catch(e => console.error('[paga/verify] email error:', e.message))
        }
      }

      return NextResponse.json({
        verified:  true,
        amount:    link ? Number(link.amount) : undefined,
        currency:  link?.currency ?? 'NGN',
        reference: ref,
      })
    } catch (err: unknown) {
      console.error('[paga/verify/confirmed] ERROR:', (err as Error).message)
      return NextResponse.json({ verified: true, reference: ref })
    }
  }

  // ── Programmatic verify via Collect API (dynamic / persistent) ────────────
  try {
    const result = await verifyPagaTransaction(ref)

    if (result.isPaid) {
      try {
        const link = await prisma.paymentLink.findFirst({
          where: { OR: [{ txRef: ref }, { txRef: chargeRef }] },
        })
        await prisma.paymentLink.updateMany({
          where: { txRef: ref },
          data:  { status: 'paid', paidAt: new Date() },
        })
        if (link?.clientEmail && link.status !== 'paid') {
          await sendConfirmationEmail({
            clientEmail: link.clientEmail,
            clientName:  link.clientName,
            amount:      result.amount ?? Number(link.amount),
            currency:    result.currency ?? link.currency ?? 'NGN',
            description: link.description,
            txRef:       link.txRef,
          }).catch(e => console.error('[paga/verify] email error:', e.message))
        }
      } catch (dbErr: unknown) {
        console.warn('[paga/verify] DB update skipped:', (dbErr as Error).message)
      }
    }

    return NextResponse.json({
      verified:  result.isPaid,
      amount:    result.amount,
      currency:  result.currency ?? 'NGN',
      reference: result.paymentReference ?? ref,
      message:   result.message,
    })
  } catch (err: unknown) {
    console.error('[paga/verify] ERROR:', (err as Error).message)
    return NextResponse.json(
      { verified: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
