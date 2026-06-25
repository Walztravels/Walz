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

    const { clientEmail, clientName, amount, currency, description, paymentUrl, provider } = await req.json()

    if (!clientEmail || !paymentUrl) {
      return NextResponse.json({ error: 'Client email and payment URL are required' }, { status: 400 })
    }

    const symbol     = SYMBOLS[currency] ?? currency
    const amountFmt  = `${symbol}${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const providerNote = provider === 'stripe'
      ? 'Stripe (accepts cards worldwide)'
      : 'Flutterwave (accepts cards, bank transfer, USSD)'

    const resend = new Resend(process.env.RESEND_API_KEY)

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
</style>
</head>
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
