import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { Resend } from 'resend'

// ── Validation ────────────────────────────────────────────────────────────────

const bookingSchema = z.object({
  tourId: z.string().min(1),
  tourName: z.string().min(1),
  tourSlug: z.string().min(1),
  date: z.string().min(1),
  groupSize: z.number().int().min(1).max(50),
  currency: z.string().length(3),
  addons: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })),
  basePrice: z.number().min(0),
  addonsTotal: z.number().min(0),
  totalAmount: z.number().min(0),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  whatsapp: z.string().min(7),
  country: z.string().min(1),
  requirements: z.string().optional().default(''),
  message: z.string().optional().default(''),
  txRef: z.string().min(1),
  flutterwaveTransactionId: z.string().min(1),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateBookingRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WLZ-T-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Email ─────────────────────────────────────────────────────────────────────

interface TourBookingEmailData {
  to: string
  bookingRef: string
  firstName: string
  tourName: string
  date: string
  groupSize: number
  addons: { id: string; name: string; price: number }[]
  basePrice: number
  addonsTotal: number
  totalAmount: number
  currency: string
  whatsapp: string
  country: string
  requirements: string
}

function buildGuestEmail(d: TourBookingEmailData): string {
  const addonRows = d.addons.length > 0
    ? d.addons.map(a => `
        <tr>
          <td style="padding: 8px 12px; color: #1C3557; border-bottom: 1px solid #E2D9CC;">✓ ${a.name}</td>
          <td style="padding: 8px 12px; color: #C9A84C; font-weight: 600; text-align: right; border-bottom: 1px solid #E2D9CC;">
            ${fmt(a.price * d.groupSize, d.currency)}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="padding: 8px 12px; color: #8B9BAE; font-style: italic;">No add-ons selected</td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Tour Booking Confirmed</title></head>
<body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#F7F4EF;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:40px;text-align:center;">
      <div style="margin-bottom:8px;">
        <span style="font-size:28px;font-weight:700;color:#C9A84C;">W</span>
        <span style="font-size:22px;font-weight:600;color:#fff;margin-left:8px;">Walz Travels</span>
      </div>
      <p style="margin:0;color:#8B9BAE;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Luxury Travel Agency</p>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <h2 style="color:#0A1628;margin:0 0 8px;font-size:22px;">Your booking is confirmed! 🎉</h2>
      <p style="color:#1C3557;margin:0 0 24px;line-height:1.6;">
        Hi ${d.firstName}, thank you for booking with Walz Travels. Your payment has been received
        and your tour is confirmed. We&apos;re excited to make this an unforgettable experience!
      </p>

      <!-- Booking ref box -->
      <div style="background:#0A1628;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 4px;color:#8B9BAE;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Booking Reference</p>
        <p style="margin:0;color:#C9A84C;font-size:24px;font-weight:800;letter-spacing:4px;font-family:monospace;">${d.bookingRef}</p>
      </div>

      <!-- Tour details -->
      <div style="background:#F7F4EF;border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid #C9A84C;">
        <h3 style="margin:0 0 12px;color:#0A1628;font-size:16px;">🗺️ Tour Details</h3>
        <p style="margin:4px 0;color:#1C3557;"><strong>Tour:</strong> ${d.tourName}</p>
        <p style="margin:4px 0;color:#1C3557;"><strong>Date:</strong> ${fmtDate(d.date)}</p>
        <p style="margin:4px 0;color:#1C3557;"><strong>Group Size:</strong> ${d.groupSize} ${d.groupSize === 1 ? 'person' : 'people'}</p>
        <p style="margin:4px 0;color:#1C3557;"><strong>Country:</strong> ${d.country}</p>
        ${d.requirements ? `<p style="margin:4px 0;color:#1C3557;"><strong>Special Requirements:</strong> ${d.requirements}</p>` : ''}
      </div>

      <!-- Price breakdown -->
      <div style="margin-bottom:24px;">
        <h3 style="margin:0 0 12px;color:#0A1628;font-size:16px;">💳 Price Breakdown</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #E2D9CC;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:8px 12px;color:#1C3557;border-bottom:1px solid #E2D9CC;">
              Tour (${d.groupSize} × ${fmt(d.basePrice / d.groupSize, d.currency)})
            </td>
            <td style="padding:8px 12px;color:#1C3557;font-weight:600;text-align:right;border-bottom:1px solid #E2D9CC;">
              ${fmt(d.basePrice, d.currency)}
            </td>
          </tr>
          ${addonRows}
          <tr style="background:#0A1628;">
            <td style="padding:12px;color:#C9A84C;font-weight:700;font-size:16px;">Total Paid</td>
            <td style="padding:12px;color:#C9A84C;font-weight:700;font-size:16px;text-align:right;">
              ${fmt(d.totalAmount, d.currency)}
            </td>
          </tr>
        </table>
      </div>

      <!-- What happens next -->
      <div style="margin-bottom:24px;">
        <h3 style="margin:0 0 12px;color:#0A1628;font-size:16px;">📋 What Happens Next</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#0A1628;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-align:center;line-height:28px;">1</div>
            <div>
              <p style="margin:0;color:#0A1628;font-weight:600;">Confirmation Call</p>
              <p style="margin:0;color:#8B9BAE;font-size:13px;">Our team will call or WhatsApp you within 2 hours to confirm all details.</p>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#0A1628;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-align:center;line-height:28px;">2</div>
            <div>
              <p style="margin:0;color:#0A1628;font-weight:600;">Itinerary &amp; Meeting Point</p>
              <p style="margin:0;color:#8B9BAE;font-size:13px;">48 hours before your tour you&apos;ll receive a detailed itinerary and pickup details.</p>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#0A1628;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-align:center;line-height:28px;">3</div>
            <div>
              <p style="margin:0;color:#0A1628;font-weight:600;">Enjoy Your Tour!</p>
              <p style="margin:0;color:#8B9BAE;font-size:13px;">Sit back, relax and let our expert guides take care of everything.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Contact -->
      <p style="color:#8B9BAE;font-size:13px;line-height:1.6;">
        Questions? Reach us anytime:<br>
        📱 <a href="https://wa.me/447398753797" style="color:#C9A84C;">WhatsApp: +44 7398 753797</a><br>
        📧 <a href="mailto:tours@walztravels.com" style="color:#C9A84C;">tours@walztravels.com</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;background:#F7F4EF;text-align:center;">
      <p style="margin:0;color:#8B9BAE;font-size:12px;">
        © ${new Date().getFullYear()} Walz Travels Ltd. IATA Certified<br>
        1 Commercial Street, London, E1 6RF
      </p>
    </div>
  </div>
</body>
</html>`
}

function buildAdminEmail(d: TourBookingEmailData & { txRef: string; flutterwaveId: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Tour Booking</title></head>
<body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#F7F4EF;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0A1628;padding:24px 40px;">
      <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px;">🎯 New Tour Booking — ${d.bookingRef}</p>
    </div>
    <div style="padding:32px 40px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;width:140px;">Tour</td><td style="padding:6px 0;color:#0A1628;font-weight:600;">${d.tourName}</td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Date</td><td style="padding:6px 0;color:#0A1628;">${fmtDate(d.date)}</td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Group Size</td><td style="padding:6px 0;color:#0A1628;">${d.groupSize} people</td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Guest</td><td style="padding:6px 0;color:#0A1628;">${d.firstName} ${''}</td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Email</td><td style="padding:6px 0;"><a href="mailto:${d.to}" style="color:#C9A84C;">${d.to}</a></td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">WhatsApp</td><td style="padding:6px 0;"><a href="https://wa.me/${d.whatsapp.replace('+', '')}" style="color:#C9A84C;">${d.whatsapp}</a></td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Country</td><td style="padding:6px 0;color:#0A1628;">${d.country}</td></tr>
        ${d.addons.length > 0 ? `<tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Add-ons</td><td style="padding:6px 0;color:#0A1628;">${d.addons.map(a => a.name).join(', ')}</td></tr>` : ''}
        ${d.requirements ? `<tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Requirements</td><td style="padding:6px 0;color:#0A1628;">${d.requirements}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Total Paid</td><td style="padding:6px 0;color:#C9A84C;font-weight:700;font-size:18px;">${fmt(d.totalAmount, d.currency)}</td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">FLW Tx ID</td><td style="padding:6px 0;color:#0A1628;font-family:monospace;">${d.flutterwaveId}</td></tr>
        <tr><td style="padding:6px 0;color:#8B9BAE;font-size:13px;">Tx Ref</td><td style="padding:6px 0;color:#0A1628;font-family:monospace;">${d.txRef}</td></tr>
      </table>
    </div>
  </div>
</body>
</html>`
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = bookingSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid booking data', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const d = parsed.data

    // Generate a unique booking reference (retry on collision)
    let bookingReference = generateBookingRef()
    let attempts = 0
    while (attempts < 5) {
      const existing = await prisma.booking.findUnique({ where: { bookingReference } })
      if (!existing) break
      bookingReference = generateBookingRef()
      attempts++
    }

    // Create booking record in DB
    await prisma.booking.create({
      data: {
        bookingReference,
        type: 'PACKAGE',
        status: 'PENDING',         // pending tour confirmation by our team
        paymentStatus: 'SUCCEEDED', // Flutterwave payment succeeded
        totalAmount: d.totalAmount,
        currency: d.currency,
        contactEmail: d.email,
        contactPhone: d.whatsapp,
        // Store tour details in hotelDetails JSON (reusing the flexible JSON field)
        hotelDetails: {
          type: 'tour',
          tourId: d.tourId,
          tourName: d.tourName,
          tourSlug: d.tourSlug,
          date: d.date,
          groupSize: d.groupSize,
          basePrice: d.basePrice,
          addonsTotal: d.addonsTotal,
        },
        // Store traveller in passengers JSON
        passengers: [{
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email,
          whatsapp: d.whatsapp,
          country: d.country,
          requirements: d.requirements,
          message: d.message,
        }],
        // Store selected add-ons
        addons: d.addons.map(a => ({
          id: a.id,
          name: a.name,
          price: a.price,
          currency: d.currency,
          selected: true,
          description: a.name,
        })),
        // Payment references
        notes: `Flutterwave Transaction ID: ${d.flutterwaveTransactionId} | Tx Ref: ${d.txRef}`,
      },
    })

    // Send emails (non-blocking — don't fail the booking if email fails)
    const emailData: TourBookingEmailData = {
      to: d.email,
      bookingRef: bookingReference,
      firstName: d.firstName,
      tourName: d.tourName,
      date: d.date,
      groupSize: d.groupSize,
      addons: d.addons,
      basePrice: d.basePrice,
      addonsTotal: d.addonsTotal,
      totalAmount: d.totalAmount,
      currency: d.currency,
      whatsapp: d.whatsapp,
      country: d.country,
      requirements: d.requirements,
    }

    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && !resendKey.startsWith('re_your')) {
      try {
        const resend = new Resend(resendKey)
        const fromAddress = 'Walz Travels <bookings@walztravels.com>'
        const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0]?.trim() ?? 'contact@walztravels.com'

        await Promise.allSettled([
          resend.emails.send({
            from: fromAddress,
            to: d.email,
            subject: `Booking Confirmed: ${d.tourName} — ${bookingReference} | Walz Travels`,
            html: buildGuestEmail(emailData),
          }),
          resend.emails.send({
            from: fromAddress,
            to: adminEmail,
            subject: `🎯 New Tour Booking ${bookingReference} — ${d.tourName} (${fmt(d.totalAmount, d.currency)})`,
            html: buildAdminEmail({ ...emailData, txRef: d.txRef, flutterwaveId: d.flutterwaveTransactionId }),
          }),
        ])
      } catch (emailErr) {
        console.error('[Tour Booking] Email send failed:', emailErr)
      }
    }

    return NextResponse.json({ success: true, bookingReference })
  } catch (error) {
    console.error('[Tour Book API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save booking. Please contact us with your payment reference.' },
      { status: 500 }
    )
  }
}
