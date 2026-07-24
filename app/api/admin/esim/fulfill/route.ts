import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }            from '@/lib/admin-auth'
import { getStripe }                  from '@/lib/stripe'
import { getResend }                  from '@/lib/resend'
import prisma                         from '@/lib/db'
import { fulfillEsimOrder }           from '@/lib/esim/fallback'
import { getInstallInstructions }     from '@/lib/airalo'
import { alertStaffOfOrderFailure }   from '@/lib/esim/airalo-error'
import { sendEsimWhatsApp }           from '@/lib/esim-whatsapp-message'
import { calcMargin, generateOrderRef, formatData } from '@/lib/esim-pricing'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

function buildQrEmail(p: {
  name: string; destination: string; plan: string; duration: number
  dataLabel: string; qrUrl: string; ac: string; smdp: string
  lpaString: string; orderRef: string; retailUsd: number
  appleInstallUrl?: string
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
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Order Ref</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-family:monospace;">${p.orderRef}</td></tr>
    </table>
    ${p.qrUrl ? `<div style="text-align:center;margin:0 0 24px;"><img src="${p.qrUrl}" alt="eSIM QR Code" width="200" style="border:1px solid #E5E7EB;border-radius:8px;padding:8px;"/><p style="margin:8px 0 0;color:#9CA3AF;font-size:11px;">Scan this QR code to install your eSIM</p></div>` : ''}
    ${p.appleInstallUrl ? `<div style="text-align:center;margin:0 0 20px;"><a href="${p.appleInstallUrl}" style="display:inline-block;background:#0B1F3A;color:#C9A84C;font-size:12px;font-weight:700;text-decoration:none;padding:10px 24px;border-radius:8px;">📱 Install on iPhone (one tap)</a></div>` : ''}
    ${p.lpaString ? `<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:16px;margin:0 0 24px;"><p style="margin:0 0 6px;font-weight:700;color:#0369A1;font-size:13px;">Manual installation code</p><p style="margin:0;font-size:11px;font-family:monospace;color:#374151;word-break:break-all;">${p.lpaString}</p></div>` : ''}
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#92400E;font-size:13px;">📱 How to activate</p>
      <p style="margin:0 0 4px;font-size:12px;color:#374151;"><strong>iPhone:</strong> Settings → Mobile Data → Add eSIM → Use QR Code</p>
      <p style="margin:0 0 8px;font-size:12px;color:#374151;"><strong>Android:</strong> Settings → Network → SIM → Add eSIM → Scan QR</p>
      <p style="margin:0;font-size:11px;color:#92400E;">💡 Activate before you travel, but only switch to it when you land.</p>
    </div>
    <p style="margin:0;color:#9CA3AF;font-size:11px;text-align:center;">Need help? WhatsApp <a href="https://wa.me/12317902336" style="color:#C9A84C;">+12317902336</a> any time.</p>
  </td></tr>
  <tr><td style="background:#0B1F3A;padding:14px 32px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:11px;">© ${new Date().getFullYear()} Walz Travels — Jade Connect eSIM powered by Airalo</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { paymentIntentId } = await req.json()
    if (!paymentIntentId?.startsWith('pi_')) {
      return NextResponse.json({ error: 'paymentIntentId required (must start with pi_)' }, { status: 400 })
    }

    // Fetch the PaymentIntent from Stripe
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId)

    if (intent.status !== 'succeeded') {
      return NextResponse.json({ error: `PaymentIntent status is "${intent.status}", not succeeded` }, { status: 400 })
    }

    const meta = intent.metadata ?? {}
    if (meta.type !== 'esim') {
      return NextResponse.json({ error: 'This PaymentIntent is not an eSIM order (metadata.type !== "esim")' }, { status: 400 })
    }

    // Check idempotency — already fulfilled?
    const existing = await prisma.esimOrder.findFirst({ where: { stripePaymentId: intent.id } })
    if (existing) {
      return NextResponse.json({
        alreadyFulfilled: true,
        orderRef: existing.orderRef,
        status:   existing.status,
        iccid:    existing.iccid,
      })
    }

    const wholesale = Number(meta.wholesaleUsd)
    const retail    = Number(meta.retailUsd)
    const orderRef  = generateOrderRef()
    const { label: dataLabel } = formatData(Number(meta.dataAmount) || 0)

    const user = await prisma.user.findUnique({
      where:  { email: meta.customerEmail ?? '' },
      select: { id: true, name: true, email: true, phone: true },
    })

    // Place order
    const result = await fulfillEsimOrder({
      airaloPackageId: meta.packageCode,
      locationCode:    meta.destinationIso2,
      description:     `Walz Travels — ${meta.destination} eSIM`,
      orderRef,
      destination:     meta.destination,
      retailUsd:       retail,
      customerId:      user?.id,
    })

    console.log(`[admin/esim/fulfill] fulfillment: ok=${result.ok} provider=${result.provider}`)

    const iccid           = result.iccid          ?? ''
    const qrCodeUrl       = result.qrCodeUrl      ?? ''
    const activationCode  = result.activationCode ?? ''
    const smdpAddress     = result.smdpAddress    ?? ''
    const lpaString       = result.lpaString      ?? ''
    const appleInstallUrl = result.appleInstallUrl ?? ''
    const actualWholesale = result.wholesalePaid  ?? wholesale
    const orderStatus     = !result.ok ? 'failed' : iccid ? 'active' : 'pending'

    await prisma.esimOrder.create({
      data: {
        userId:            user?.id ?? null,
        tripId:            meta.tripId || null,
        orderRef,
        transactionId:     orderRef,
        provider:          result.provider ?? 'airalo',
        esimAccessOrderNo: result.providerOrderId || null,
        destination:       meta.destination,
        destinationIso2:   meta.destinationIso2,
        packageCode:       meta.packageCode,
        packageName:       meta.packageName,
        durationDays:      Number(meta.durationDays),
        dataAmount:        Number(meta.dataAmount) || null,
        dataUnit:          meta.dataUnit || null,
        wholesaleCostUsd:  actualWholesale,
        retailPriceUsd:    retail,
        marginUsd:         calcMargin(actualWholesale, retail),
        iccid:             iccid || null,
        qrCodeUrl:         qrCodeUrl || null,
        activationCode:    activationCode || null,
        smdpAddress:       smdpAddress || null,
        lpaString:         lpaString || null,
        status:            orderStatus,
        stripePaymentId:   intent.id,
        emailSent:         false,
      },
    })

    if (!result.ok) {
      if (result.alertStaff) {
        await alertStaffOfOrderFailure({
          orderRef, packageCode: meta.packageCode,
          destination: meta.destination, retailUsd: retail,
          customerId: user?.id,
          reason:   result.customerMsg ?? result.errorMsg ?? 'Unknown error',
          alertMsg: result.alertMsg ?? result.errorMsg,
        })
      }
      return NextResponse.json({ ok: false, orderRef, error: result.errorMsg, customerMsg: result.customerMsg })
    }

    const installInstructions = (result.provider === 'airalo' && iccid)
      ? await getInstallInstructions(iccid)
      : null

    const deliverToEmail = user?.email ?? meta.customerEmail
    if (deliverToEmail) {
      try {
        await getResend().emails.send({
          from:    'Jade Connect <noreply@walztravels.com>',
          to:      deliverToEmail,
          subject: `📶 Your Jade Connect eSIM — ${meta.destination}`,
          html:    buildQrEmail({
            name: user?.name ?? 'Traveller', destination: meta.destination,
            plan: meta.packageName ?? meta.packageCode,
            duration: Number(meta.durationDays),
            dataLabel, qrUrl: qrCodeUrl,
            ac: activationCode, smdp: smdpAddress,
            lpaString, orderRef, retailUsd: retail,
            appleInstallUrl,
          }),
        })
      } catch (e) {
        console.error('[admin/esim/fulfill] email error:', e)
      }
    }

    const toPhone = (meta.customerPhone ?? user?.phone ?? '').trim()
    if (toPhone) {
      sendEsimWhatsApp({
        toPhone, customerName: user?.name ?? 'Traveller',
        orderRef, destination: meta.destination,
        instructions: installInstructions,
        qrCodeUrl, appleInstallUrl,
      }).catch(() => {})
    }

    return NextResponse.json({
      ok:        true,
      orderRef,
      provider:  result.provider,
      iccid:     iccid || null,
      qrCodeUrl: qrCodeUrl || null,
      emailSent: !!deliverToEmail,
      phone:     toPhone || null,
    })
  } catch (err: unknown) {
    console.error('[admin/esim/fulfill] error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
