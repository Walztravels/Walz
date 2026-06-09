import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { Resend } from 'resend'
import prisma from '@/lib/db'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateBookingRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WLZ-T-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  try {
    // Fetch Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed', status: session.payment_status }, { status: 402 })
    }

    // Check idempotency — don't create duplicate booking for same session
    const existing = await prisma.booking.findFirst({
      where: { stripePaymentIntentId: sessionId },
      select: { bookingReference: true },
    })
    if (existing) {
      // Already processed — return the existing reference
      const m = session.metadata ?? {}
      return NextResponse.json({
        bookingReference: existing.bookingReference,
        tourName: m.tour_name ?? '',
        tourSlug: m.tour_slug ?? '',
        tourLocation: m.tour_location ?? '',
        date: m.date ?? '',
        groupSize: Number(m.group_size ?? 1),
        firstName: m.first_name ?? '',
        lastName: m.last_name ?? '',
        email: m.email ?? '',
        totalAmount: Number(m.total_amount ?? 0),
        currency: m.currency ?? 'GBP',
      })
    }

    // Extract metadata
    const m = session.metadata ?? {}
    const addons: { id: string; name: string; price: number }[] = (() => {
      try { return JSON.parse(m.addons_json ?? '[]') } catch { return [] }
    })()

    const totalAmount = Number(m.total_amount ?? 0)
    const basePrice = Number(m.base_price ?? 0)
    const addonsTotal = Number(m.addons_total ?? 0)
    const groupSize = Number(m.group_size ?? 1)
    const currency = m.currency ?? 'GBP'

    // Generate unique booking reference
    let bookingReference = generateBookingRef()
    for (let i = 0; i < 5; i++) {
      const dup = await prisma.booking.findUnique({ where: { bookingReference } })
      if (!dup) break
      bookingReference = generateBookingRef()
    }

    // Create booking in DB
    await prisma.booking.create({
      data: {
        bookingReference,
        type: 'PACKAGE',
        status: 'PENDING',
        paymentStatus: 'SUCCEEDED',
        totalAmount,
        currency,
        contactEmail: m.email ?? '',
        contactPhone: m.whatsapp ?? '',
        stripePaymentIntentId: sessionId, // used for idempotency
        hotelDetails: {
          type: 'tour',
          tourId: m.tour_id ?? '',
          tourName: m.tour_name ?? '',
          tourSlug: m.tour_slug ?? '',
          tourLocation: m.tour_location ?? '',
          date: m.date ?? '',
          groupSize,
          basePrice,
          addonsTotal,
        },
        passengers: [{
          firstName: m.first_name ?? '',
          lastName: m.last_name ?? '',
          email: m.email ?? '',
          whatsapp: m.whatsapp ?? '',
          country: m.country ?? '',
          requirements: m.requirements ?? '',
          message: m.message ?? '',
        }],
        addons: addons.map((a) => ({
          id: a.id, name: a.name, price: a.price, currency, selected: true, description: a.name,
        })),
        notes: `Stripe Checkout Session: ${sessionId}`,
      },
    })

    // Send confirmation emails (non-blocking)
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && !resendKey.startsWith('re_your')) {
      const addonRows = addons.length > 0
        ? addons.map((a) => `<tr><td style="padding:8px 12px;color:#1C3557;border-bottom:1px solid #E2D9CC;">✓ ${a.name}</td><td style="padding:8px 12px;color:#C9A84C;font-weight:600;text-align:right;border-bottom:1px solid #E2D9CC;">${fmt(a.price * groupSize, currency)}</td></tr>`).join('')
        : `<tr><td colspan="2" style="padding:8px 12px;color:#8B9BAE;font-style:italic;">No add-ons selected</td></tr>`

      const guestHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#F7F4EF;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:40px;text-align:center;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
  </div>
  <div style="padding:40px;">
    <h2 style="color:#0A1628;margin:0 0 8px;">Your booking is confirmed! 🎉</h2>
    <p style="color:#1C3557;margin:0 0 24px;line-height:1.6;">Hi ${m.first_name}, your payment was received and your tour is confirmed.</p>
    <div style="background:#0A1628;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;color:#8B9BAE;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Booking Reference</p>
      <p style="margin:0;color:#C9A84C;font-size:24px;font-weight:800;letter-spacing:4px;font-family:monospace;">${bookingReference}</p>
    </div>
    <div style="background:#F7F4EF;border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid #C9A84C;">
      <h3 style="margin:0 0 12px;color:#0A1628;font-size:16px;">🗺️ Tour Details</h3>
      <p style="margin:4px 0;color:#1C3557;"><strong>Tour:</strong> ${m.tour_name}</p>
      <p style="margin:4px 0;color:#1C3557;"><strong>Date:</strong> ${fmtDate(m.date ?? '')}</p>
      <p style="margin:4px 0;color:#1C3557;"><strong>Group:</strong> ${groupSize} ${groupSize === 1 ? 'person' : 'people'}</p>
      ${m.requirements ? `<p style="margin:4px 0;color:#1C3557;"><strong>Requirements:</strong> ${m.requirements}</p>` : ''}
    </div>
    <div style="margin-bottom:24px;">
      <h3 style="margin:0 0 12px;color:#0A1628;font-size:16px;">💳 Price Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #E2D9CC;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:#1C3557;border-bottom:1px solid #E2D9CC;">Tour (${groupSize} × ${fmt(basePrice / groupSize, currency)})</td><td style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #E2D9CC;">${fmt(basePrice, currency)}</td></tr>
        ${addonRows}
        <tr style="background:#0A1628;"><td style="padding:12px;color:#C9A84C;font-weight:700;font-size:16px;">Total Paid</td><td style="padding:12px;color:#C9A84C;font-weight:700;font-size:16px;text-align:right;">${fmt(totalAmount, currency)}</td></tr>
      </table>
    </div>
    <p style="color:#8B9BAE;font-size:13px;">Questions? <a href="https://wa.me/447398753797" style="color:#C9A84C;">WhatsApp: +44 7398 753797</a> · <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a></p>
  </div>
  <div style="padding:24px 40px;background:#F7F4EF;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels Ltd. IATA Certified</p>
  </div>
</div></body></html>`

      const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0]?.trim() ?? 'contact@walztravels.com'
      const resend = new Resend(resendKey)

      await Promise.allSettled([
        resend.emails.send({
          from: 'Walz Travels <bookings@walztravels.com>',
          to: m.email ?? '',
          subject: `Booking Confirmed: ${m.tour_name} — ${bookingReference} | Walz Travels`,
          html: guestHtml,
        }),
        resend.emails.send({
          from: 'Walz Travels <bookings@walztravels.com>',
          to: adminEmail,
          subject: `🎯 New Tour Booking ${bookingReference} — ${m.tour_name} (${fmt(totalAmount, currency)}) [Stripe]`,
          html: `<p>New Stripe booking: <strong>${bookingReference}</strong></p>
                 <p>Guest: ${m.first_name} ${m.last_name} · ${m.email} · ${m.whatsapp}</p>
                 <p>Tour: ${m.tour_name} · ${fmtDate(m.date ?? '')} · ${groupSize} people</p>
                 <p>Total: ${fmt(totalAmount, currency)}</p>
                 <p>Stripe Session: ${sessionId}</p>`,
        }),
      ])
    }

    return NextResponse.json({
      bookingReference,
      tourName: m.tour_name ?? '',
      tourSlug: m.tour_slug ?? '',
      tourLocation: m.tour_location ?? '',
      date: m.date ?? '',
      groupSize,
      firstName: m.first_name ?? '',
      lastName: m.last_name ?? '',
      email: m.email ?? '',
      totalAmount,
      currency,
      addons,
    })
  } catch (err) {
    console.error('[Stripe Verify]', err)
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 })
  }
}
