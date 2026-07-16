import { NextRequest, NextResponse } from 'next/server'
import { z }                        from 'zod'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { getResend }                 from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FROM       = 'Walz Travels <bookings@walztravels.com>'
const ADMIN_FROM = 'Walz System <system@walztravels.com>'
const ADMIN_TO   = 'contact@walztravels.com'

const passengerSchema = z.object({
  id:           z.string(),
  given_name:   z.string(),
  family_name:  z.string(),
  born_on:      z.string(),
  gender:       z.string(),
  title:        z.string(),
  email:        z.string().optional().default(''),
  phone_number: z.string().optional().default(''),
})

const schema = z.object({
  amount:         z.number().positive(),
  currency:       z.string().length(3),
  offerId:        z.string().min(1),
  offerExpiresAt: z.string().optional(),
  passengers:     z.array(passengerSchema),
  clientName:     z.string().min(1),
  clientEmail:    z.string().email(),
  clientPhone:    z.string().optional().default(''),
  searchedOrigin: z.string().optional().default(''),
  searchedDest:   z.string().optional().default(''),
  departDate:     z.string().optional().default(''),
  returnDate:     z.string().optional().default(''),
  cabinClass:     z.string().optional().default('economy'),
  tripType:       z.string().optional().default('one_way'),
})

function generateRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rand  = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `WLZ-${rand}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }

  const d      = parsed.data
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.walztravels.com'

  if (!process.env.NOWPAYMENTS_API_KEY) {
    return NextResponse.json({ error: 'Crypto payments not configured' }, { status: 500 })
  }

  // 1. Create the FlightBooking record BEFORE issuing the invoice so the booking
  //    survives even if the user's sessionStorage is wiped by the cross-origin redirect.
  const reference = generateRef()
  const supabase  = getSupabaseAdmin()

  const { error: dbError } = await supabase
    .from('FlightBooking')
    .insert({
      reference,
      status:         'awaiting_payment',
      clientName:     d.clientName,
      clientEmail:    d.clientEmail,
      clientPhone:    d.clientPhone || null,
      offerId:        d.offerId,
      offerExpiresAt: d.offerExpiresAt || null,
      passengers:     d.passengers,
      quotedAmount:   d.amount,
      paidAmount:     null,
      currency:       d.currency,
      paymentMethod:  'nowpayments',
      paymentRef:     null,
      paidAt:         new Date().toISOString(),
      searchedOrigin: d.searchedOrigin || null,
      searchedDest:   d.searchedDest  || null,
      departDate:     d.departDate    || null,
      returnDate:     d.returnDate    || null,
      cabinClass:     d.cabinClass    || 'economy',
      tripType:       d.tripType      || 'one_way',
    })

  if (dbError) {
    console.error('[flights/crypto-invoice] Supabase insert error:', dbError)
    return NextResponse.json({ error: 'Failed to create booking. Please try again.' }, { status: 500 })
  }

  // 2. Create NOWPayments hosted invoice. Use the booking reference as order_id so
  //    the IPN webhook can look up and update the exact FlightBooking row.
  const route = `${d.searchedOrigin || '?'} → ${d.searchedDest || '?'}`

  const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
    method:  'POST',
    headers: {
      'x-api-key':    process.env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount:      d.amount,
      price_currency:    d.currency.toLowerCase(),
      order_id:          reference,
      order_description: `Walz Travels: ${route} for ${d.clientName}`,
      ipn_callback_url:  `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/nowpayments`,
      success_url:       `${origin}/flights/crypto-return?ref=${reference}`,
      cancel_url:        `${origin}/flights/checkout`,
    }),
  })

  const invoiceData = await invoiceRes.json()

  if (!invoiceRes.ok || !invoiceData.invoice_url) {
    // Roll back the pending booking so it doesn't linger
    try { await supabase.from('FlightBooking').delete().eq('reference', reference) } catch { /* non-fatal */ }
    console.error('[flights/crypto-invoice] NOWPayments error:', invoiceData)
    return NextResponse.json(
      { error: invoiceData.message || 'Failed to create crypto invoice' },
      { status: 500 },
    )
  }

  // 3. Store NOWPayments invoice ID against the booking (best-effort)
  try {
    await supabase.from('FlightBooking').update({ paymentRef: String(invoiceData.id) }).eq('reference', reference)
  } catch { /* non-fatal */ }

  // 4. Fire alert emails without blocking the response
  const resend = getResend()
  Promise.allSettled([
    resend.emails.send({
      from:    ADMIN_FROM,
      to:      ADMIN_TO,
      subject: `🔔 Crypto Flight Invoice — ${reference} — ${d.currency} ${d.amount}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:#0B1F3A;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#C9A84C;margin:0;">Crypto Flight Invoice Created</h2>
            <p style="color:white;margin:4px 0 0;font-size:14px;">${reference} — awaiting payment</p>
          </div>
          <div style="background:#FFF9E6;border:1px solid #F59E0B;padding:12px 20px;font-size:14px;color:#92400E;">
            ⏳ Customer redirected to NOWPayments — booking exists but not yet confirmed on-chain
          </div>
          <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;">
            <table style="width:100%;font-size:14px;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#6b7280;width:150px;">Client</td><td style="font-weight:bold;">${d.clientName}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td>${d.clientEmail}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td>${d.clientPhone || 'Not provided'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Route</td><td style="font-weight:bold;">${route}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Depart</td><td>${d.departDate || '?'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Cabin</td><td style="text-transform:capitalize;">${d.cabinClass || 'Economy'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="font-size:18px;font-weight:bold;color:#0B1F3A;">${d.currency} ${d.amount}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Invoice ID</td><td style="font-family:monospace;font-size:12px;">${invoiceData.id}</td></tr>
            </table>
          </div>
        </div>
      `,
    }),
    resend.emails.send({
      from:    FROM,
      to:      d.clientEmail,
      subject: `✈ Booking Request Received — ${reference}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:#0B1F3A;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="130"
              style="display:block;margin:0 auto;height:auto;" />
          </div>
          <div style="padding:28px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <h2 style="color:#0B1F3A;font-size:20px;margin:0 0 16px;">Hi ${d.clientName.split(' ')[0]},</h2>
            <p style="color:#4b5563;line-height:1.6;">We've received your flight booking request for
              <strong>${route}</strong> on <strong>${d.departDate || 'your selected date'}</strong>.</p>
            <div style="background:white;border:2px solid #C9A84C;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Your Booking Reference</p>
              <p style="margin:6px 0;font-size:30px;font-weight:bold;color:#0B1F3A;letter-spacing:4px;font-family:monospace;">${reference}</p>
            </div>
            <p style="color:#4b5563;line-height:1.6;">
              Complete your crypto payment on the NOWPayments page. Once confirmed on-chain,
              our team will issue your e-ticket within 2 business hours.
            </p>
            <a href="https://wa.me/12317902336"
               style="display:inline-block;background:#25D366;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px;">
              WhatsApp +1 231 790 2336
            </a>
            <p style="color:#9ca3af;font-size:13px;margin-top:28px;">The Walz Travels Team<br>bookings@walztravels.com</p>
          </div>
        </div>
      `,
    }),
  ]).catch(err => console.error('[flights/crypto-invoice] Email error:', err))

  return NextResponse.json({ invoiceUrl: invoiceData.invoice_url, bookingRef: reference })
}
