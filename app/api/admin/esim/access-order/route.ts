import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { applyMarkup, calcMargin, generateOrderRef, formatData } from '@/lib/esim-pricing'
import { placeEsimAccessOrder } from '@/lib/esimaccess'

export const dynamic = 'force-dynamic'

function buildAccessQrEmail(p: {
  name: string; destination: string; plan: string; duration: number
  dataLabel: string; qrUrl: string; orderRef: string; retailUsd: number
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
    <p style="margin:4px 0 0;color:#8B9BAE;font-size:13px;">Arranged by Walz Travels · Stay connected from the moment you land</p>
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
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Order Ref</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-family:monospace;">${p.orderRef}</td></tr>
    </table>
    ${p.qrUrl ? `
    <div style="text-align:center;margin:0 0 24px;">
      <img src="${p.qrUrl}" alt="eSIM QR Code" width="200" style="border:1px solid #E5E7EB;border-radius:8px;padding:8px;"/>
      <p style="margin:8px 0 0;color:#9CA3AF;font-size:11px;">Scan this QR code to install your eSIM</p>
    </div>` : `
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:14px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#92400E;">Your eSIM is being provisioned — we will email your QR code within a few minutes.</p>
    </div>`}
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#92400E;font-size:13px;">📱 How to activate</p>
      <p style="margin:0 0 4px;font-size:12px;color:#374151;"><strong>iPhone:</strong> Settings → Mobile Data → Add eSIM → Use QR Code</p>
      <p style="margin:0 0 8px;font-size:12px;color:#374151;"><strong>Android:</strong> Settings → Network → SIM → Add eSIM → Scan QR</p>
      <p style="margin:0;font-size:11px;color:#92400E;">💡 Activate before you travel, but only switch to it when you land.</p>
    </div>
    <p style="margin:0;color:#9CA3AF;font-size:11px;text-align:center;">Need help? WhatsApp <a href="https://wa.me/12317902336" style="color:#C9A84C;">+12317902336</a> any time.</p>
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
  const adminSession = await getAdminSession()
  if (!adminSession) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const {
    clientEmail, packageCode, packageName, destination, destinationIso2,
    durationDays, dataAmount, dataUnit, wholesaleUsd, retailUsd,
  } = body ?? {}

  if (!clientEmail || !packageCode || !destination) {
    return NextResponse.json({ error: 'clientEmail, packageCode, and destination are required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where:  { email: clientEmail },
    select: { id: true, name: true, email: true },
  })

  const orderRef  = generateOrderRef()
  const wholesale = wholesaleUsd ?? 0
  const retail    = retailUsd ?? applyMarkup(wholesale)
  const { label: dataLabel } = formatData(dataAmount)

  // Place eSIM Access order (includes ICCID polling)
  const result = await placeEsimAccessOrder(packageCode, orderRef, `Walz Admin — ${destination} eSIM for ${clientEmail}`)

  if (!result.ok) {
    console.error('[admin/esim/access-order] eSIM Access error:', result.errorMsg)
    return NextResponse.json({ error: result.customerMsg ?? result.errorMsg ?? 'eSIM Access order failed' }, { status: 500 })
  }

  const iccid          = result.iccid          ?? ''
  const qrCodeUrl      = result.qrCodeUrl      ?? ''
  const activationCode = result.activationCode ?? ''
  const providerOrderId = result.providerOrderId ?? ''

  const order = await prisma.esimOrder.create({
    data: {
      userId:            user?.id ?? null,
      orderRef,
      transactionId:     orderRef,
      provider:          'esimaccess',
      esimAccessOrderNo: providerOrderId || null,
      destination,
      destinationIso2:   destinationIso2 ?? '',
      packageCode,
      packageName:       packageName ?? packageCode,
      durationDays:      Number(durationDays ?? 0),
      dataAmount:        dataAmount ?? null,
      dataUnit:          dataUnit   ?? null,
      wholesaleCostUsd:  wholesale,
      retailPriceUsd:    retail,
      marginUsd:         calcMargin(wholesale, retail),
      iccid:             iccid || null,
      qrCodeUrl:         qrCodeUrl || null,
      activationCode:    activationCode || null,
      smdpAddress:       null,
      lpaString:         null,
      status:            iccid ? 'active' : 'pending',
      stripePaymentId:   null,
      emailSent:         false,
    },
  })

  // Email QR to client
  try {
    await getResend().emails.send({
      from:    'Jade Connect <noreply@walztravels.com>',
      to:      clientEmail,
      subject: `📶 Your Jade Connect eSIM — ${destination}`,
      html:    buildAccessQrEmail({
        name: user?.name ?? 'Traveller', destination,
        plan: packageName ?? packageCode,
        duration: Number(durationDays ?? 0),
        dataLabel, qrUrl: qrCodeUrl,
        orderRef, retailUsd: retail,
      }),
    })
    await prisma.esimOrder.update({ where: { id: order.id }, data: { emailSent: true } })
  } catch (e) {
    console.error('[admin/esim/access-order] email error:', e)
  }

  return NextResponse.json({
    success:   true,
    orderRef,
    iccid:     iccid || null,
    qrCodeUrl: qrCodeUrl || null,
    status:    iccid ? 'active' : 'pending',
  })
}
