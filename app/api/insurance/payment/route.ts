import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { isAxaConfigured } from '@/lib/axa'

export const dynamic = 'force-dynamic'

interface InsuranceOrderRow {
  id:                  string
  client_id:           string | null
  battleface_order_id: string
  order_reference:     string | null
  plan_name:           string | null
  premium:             number
  currency:            string
  destination_country: string
  trip_start_date:     string
  trip_end_date:       string
  primary_traveller:   unknown
  policy_number:       string | null
  policy_document_url: string | null
  status:              string
}

function bfHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${process.env.BATTLEFACE_BEARER_TOKEN}`,
  }
}

/**
 * POST /api/insurance/payment
 * Requires auth session.
 * Called after Stripe payment succeeds.
 *
 * AXA path: policy already issued at order time — just marks DB approved + sends email.
 * Battleface path: confirms payment with BF, updates DB, sends email.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { order_id, stripe_payment_intent_id } =
    await req.json().catch(() => ({})) as Record<string, string>

  if (!order_id || !stripe_payment_intent_id) {
    return NextResponse.json(
      { error: 'order_id and stripe_payment_intent_id are required' },
      { status: 400 },
    )
  }

  // Fetch order from DB
  const rows = await prisma.$queryRawUnsafe<InsuranceOrderRow[]>(`
    SELECT * FROM insurance_orders WHERE battleface_order_id = $1 LIMIT 1
  `, order_id).catch(() => [] as InsuranceOrderRow[])

  const dbOrder = rows[0] ?? null
  if (!dbOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (dbOrder.status === 'approved') {
    return NextResponse.json({ success: true, already_processed: true })
  }

  // ── AXA path — policy already issued at order time ─────────────────────────
  if (isAxaConfigured()) {
    // Policy number and certificate URL were stored during the order step
    const policyNumber = dbOrder.policy_number  ?? dbOrder.order_reference ?? order_id
    const policyDocUrl = dbOrder.policy_document_url ?? null
    const emergencyTel = '+44 345 266 1872'  // AXA Partners UK emergency line — TODO: confirm vs contract

    await prisma.$executeRawUnsafe(`
      UPDATE insurance_orders
      SET status            = 'approved',
          stripe_payment_id = $1,
          updated_at        = NOW()
      WHERE battleface_order_id = $2
    `, stripe_payment_intent_id, order_id).catch(e =>
      console.error('[POST /api/insurance/payment] AXA DB update error:', e),
    )

    await sendPolicyEmail({
      session,
      dbOrder,
      policyNumber,
      policyDocUrl,
      emergencyTel,
      providerLabel: 'AXA Partners Travel Insurance',
    })

    return NextResponse.json({
      success:             true,
      policy_number:       policyNumber,
      policy_document_url: policyDocUrl,
      order_reference:     dbOrder.order_reference,
      emergency_contact:   emergencyTel,
      provider:            'axa',
    })
  }

  // ── Battleface path — confirm payment with BF ──────────────────────────────
  const baseUrl = process.env.BATTLEFACE_API_URL
  if (!baseUrl || !process.env.BATTLEFACE_BEARER_TOKEN) {
    return NextResponse.json({ error: 'Insurance API not configured' }, { status: 503 })
  }

  let bfData: Record<string, unknown> = {}
  try {
    const bfRes = await fetch(`${baseUrl}/orders/${order_id}/payment`, {
      method:  'POST',
      headers: bfHeaders(),
      body: JSON.stringify({
        stripe_payment_intent_id,
        payment_method: 'stripe',
        amount:         dbOrder.premium,
        currency:       dbOrder.currency,
      }),
    })
    if (bfRes.ok) {
      bfData = await bfRes.json()
    } else {
      const txt = await bfRes.text()
      console.warn('[POST /api/insurance/payment] bf confirmation non-200:', bfRes.status, txt)
    }
  } catch (err) {
    console.warn('[POST /api/insurance/payment] bf confirmation error:', err)
  }

  const policyNumber = (bfData.policy_number ?? bfData.policyNumber ?? null) as string | null
  const policyDocUrl = (bfData.policy_document_url ?? bfData.policy_url ?? bfData.documentUrl ?? null) as string | null
  const emergencyTel = String(bfData.emergency_contact ?? bfData.emergencyPhone ?? '+1 800 TRAVEL')

  await prisma.$executeRawUnsafe(`
    UPDATE insurance_orders
    SET status              = 'approved',
        policy_number       = $1,
        policy_document_url = $2,
        stripe_payment_id   = $3,
        updated_at          = NOW()
    WHERE battleface_order_id = $4
  `, policyNumber, policyDocUrl, stripe_payment_intent_id, order_id).catch(e =>
    console.error('[POST /api/insurance/payment] DB update error:', e),
  )

  await sendPolicyEmail({
    session,
    dbOrder,
    policyNumber,
    policyDocUrl,
    emergencyTel,
    providerLabel: 'Battleface Travel Insurance',
  })

  return NextResponse.json({
    success:             true,
    policy_number:       policyNumber,
    policy_document_url: policyDocUrl,
    order_reference:     dbOrder.order_reference,
    emergency_contact:   emergencyTel,
    provider:            'battleface',
  })
}

// ── Shared email helper ───────────────────────────────────────────────────────

async function sendPolicyEmail(opts: {
  session:       { user?: { email?: string | null } | null }
  dbOrder:       InsuranceOrderRow
  policyNumber:  string | null
  policyDocUrl:  string | null
  emergencyTel:  string
  providerLabel: string
}) {
  const { session, dbOrder, policyNumber, policyDocUrl, emergencyTel, providerLabel } = opts
  if (!process.env.RESEND_API_KEY) return

  const pt      = dbOrder.primary_traveller as { first_name?: string; last_name?: string; email?: string } | null
  const toEmail = pt?.email ?? session.user?.email
  if (!toEmail) return

  const name    = pt ? `${pt.first_name ?? ''} ${pt.last_name ?? ''}`.trim() : session.user?.email ?? ''
  const ref     = policyNumber ?? dbOrder.order_reference ?? dbOrder.battleface_order_id
  const docBtn  = policyDocUrl
    ? `<p style="margin:24px 0 0">
         <a href="${policyDocUrl}"
            style="display:inline-block;padding:13px 28px;background:#C9A84C;color:#0B1F3A;text-decoration:none;font-weight:700;border-radius:8px;font-size:14px">
           Download Policy Document
         </a>
       </p>`
    : ''

  await getResend().emails.send({
    from:    'Walz Travels <bookings@walztravels.com>',
    to:      toEmail,
    subject: `Your Travel Insurance Policy — ${ref}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
        <div style="background:#0B1F3A;border-radius:12px;padding:28px;margin-bottom:28px">
          <h2 style="color:#C9A84C;margin:0 0 4px">Policy Confirmed ✓</h2>
          <p style="color:rgba(255,255,255,0.6);margin:0;font-size:14px">Walz Travel Shield — Powered by ${providerLabel}</p>
        </div>
        <p style="font-size:16px;color:#0B1F3A">Hi ${name},</p>
        <p style="color:#555;font-size:14px">
          Your travel insurance policy is active. Please keep this email safe —
          you will need your policy reference if you need to make a claim.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#F7F4EF;border-radius:8px;overflow:hidden">
          <tr><td style="padding:10px 16px;color:#888;font-size:13px;width:44%">Policy Reference</td>
              <td style="padding:10px 16px;font-weight:700;font-size:14px;color:#0B1F3A">${ref}</td></tr>
          <tr style="background:#fff"><td style="padding:10px 16px;color:#888;font-size:13px">Plan</td>
              <td style="padding:10px 16px;font-weight:700;font-size:14px;color:#0B1F3A">${dbOrder.plan_name ?? 'Walz Travel Shield'}</td></tr>
          <tr><td style="padding:10px 16px;color:#888;font-size:13px">Destination</td>
              <td style="padding:10px 16px;font-weight:700;font-size:14px;color:#0B1F3A">${dbOrder.destination_country}</td></tr>
          <tr style="background:#fff"><td style="padding:10px 16px;color:#888;font-size:13px">Travel Dates</td>
              <td style="padding:10px 16px;font-weight:700;font-size:14px;color:#0B1F3A">${dbOrder.trip_start_date} → ${dbOrder.trip_end_date}</td></tr>
          <tr><td style="padding:10px 16px;color:#888;font-size:13px">Premium Paid</td>
              <td style="padding:10px 16px;font-weight:700;font-size:14px;color:#C9A84C">${dbOrder.currency} ${Number(dbOrder.premium).toFixed(2)}</td></tr>
        </table>
        ${docBtn}
        <div style="margin-top:32px;padding:16px;background:#0B1F3A;border-radius:8px">
          <p style="color:#C9A84C;font-weight:700;font-size:13px;margin:0 0 6px">24/7 Emergency Assistance</p>
          <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0">
            Emergency telephone: <strong style="color:#fff">${emergencyTel}</strong><br>
            Quote your policy reference number when calling.
          </p>
        </div>
        <p style="color:#bbb;font-size:12px;margin-top:28px">
          Walz Travels Ltd &mdash; <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a>
        </p>
      </div>
    `,
  }).catch(e => console.error('[POST /api/insurance/payment] email error:', e))
}
