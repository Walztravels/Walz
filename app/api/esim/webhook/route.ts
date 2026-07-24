import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { calcMargin, generateOrderRef, formatData } from '@/lib/esim-pricing'
import { getInstallInstructions }                     from '@/lib/airalo'
import { alertStaffOfOrderFailure }                   from '@/lib/esim/airalo-error'
import { fulfillEsimOrder }                           from '@/lib/esim/fallback'
import { buildEsimAccessInstallInstructions }         from '@/lib/esimaccess'
import { sendEsimWhatsApp }                           from '@/lib/esim-whatsapp-message'

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
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Data</td>
          <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${p.dataLabel}</td></tr>
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

async function fulfillEsim(intent: Stripe.PaymentIntent) {
  const meta = intent.metadata ?? {}
  if (meta.type !== 'esim') return

  // Idempotency — check if already fulfilled
  const existing = await prisma.esimOrder.findFirst({
    where: { stripePaymentId: intent.id },
  })
  if (existing) {
    console.log('[esim/webhook] already fulfilled:', intent.id)
    return
  }

  const wholesale = Number(meta.wholesaleUsd)
  const retail    = Number(meta.retailUsd)
  const orderRef  = generateOrderRef()
  const { label: dataLabel } = formatData(Number(meta.dataAmount) || 0)

  const user = await prisma.user.findUnique({
    where:  { email: meta.customerEmail ?? '' },
    select: { id: true, name: true, email: true, phone: true },
  })

  // Place order — Airalo primary, eSIM Access fallback on supply-side failures
  const result = await fulfillEsimOrder({
    airaloPackageId: meta.packageCode,
    locationCode:    meta.destinationIso2,
    description:     `Walz Travels — ${meta.destination} eSIM`,
    orderRef,
    destination:     meta.destination,
    retailUsd:       retail,
    customerId:      user?.id,
  })
  console.log(
    `[esim/webhook] fulfillment: ok=${result.ok} provider=${result.provider}`,
    result.fallbackUsed ? '(fallback used)' : '',
    result.errorCode ?? '',
  )

  const iccid          = result.iccid          ?? ''
  const qrCodeUrl      = result.qrCodeUrl      ?? ''
  const activationCode = result.activationCode ?? ''
  const smdpAddress    = result.smdpAddress    ?? ''
  const lpaString      = result.lpaString      ?? ''
  const appleInstallUrl= result.appleInstallUrl ?? ''
  const actualWholesale= result.wholesalePaid  ?? wholesale
  const orderStatus    = !result.ok ? 'failed' : iccid ? 'active' : 'pending'

  // Write the order record — catch unique constraint on stripePaymentId to prevent
  // double-fulfilment when Stripe retries the webhook delivery concurrently.
  try {
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
  } catch (dbErr: unknown) {
    const isUniqueViolation = dbErr instanceof Error && dbErr.message.includes('Unique constraint')
    if (isUniqueViolation) {
      console.log('[esim/webhook] duplicate delivery — already fulfilled:', intent.id)
      return
    }
    throw dbErr
  }

  // Both providers failed after payment was captured
  if (!result.ok) {
    console.error('[esim/webhook] fulfillment failed:', result.errorMsg)
    if (result.alertStaff) {
      await alertStaffOfOrderFailure({
        orderRef,
        packageCode: meta.packageCode,
        destination: meta.destination,
        retailUsd:   retail,
        customerId:  user?.id,
        reason:      result.customerMsg ?? result.errorMsg ?? 'Unknown error',
        alertMsg:    result.alertMsg ?? result.errorMsg,
      })
    }
    const toEmail = user?.email ?? meta.customerEmail
    if (toEmail) {
      try {
        await getResend().emails.send({
          from:    'Jade Connect <noreply@walztravels.com>',
          to:      toEmail,
          subject: `Your Jade eSIM order is being processed — ${meta.destination}`,
          html:    `<p>Hi ${user?.name ?? 'Traveller'},</p>
                    <p>Your payment for a <strong>${meta.destination}</strong> eSIM was received (Ref: ${orderRef}).</p>
                    <p>${result.customerMsg ?? 'Our team is processing your order and will send your QR code shortly.'}</p>
                    <p>If you have any questions, WhatsApp us at <a href="https://wa.me/12317902336">+1 231 790 2336</a>.</p>`,
        })
      } catch { /* ignore */ }
    }
    return
  }

  // Fetch structured install instructions (Airalo only — provider-aware WhatsApp formatting)
  // eSIM Access orders fall back to the generic numbered-steps message in sendEsimWhatsApp.
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
      console.error('[esim/webhook] email error:', e)
    }
  }

  // WhatsApp delivery
  const toPhone = (meta.customerPhone ?? user?.phone ?? '').trim()
  if (toPhone) {
    sendEsimWhatsApp({
      toPhone,
      customerName:    user?.name ?? 'Traveller',
      orderRef,
      destination:     meta.destination,
      instructions:    installInstructions,
      qrCodeUrl,
      appleInstallUrl,
    }).catch(e => console.error('[esim/webhook] WhatsApp error:', e))
  }
}

// ── eSIM Access status notifications ─────────────────────────────────────────
// eSIM Access sends ESIM_STATUS / SMDP_EVENT callbacks to this same endpoint.
// They have no stripe-signature header — detect by notifyType field.
async function handleEsimAccessNotification(body: {
  notifyType: string
  notifyId?:  string
  content?: {
    transactionId?: string
    iccid?:         string
    esimStatus?:    string
    smdpStatus?:    string
    orderNo?:       string
  }
}) {
  const { transactionId, iccid, esimStatus } = body.content ?? {}
  console.log(`[esim/webhook] eSIM Access ${body.notifyType}: transactionId=${transactionId} esimStatus=${esimStatus} iccid=${iccid}`)

  if (!transactionId) return

  const order = await prisma.esimOrder.findFirst({ where: { orderRef: transactionId } })
  if (!order) {
    console.warn('[esim/webhook] eSIM Access notification for unknown order:', transactionId)
    return
  }

  const statusMap: Record<string, string> = {
    IN_USE:      'active',
    NOT_ACTIVE:  'pending',
    EXPIRED:     'expired',
    DEACTIVATED: 'expired',
  }
  const newStatus = esimStatus ? (statusMap[esimStatus] ?? order.status) : order.status

  await prisma.esimOrder.update({
    where: { id: order.id },
    data:  { status: newStatus, iccid: iccid ?? order.iccid ?? null },
  })
}

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  // eSIM Access notifications arrive without a stripe-signature header.
  // Detect them by the notifyType field before attempting Stripe verification.
  if (!sig) {
    try {
      const body = JSON.parse(payload)
      if (body?.notifyType) {
        await handleEsimAccessNotification(body)
        return NextResponse.json({ received: true })
      }
    } catch { /* not JSON — fall through to Stripe handling */ }
  }

  const secret = process.env.STRIPE_ESIM_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event
  try {
    if (secret) {
      event = getStripe().webhooks.constructEvent(payload, sig, secret)
    } else {
      event = JSON.parse(payload) as Stripe.Event
    }
  } catch (err) {
    console.error('[esim/webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    await fulfillEsim(event.data.object as Stripe.PaymentIntent)
  }

  return NextResponse.json({ received: true })
}
