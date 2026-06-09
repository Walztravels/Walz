import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { Resend } from 'resend'
import { esimHeaders, ESIM_BASE, applyMarkup, calcMargin, generateOrderRef, formatData } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

function buildQrEmail(p: {
  name: string; destination: string; plan: string; duration: number
  dataLabel: string; qrUrl: string; ac: string; smdp: string
  lpaString: string; orderRef: string; retailUsd: number
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <tr><td style="background:#0B1F3A;padding:28px 32px;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="70" style="display:block;margin:0 0 12px;"/>
    <h1 style="margin:0;color:#C9A84C;font-size:20px;font-weight:700;">📶 Your Jade Connect eSIM</h1>
    <p style="margin:4px 0 0;color:#8B9BAE;font-size:13px;">Stay connected from the moment you land</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${p.name},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">
      Your Jade Connect eSIM for <strong>${p.destination}</strong> is ready.
      Scan the QR code below to install it on your phone.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#F8F9FA;border-radius:8px;margin:0 0 24px;">
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;width:140px;">Plan</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-weight:600;">${p.plan}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Destination</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${p.destination}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Duration</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${p.duration} days</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Data</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${p.dataLabel}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Price Paid</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-weight:700;">USD $${p.retailUsd.toFixed(2)}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Order Ref</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-family:monospace;">${p.orderRef}</td></tr>
    </table>
    ${p.qrUrl ? `<div style="text-align:center;margin:0 0 24px;"><img src="${p.qrUrl}" alt="eSIM QR Code" width="200" style="border:1px solid #E5E7EB;border-radius:8px;padding:8px;"/><p style="margin:8px 0 0;color:#9CA3AF;font-size:11px;">Scan this QR code to install your eSIM</p></div>` : ''}
    ${p.lpaString ? `<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:16px;margin:0 0 24px;"><p style="margin:0 0 6px;font-weight:700;color:#0369A1;font-size:13px;">Manual installation code</p><p style="margin:0;font-size:11px;font-family:monospace;color:#374151;word-break:break-all;">${p.lpaString}</p></div>` : ''}
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#92400E;font-size:13px;">📱 How to activate</p>
      <p style="margin:0 0 4px;font-size:12px;color:#374151;"><strong>iPhone:</strong> Settings → Mobile Data → Add eSIM → Use QR Code</p>
      <p style="margin:0 0 8px;font-size:12px;color:#374151;"><strong>Android:</strong> Settings → Network → SIM → Add eSIM → Scan QR</p>
      <p style="margin:0;font-size:11px;color:#92400E;">💡 Activate before you travel, but only switch to it when you land.</p>
    </div>
    <p style="margin:0;color:#9CA3AF;font-size:11px;text-align:center;">Need help? WhatsApp <a href="https://wa.me/447398753797" style="color:#C9A84C;">+44 7398 753797</a> any time.</p>
  </td></tr>
  <tr><td style="background:#0B1F3A;padding:14px 32px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:11px;">© ${new Date().getFullYear()} Walz Travels — Jade Connect eSIM</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { id: true, name: true, email: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const { packageCode, wholesaleUsd, retailUsd, destination, destinationIso2,
          packageName, durationDays, dataAmount, dataUnit, speed,
          stripePaymentId, tripId } = body ?? {}

  if (!packageCode || !wholesaleUsd || !destination) {
    return NextResponse.json({ error: 'packageCode, wholesaleUsd, destination required' }, { status: 400 })
  }

  const orderRef    = generateOrderRef()
  const retail      = retailUsd   ?? applyMarkup(wholesaleUsd)
  const wholesale   = wholesaleUsd
  const margin      = calcMargin(wholesale, retail)
  const { label: dataLabel } = formatData(dataAmount)

  // ── 1. Place order with eSIM Access ─────────────────────────────────────────
  let esimData:  Record<string, unknown> = {}
  let orderErr = ''
  try {
    const orderRes = await fetch(`${ESIM_BASE}/open/esim/order`, {
      method:  'POST',
      headers: esimHeaders(),
      // Exact format per eSIM Access API docs
      body: JSON.stringify({
        transactionId:   orderRef,
        packageInfoList: [{ packageCode, count: 1, price: wholesale }],
        orderNo:         orderRef,
        amount:          wholesale,
        paymentMethod:   3,
      }),
    })
    const orderJson = await orderRes.json()
    console.log('[esim/order] API response:', JSON.stringify(orderJson).slice(0, 500))

    if (orderJson?.success || orderJson?.errorCode === '0') {
      esimData = orderJson?.obj ?? {}
    } else {
      orderErr = orderJson?.errorMsg ?? 'eSIM order API failed'
      console.error('[esim/order] API error:', orderJson)
    }
  } catch (err) {
    orderErr = String(err)
    console.error('[esim/order] fetch error:', err)
  }

  // eSIM Access returns esimList array — extract first item
  const esimList = Array.isArray(esimData?.esimList) ? esimData.esimList as Record<string, unknown>[] : []
  const esim     = esimList[0] ?? {}

  const iccid          = String(esim.iccid    ?? '')
  const qrCodeUrl      = String(esim.qrCodeUrl ?? esim.shortUrl ?? '')
  const activationCode = String(esim.ac        ?? '')
  const smdpAddress    = String(esim.smdpAddress ?? '')
  const lpaString      = smdpAddress && activationCode ? `LPA:1:${smdpAddress}:${activationCode}` : ''
  const esimOrderNo    = String(esimData.orderNo ?? '')
  const status         = iccid ? 'active' : (orderErr ? 'failed' : 'pending')

  // ── 2. Save to DB ────────────────────────────────────────────────────────────
  const order = await prisma.esimOrder.create({
    data: {
      userId:           user.id,
      tripId:           tripId ?? null,
      orderRef,
      transactionId:    orderRef,
      esimAccessOrderNo: esimOrderNo || null,
      destination,
      destinationIso2:  destinationIso2 ?? '',
      packageCode,
      packageName:      packageName ?? packageCode,
      durationDays:     Number(durationDays ?? 0),
      dataAmount:       dataAmount ?? null,
      dataUnit:         dataUnit   ?? null,
      wholesaleCostUsd: wholesale,
      retailPriceUsd:   retail,
      marginUsd:        margin,
      iccid:            iccid || null,
      qrCodeUrl:        qrCodeUrl || null,
      activationCode:   activationCode || null,
      smdpAddress:      smdpAddress || null,
      lpaString:        lpaString || null,
      status,
      stripePaymentId:  stripePaymentId ?? null,
      emailSent:        false,
    },
  })

  // ── 3. Email QR code ─────────────────────────────────────────────────────────
  if (user.email) {
    try {
      await resend.emails.send({
        from:    'Jade Connect <noreply@walztravels.com>',
        to:      user.email,
        subject: `📶 Your Jade Connect eSIM — ${destination}`,
        html:    buildQrEmail({
          name: user.name ?? 'Traveller', destination,
          plan: packageName ?? packageCode,
          duration: Number(durationDays ?? 0),
          dataLabel, qrUrl: qrCodeUrl,
          ac: activationCode, smdp: smdpAddress,
          lpaString, orderRef, retailUsd: retail,
        }),
      })
      await prisma.esimOrder.update({ where: { id: order.id }, data: { emailSent: true } })
    } catch (e) {
      console.error('[esim/order] email error:', e)
    }
  }

  // ── 4. Ops notification ──────────────────────────────────────────────────────
  resend.emails.send({
    from:    'Jade Connect <noreply@walztravels.com>',
    to:      'contact@walztravels.com',
    subject: `[eSIM] ${destination} — ${packageName} — $${retail.toFixed(2)} (margin $${margin.toFixed(2)})`,
    html:    `<p><strong>New eSIM sale</strong></p><ul>
      <li>Client: ${user.email}</li><li>Destination: ${destination}</li>
      <li>Plan: ${packageName} — ${durationDays}d — ${dataLabel}</li>
      <li>Wholesale: $${wholesale.toFixed(3)}</li><li>Retail: $${retail.toFixed(2)}</li>
      <li>Margin: $${margin.toFixed(2)}</li><li>Status: ${status}</li>
      <li>ICCID: ${iccid || 'pending'}</li><li>Ref: ${orderRef}</li></ul>`,
  }).catch(() => {})

  return NextResponse.json({
    success:  true,
    orderId:  order.id,
    orderRef,
    iccid:    iccid || null,
    qrCodeUrl: qrCodeUrl || null,
    activationCode: activationCode || null,
    smdpAddress: smdpAddress || null,
    lpaString: lpaString || null,
    status,
    error:    orderErr || null,
  })
}
