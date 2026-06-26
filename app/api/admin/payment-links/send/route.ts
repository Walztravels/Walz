import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { Resend }                    from 'resend'

export const dynamic = 'force-dynamic'

const SYMBOLS: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: 'GH₵', CAD: 'CA$', KES: 'KSh', AED: 'AED',
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const { clientEmail, clientName, amount, currency, description } = body

    if (!clientEmail) {
      return NextResponse.json({ error: 'Client email is required' }, { status: 400 })
    }

    const resend     = new Resend(process.env.RESEND_API_KEY)
    const symbol     = SYMBOLS[currency] ?? currency
    const amountFmt  = `${symbol}${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    // ── Virtual account bank-transfer email ──────────────────────────────────
    if (body.virtualAccount) {
      const { accountNumber, bankName, tx_ref } = body.virtualAccount
      const { isPermanent, deadlineFormatted, deadlineHours } = body

      const deadlineBlock = !isPermanent && deadlineFormatted
        ? `<div style="background:#FEF2F2;border:2px solid #FCA5A5;border-radius:10px;padding:16px;margin:16px 0;text-align:center">
            <p style="color:#991B1B;font-weight:700;font-size:13px;margin:0 0 4px">⏰ PAYMENT DEADLINE</p>
            <p style="color:#DC2626;font-size:20px;font-weight:700;margin:0">${deadlineFormatted}</p>
            <p style="color:#991B1B;font-size:12px;margin:6px 0 0">
              Please complete your transfer within ${deadlineHours} hour${deadlineHours !== 1 ? 's' : ''} of receiving this email
            </p>
          </div>`
        : isPermanent
          ? `<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:12px 16px;margin:16px 0;text-align:center">
              <p style="color:#166534;font-size:13px;margin:0">♾ This account number is <strong>permanent</strong> — you can use it anytime</p>
            </div>`
          : ''

      await resend.emails.send({
        from:    'Walz Travels Billing <billing@walztravels.com>',
        to:      clientEmail,
        subject: `Bank Transfer Details — ${amountFmt} | Walz Travels`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.w{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.h{background:#060f1e;padding:28px 30px;text-align:center}
.h h1{color:#C9A84C;margin:0;font-size:20px;font-weight:800}
.h p{color:rgba(255,255,255,.4);margin:5px 0 0;font-size:12px}
.b{padding:28px 30px}
.amt{text-align:center;background:#FFFBEB;border:2px solid #C9A84C;border-radius:12px;padding:20px;margin:16px 0}
.amt-num{font-size:38px;font-weight:800;color:#92400E;line-height:1}
.amt-desc{color:#78350F;font-size:13px;margin-top:6px}
.acct{background:#F3F4F6;border-radius:12px;padding:20px;margin:16px 0;text-align:center}
.acct-label{color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px}
.acct-num{font-size:32px;font-weight:800;color:#111;letter-spacing:0.1em;font-family:monospace}
.acct-bank{color:#374151;font-size:14px;font-weight:600;margin-top:6px}
.ref{font-size:11px;color:#9CA3AF;font-family:monospace;margin-top:8px;word-break:break-all}
.steps{background:#FFFBEB;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13px;color:#78350F}
.steps p{margin:0 0 6px;font-weight:700}
.steps ol{margin:0;padding-left:18px;line-height:1.8}
.f{background:#060f1e;padding:16px;text-align:center}
.f p{color:rgba(255,255,255,.3);font-size:10px;margin:0}
</style></head>
<body>
<div class="w">
  <div class="h">
    <h1>Walz Travels</h1>
    <p>Secure Bank Transfer</p>
  </div>
  <div class="b">
    <p style="font-size:14px;color:#111">Dear <strong>${clientName || 'Client'}</strong>,</p>
    <p style="font-size:13px;color:#6B7280">Please transfer the exact amount below to the dedicated bank account. Your booking will be confirmed upon receipt.</p>
    <div class="amt">
      <div class="amt-num">${amountFmt}</div>
      <div class="amt-desc">${description || 'Payment to Walz Travels'}</div>
    </div>
    ${deadlineBlock}
    <p style="font-size:13px;font-weight:700;color:#111;margin:20px 0 8px">Transfer to this account:</p>
    <div class="acct">
      <p class="acct-label">Account Number</p>
      <p class="acct-num">${accountNumber}</p>
      <p class="acct-bank">${bankName}</p>
      <p class="ref">Ref: ${tx_ref}</p>
    </div>
    <div class="steps">
      <p>How to pay:</p>
      <ol>
        <li>Open your banking app or visit any bank branch</li>
        <li>Transfer exactly <strong>${amountFmt}</strong> to the account above</li>
        <li>Use reference: <strong>${tx_ref}</strong></li>
        <li>Your booking is confirmed automatically on receipt</li>
      </ol>
    </div>
    <p style="font-size:12px;color:#9CA3AF;margin-top:16px;text-align:center">
      Questions? <a href="https://wa.me/447389753787" style="color:#C9A84C">WhatsApp us</a> or email
      <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a>
    </p>
  </div>
  <div class="f"><p>Walz Travels · Bank Transfer · Do not share your account details with third parties</p></div>
</div>
</body></html>`,
      })

      return NextResponse.json({ success: true, message: `Bank transfer details sent to ${clientEmail}` })
    }

    // ── URL-based payment link email (Stripe / Flutterwave) ─────────────────
    const { paymentUrl, provider } = body

    if (!paymentUrl) {
      return NextResponse.json({ error: 'Payment URL is required for non-VA payment links' }, { status: 400 })
    }

    const providerNote = provider === 'stripe'
      ? 'Stripe (accepts cards worldwide)'
      : 'Flutterwave (accepts cards, bank transfer, USSD)'

    await resend.emails.send({
      from:    'billing@walztravels.com',
      to:      clientEmail,
      subject: `Payment Request — ${amountFmt} | Walz Travels`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.w{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.h{background:#060f1e;padding:28px 30px;text-align:center}
.h h1{color:#C9A84C;margin:0;font-size:20px;font-weight:800}
.h p{color:rgba(255,255,255,.4);margin:5px 0 0;font-size:12px}
.b{padding:28px 30px}
.amt{text-align:center;background:#FFFBEB;border:2px solid #C9A84C;border-radius:12px;padding:22px;margin:18px 0}
.amt-num{font-size:42px;font-weight:800;color:#92400E;line-height:1}
.amt-desc{color:#78350F;font-size:14px;margin-top:8px}
.pay-btn{display:block;background:#C9A84C;color:#000;text-decoration:none;font-weight:800;font-size:16px;text-align:center;padding:16px 32px;border-radius:12px;margin:22px 0}
.info{background:#F9FAFB;border-radius:8px;padding:14px 16px;font-size:12px;color:#6B7280;margin-top:14px;line-height:1.6}
.f{background:#060f1e;padding:16px;text-align:center}
.f p{color:rgba(255,255,255,.3);font-size:10px;margin:0}
</style></head>
<body>
<div class="w">
  <div class="h">
    <h1>Walz Travels</h1>
    <p>Secure Payment Request</p>
  </div>
  <div class="b">
    <p style="font-size:14px;color:#111">Dear <strong>${clientName || 'Client'}</strong>,</p>
    <p style="font-size:13px;color:#6B7280">You have a payment request from Walz Travels. Please click the button below to complete your secure payment.</p>
    <div class="amt">
      <div class="amt-num">${amountFmt}</div>
      <div class="amt-desc">${description}</div>
    </div>
    <a href="${paymentUrl}" class="pay-btn">💳 Pay Now Securely</a>
    <div class="info">
      <strong>Payment powered by:</strong> ${providerNote}<br><br>
      This payment link is secure and encrypted. If you have any questions, contact us at <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a>
    </div>
  </div>
  <div class="f"><p>Walz Travels · Secure Payment · Do not share this link with others</p></div>
</div>
</body></html>`,
    })

    return NextResponse.json({ success: true, message: `Payment link sent to ${clientEmail}` })
  } catch (err: any) {
    console.error('[payment-links/send]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
