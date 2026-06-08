import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { Resend } from 'resend'
import { nanoid } from 'nanoid'
import { esimHeaders, ESIM_BASE, applyMarkup, calcMargin } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

function orderRef() {
  return `JC-${Date.now()}-${nanoid(6).toUpperCase()}`
}

function buildQrEmailHtml(params: {
  name: string
  destination: string
  plan: string
  duration: number
  data: string
  qrUrl: string
  activationCode: string
  smdp: string
  orderRef: string
}) {
  const { name, destination, plan, duration, data, qrUrl, activationCode, smdp, orderRef } = params
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <tr><td style="background:#0B1F3A;padding:28px 32px;">
    <img src="https://walztravels.us/walz-logo.png" alt="Walz Travels" width="70" style="display:block;margin:0 0 12px;"/>
    <h1 style="margin:0;color:#C9A84C;font-size:20px;font-weight:700;">📶 Your Jade Connect eSIM</h1>
    <p style="margin:4px 0 0;color:#8B9BAE;font-size:13px;">Stay connected from the moment you land</p>
  </td></tr>

  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">
      Your eSIM for <strong>${destination}</strong> is ready. Scan the QR code below to activate it before you travel.
    </p>

    <table style="width:100%;border-collapse:collapse;background:#F8F9FA;border-radius:8px;margin:0 0 24px;">
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;width:140px;">Plan</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-weight:600;">${plan}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Destination</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${destination}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Duration</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${duration} days</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Data</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${data}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Order Ref</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-family:monospace;">${orderRef}</td></tr>
    </table>

    ${qrUrl ? `<div style="text-align:center;margin:0 0 24px;">
      <img src="${qrUrl}" alt="eSIM QR Code" width="200" style="border:1px solid #E5E7EB;border-radius:8px;padding:8px;"/>
    </div>` : ''}

    <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#0369A1;font-size:13px;">Manual Activation (if QR doesn't work)</p>
      <p style="margin:0 0 4px;font-size:12px;color:#374151;font-family:monospace;">SM-DP+ Address: ${smdp}</p>
      <p style="margin:0;font-size:12px;color:#374151;font-family:monospace;">Activation Code: ${activationCode}</p>
    </div>

    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;margin:0 0 24px;">
      <p style="margin:0 0 6px;font-weight:700;color:#92400E;font-size:13px;">📱 How to activate</p>
      <p style="margin:0 0 4px;font-size:12px;color:#374151;"><strong>iPhone:</strong> Settings → Mobile Data → Add eSIM → Use QR Code</p>
      <p style="margin:0;font-size:12px;color:#374151;"><strong>Android:</strong> Settings → Network → SIM → Add eSIM → Scan QR</p>
    </div>

    <p style="margin:0;color:#9CA3AF;font-size:11px;text-align:center;">
      Need help? WhatsApp us at <a href="https://wa.me/447398753797" style="color:#C9A84C;">+44 7398 753797</a>
    </p>
  </td></tr>

  <tr><td style="background:#0B1F3A;padding:14px 32px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:11px;">© ${new Date().getFullYear()} Walz Travels — Jade Connect eSIM</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ── POST /api/esim/order ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body?.packageCode || !body?.wholesaleUsd || !body?.destination) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const {
    packageCode,
    packageName,
    destination,
    destinationIso2,
    durationDays,
    dataGb,
    dataLabelStr,
    wholesaleUsd,
    retailUsd,
    stripePaymentId,
    tripId,
  } = body

  const ref = orderRef()
  const retail  = retailUsd  ?? applyMarkup(wholesaleUsd)
  const margin  = calcMargin(wholesaleUsd, retail)

  // ── 1. Place order with eSIM Access ───────────────────────────────────────
  let esimData: Record<string, unknown> = {}
  try {
    const orderRes = await fetch(`${ESIM_BASE}/open/esim/order`, {
      method:  'POST',
      headers: esimHeaders(),
      body: JSON.stringify({
        packageInfoList: [{ packageCode, count: 1, price: Math.round(wholesaleUsd * 10000) }],
        orderNo:      ref,
        amount:       Math.round(wholesaleUsd * 10000),
        paymentMethod: 3,
      }),
    })
    const orderJson = await orderRes.json()
    esimData = orderJson?.obj ?? {}
  } catch (err) {
    console.error('[esim/order] upstream order failed:', err)
    // Continue — we still save to DB as pending so we can retry
  }

  const iccid          = String(esimData.iccid ?? '')
  const qrCodeUrl      = String(esimData.qrCodeUrl ?? esimData.imageUrl ?? '')
  const activationCode = String(esimData.ac ?? esimData.activationCode ?? '')
  const smdpAddress    = String(esimData.smdpAddress ?? esimData.rsaAddress ?? '')
  const esimOrderNo    = String(esimData.orderNo ?? esimData.esimOrderNo ?? '')
  const status         = iccid ? 'active' : 'pending'

  // ── 2. Save to DB ─────────────────────────────────────────────────────────
  const order = await prisma.esimOrder.create({
    data: {
      userId:           user.id,
      tripId:           tripId ?? null,
      orderRef:         ref,
      esimAccessOrderNo: esimOrderNo || null,
      destination,
      destinationIso2:  destinationIso2 ?? '',
      packageCode,
      packageName:      packageName ?? packageCode,
      durationDays:     Number(durationDays ?? 0),
      dataGb:           dataGb ?? null,
      wholesaleCostUsd: wholesaleUsd,
      retailPriceUsd:   retail,
      marginUsd:        margin,
      iccid:            iccid || null,
      qrCodeUrl:        qrCodeUrl || null,
      activationCode:   activationCode || null,
      smdpAddress:      smdpAddress || null,
      status,
      stripePaymentId:  stripePaymentId ?? null,
    },
  })

  // ── 3. Send QR code email ─────────────────────────────────────────────────
  if (user.email) {
    resend.emails.send({
      from:    'Jade Connect <noreply@walztravels.com>',
      to:      user.email,
      subject: `📶 Your Jade Connect eSIM — ${destination}`,
      html:    buildQrEmailHtml({
        name:           user.name ?? 'Traveller',
        destination,
        plan:           packageName ?? packageCode,
        duration:       Number(durationDays ?? 0),
        data:           dataLabelStr ?? `${dataGb ?? 0} GB`,
        qrUrl:          qrCodeUrl,
        activationCode: activationCode,
        smdp:           smdpAddress,
        orderRef:       ref,
      }),
    }).catch(e => console.error('[esim/order] email failed:', e))
  }

  // ── 4. WhatsApp notification (via Resend webhook if configured) ───────────
  // Notification to ops team about new eSIM sale
  resend.emails.send({
    from:    'Jade Connect <noreply@walztravels.com>',
    to:      'contact@walztravels.com',
    subject: `[eSIM Sale] ${destination} — ${packageName} — $${retail}`,
    html:    `<p>New Jade Connect eSIM order:</p>
              <ul>
                <li>Client: ${user.email}</li>
                <li>Destination: ${destination}</li>
                <li>Plan: ${packageName}</li>
                <li>Duration: ${durationDays} days</li>
                <li>Retail: USD $${retail}</li>
                <li>Margin: USD $${margin}</li>
                <li>Order Ref: ${ref}</li>
                <li>Status: ${status}</li>
              </ul>`,
  }).catch(() => {})

  return NextResponse.json({
    success:  true,
    orderId:  order.id,
    orderRef: ref,
    iccid,
    qrCodeUrl,
    activationCode,
    smdpAddress,
    status,
  })
}
