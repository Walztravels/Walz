import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'

const FROM_ADDRESS = 'Walz Travels <noreply@walztravels.com>'
const TEAM_EMAILS = ['contact@walztravels.com', 'reservations@walztravels.com']
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function generateRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'WLZ-PKG-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface TravelPackageRow {
  id: string
  title: string
  price_per_person: number | null
  currency: string | null
  deposit_amount: number | null
  total_seats: number | null
  seats_booked: number
}

function buildClientEmailHtml(params: {
  clientName: string
  clientEmail: string
  packageTitle: string
  numTravellers: number
  bookingRef: string
  totalPrice: number
  depositDue: number | null
  currency: string
}): string {
  const { clientName, clientEmail, packageTitle, numTravellers, bookingRef, totalPrice, depositDue, currency } = params

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)

  const depositRow = depositDue
    ? `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#1C3557;font-weight:600;">Deposit Required</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#C9A84C;font-weight:700;">${fmt(depositDue)}</td>
      </tr>`
    : ''

  const depositNote = depositDue
    ? `<div style="margin:24px 0;padding:16px 20px;background:#FFF8E6;border:1px solid #E8C97A;border-radius:12px;">
        <p style="margin:0;color:#0B1F3A;font-size:14px;line-height:1.6;">
          To confirm your reservation, a deposit of <strong>${fmt(depositDue)}</strong> is required.
          Our team will send bank transfer details to your email within 2 hours.
        </p>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Walz Travels Booking — ${bookingRef}</title>
</head>
<body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#F7F4EF;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0B1F3A,#1C3557);padding:36px 40px 28px;text-align:center;">
      <img
        src="https://walztravels.com/walz-logo.png"
        alt="Walz Travels"
        width="160"
        height="auto"
        style="display:block;margin:0 auto 12px;width:160px;height:auto;"
      />
      <p style="margin:0;color:#8B9BAE;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Luxury Travel Agency</p>
    </div>

    <!-- Gold banner -->
    <div style="background:linear-gradient(135deg,#C9A84C,#E8C97A);padding:20px 40px;text-align:center;">
      <h1 style="margin:0 0 4px;font-size:22px;color:#0B1F3A;font-weight:700;">Booking Received!</h1>
      <p style="margin:0;color:#0F2340;font-size:13px;">We&rsquo;ve got your reservation — next steps below</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">

      <p style="margin:0 0 24px;color:#1C3557;font-size:15px;line-height:1.6;">
        Hi <strong>${clientName}</strong>,<br />
        Your booking has been received. Here are your details:
      </p>

      <!-- Booking ref -->
      <div style="background:#0B1F3A;border-radius:12px;padding:20px;text-align:center;margin-bottom:28px;">
        <p style="margin:0 0 6px;color:#8B9BAE;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Booking Reference</p>
        <p style="margin:0;color:#C9A84C;font-size:30px;font-weight:700;letter-spacing:6px;font-family:monospace;">${bookingRef}</p>
        <p style="margin:8px 0 0;color:#8B9BAE;font-size:12px;">Keep this reference for your records</p>
      </div>

      <!-- Booking details table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #E2D9CC;border-radius:10px;overflow:hidden;margin-bottom:24px;">
        <thead>
          <tr style="background:#0B1F3A;">
            <th style="padding:10px 14px;text-align:left;color:#C9A84C;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Detail</th>
            <th style="padding:10px 14px;text-align:left;color:#C9A84C;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Info</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#ffffff;">
            <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#8B9BAE;font-size:13px;">Package</td>
            <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#1C3557;font-weight:600;font-size:13px;">${packageTitle}</td>
          </tr>
          <tr style="background:#F7F4EF;">
            <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#8B9BAE;font-size:13px;">Travellers</td>
            <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#1C3557;font-weight:600;font-size:13px;">${numTravellers}</td>
          </tr>
          <tr style="background:#ffffff;">
            <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#8B9BAE;font-size:13px;">Booking Ref</td>
            <td style="padding:10px 14px;border-bottom:1px solid #E2D9CC;color:#1C3557;font-weight:700;font-size:13px;font-family:monospace;">${bookingRef}</td>
          </tr>
          <tr style="background:#F7F4EF;">
            <td style="padding:10px 14px;color:#8B9BAE;font-size:13px;">Total</td>
            <td style="padding:10px 14px;color:#C9A84C;font-weight:700;font-size:15px;">${fmt(totalPrice)}</td>
          </tr>
          ${depositRow}
        </tbody>
      </table>

      ${depositNote}

      <!-- What happens next -->
      <div style="padding:20px;background:#F7F4EF;border-radius:12px;border-left:4px solid #C9A84C;margin-bottom:24px;">
        <p style="margin:0 0 8px;color:#0B1F3A;font-weight:600;font-size:14px;">What happens next?</p>
        <p style="margin:0 0 6px;color:#1C3557;font-size:13px;line-height:1.6;">
          Our team will reach out within <strong>2 hours</strong> with payment instructions.
        </p>
        <p style="margin:0;color:#1C3557;font-size:13px;line-height:1.6;">
          Bank details will be sent to <strong>${clientEmail}</strong> to complete your reservation.
        </p>
      </div>

      <!-- WhatsApp -->
      <div style="text-align:center;margin-bottom:8px;">
        <p style="color:#8B9BAE;font-size:13px;margin:0 0 12px;">Have questions? We&rsquo;re here to help.</p>
        <a
          href="https://wa.me/12317902336"
          style="display:inline-block;background:#25D366;color:#ffffff;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;"
        >
          WhatsApp us: +12317902336
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;background:#F7F4EF;border-top:1px solid #E2D9CC;">
      <p style="margin:0 0 6px;color:#0B1F3A;font-weight:600;font-size:13px;">Walz Travels</p>
      <p style="margin:0;color:#8B9BAE;font-size:12px;">
        <a href="mailto:contact@walztravels.com" style="color:#C9A84C;text-decoration:none;">contact@walztravels.com</a>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <a href="https://wa.me/12317902336" style="color:#C9A84C;text-decoration:none;">+12317902336</a>
      </p>
    </div>
    <div style="padding:16px 40px;text-align:center;border-top:1px solid #E2D9CC;">
      <p style="margin:0;color:#8B9BAE;font-size:11px;">
        &copy; ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved. IATA Certified.
      </p>
    </div>

  </div>
</body>
</html>`
}

function buildTeamEmailHtml(params: {
  clientName: string
  clientEmail: string
  clientPhone: string | null
  clientCountry: string | null
  packageTitle: string
  packageSlug: string
  numTravellers: number
  bookingRef: string
  totalPrice: number
  depositDue: number | null
  currency: string
  specialRequests: string | null
}): string {
  const {
    clientName,
    clientEmail,
    clientPhone,
    clientCountry,
    packageTitle,
    packageSlug,
    numTravellers,
    bookingRef,
    totalPrice,
    depositDue,
    currency,
    specialRequests,
  } = params

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:500;">${value}</td>
    </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>New Booking — ${bookingRef} — ${clientName}</title>
</head>
<body style="margin:0;padding:16px;font-family:system-ui,sans-serif;background:#f3f4f6;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">

    <!-- Admin header -->
    <div style="background:#0B1F3A;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" style="display:inline-block;vertical-align:middle;width:120px;height:auto;" />
        <span style="color:#8B9BAE;font-size:13px;margin-left:12px;vertical-align:middle;">Admin Notification</span>
      </div>
      <span style="background:#C9A84C;color:#0B1F3A;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">New Booking</span>
    </div>

    <!-- Booking ref banner -->
    <div style="background:#C9A84C;padding:14px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#0B1F3A;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">Booking Reference</p>
      <p style="margin:0;font-size:28px;font-weight:700;color:#0B1F3A;font-family:monospace;letter-spacing:5px;">${bookingRef}</p>
    </div>

    <div style="padding:28px 32px;">

      <!-- Client details -->
      <h3 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Client Details</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${row('Name', clientName)}
          ${row('Email', `<a href="mailto:${clientEmail}" style="color:#C9A84C;text-decoration:none;">${clientEmail}</a>`)}
          ${clientPhone ? row('Phone', `<a href="https://wa.me/${clientPhone.replace(/\D/g, '')}" style="color:#C9A84C;text-decoration:none;">${clientPhone}</a>`) : row('Phone', '—')}
          ${row('Country', clientCountry || '—')}
        </tbody>
      </table>

      <!-- Booking details -->
      <h3 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Booking Details</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${row('Package', packageTitle)}
          ${row('Slug', packageSlug)}
          ${row('Travellers', String(numTravellers))}
          ${row('Total Price', `<strong style="color:#C9A84C;">${fmt(totalPrice)}</strong>`)}
          ${depositDue ? row('Deposit Required', `<strong style="color:#C9A84C;">${fmt(depositDue)}</strong>`) : ''}
          ${row('Payment Status', '<span style="background:#FEF3C7;color:#92400E;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:600;">PENDING</span>')}
        </tbody>
      </table>

      ${specialRequests
        ? `<h3 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Special Requests</h3>
          <div style="padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
            <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;white-space:pre-wrap;">${specialRequests}</p>
          </div>`
        : ''}

      <!-- Actions -->
      <div style="text-align:center;padding-top:16px;border-top:1px solid #e5e7eb;">
        <a
          href="https://walztravels.com/admin/bookings"
          style="display:inline-block;background:#0B1F3A;color:#C9A84C;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin:0 6px;font-size:13px;"
        >
          View in Admin
        </a>
        <a
          href="mailto:${clientEmail}?subject=Your%20Walz%20Travels%20Package%20Booking%20%E2%80%94%20${bookingRef}"
          style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin:0 6px;font-size:13px;"
        >
          Email Client
        </a>
        ${clientPhone
          ? `<a
              href="https://wa.me/${clientPhone.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(clientName)}%2C%20regarding%20your%20booking%20${bookingRef}"
              style="display:inline-block;background:#25D366;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin:0 6px;font-size:13px;"
            >
              WhatsApp Client
            </a>`
          : ''}
      </div>

    </div>

    <div style="background:#0B1F3A;padding:14px 32px;text-align:center;">
      <p style="margin:0;color:#8B9BAE;font-size:11px;">
        Walz Travels Admin &middot; ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} GMT
      </p>
    </div>

  </div>
</body>
</html>`
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    packageId,
    packageSlug,
    packageTitle,
    numTravellers: rawTravellers,
    clientName,
    clientEmail,
    clientPhone,
    clientCountry,
    specialRequests,
    payment_gateway,
    payment_currency,
  } = body as {
    packageId?: string
    packageSlug?: string
    packageTitle?: string
    numTravellers?: number
    clientName?: string
    clientEmail?: string
    clientPhone?: string
    clientCountry?: string
    specialRequests?: string
    payment_gateway?: string
    payment_currency?: string
  }

  // Validation
  if (!packageId || typeof packageId !== 'string') {
    return NextResponse.json({ error: 'Package ID is required.' }, { status: 400 })
  }
  if (!packageSlug || typeof packageSlug !== 'string') {
    return NextResponse.json({ error: 'Package slug is required.' }, { status: 400 })
  }
  if (!packageTitle || typeof packageTitle !== 'string' || !packageTitle.trim()) {
    return NextResponse.json({ error: 'Package title is required.' }, { status: 400 })
  }

  const numTravellers = Number(rawTravellers)
  if (!Number.isInteger(numTravellers) || numTravellers < 1 || numTravellers > 99) {
    return NextResponse.json({ error: 'Number of travellers must be between 1 and 99.' }, { status: 400 })
  }

  if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
    return NextResponse.json({ error: 'Client name is required.' }, { status: 400 })
  }
  if (!clientEmail || typeof clientEmail !== 'string' || !EMAIL_REGEX.test(clientEmail)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  try {
    // 1. Fetch the package
    const rows = await prisma.$queryRawUnsafe<TravelPackageRow[]>(
      `SELECT id, title, price_per_person, currency, deposit_amount, total_seats, seats_booked
       FROM travel_packages
       WHERE id = $1`,
      packageId
    )

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Package not found.' }, { status: 404 })
    }

    const pkg = rows[0]

    // 2. Seat availability check
    if (pkg.total_seats !== null && pkg.seats_booked + numTravellers > pkg.total_seats) {
      return NextResponse.json({ error: 'Not enough seats available.' }, { status: 409 })
    }

    // 3. Generate booking ref (retry to avoid collision — unlikely but safe)
    let bookingRef = generateRef()
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.$queryRawUnsafe<{ booking_ref: string }[]>(
        `SELECT booking_ref FROM package_bookings WHERE booking_ref = $1 LIMIT 1`,
        bookingRef
      )
      if (!existing || existing.length === 0) break
      bookingRef = generateRef()
    }

    // 4. Calculate prices
    const totalPrice = (Number(pkg.price_per_person) || 0) * numTravellers
    const depositDue = pkg.deposit_amount ? Number(pkg.deposit_amount) * numTravellers : null
    const currency = pkg.currency || 'USD'

    // 5. Insert booking — payment_pending means awaiting online deposit
    const initialPaymentStatus = payment_gateway ? 'payment_pending' : 'pending'
    await prisma.$executeRawUnsafe(
      `INSERT INTO package_bookings
         (booking_ref, package_id, package_title, package_slug, client_name, client_email,
          client_phone, client_country, num_travellers, special_requests,
          total_price, deposit_amount, currency, payment_status, payment_gateway,
          payment_currency, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending',NOW(),NOW())`,
      bookingRef,
      packageId,
      packageTitle.trim(),
      packageSlug,
      clientName.trim(),
      clientEmail.toLowerCase().trim(),
      (clientPhone && clientPhone.trim()) ? clientPhone.trim() : null,
      (clientCountry && clientCountry.trim()) ? clientCountry.trim() : null,
      numTravellers,
      (specialRequests && specialRequests.trim()) ? specialRequests.trim() : null,
      totalPrice,
      depositDue,
      currency,
      initialPaymentStatus,
      payment_gateway || null,
      payment_currency || null
    )

    // 6. Increment seats_booked
    await prisma.$executeRawUnsafe(
      `UPDATE travel_packages SET seats_booked = seats_booked + $1, updated_at = NOW() WHERE id = $2`,
      numTravellers,
      packageId
    )

    // 7. Send emails (non-blocking on failure)
    try {
      const resend = getResend()

      const clientHtml = buildClientEmailHtml({
        clientName: clientName.trim(),
        clientEmail: clientEmail.toLowerCase().trim(),
        packageTitle: packageTitle.trim(),
        numTravellers,
        bookingRef,
        totalPrice,
        depositDue,
        currency,
      })

      const teamHtml = buildTeamEmailHtml({
        clientName: clientName.trim(),
        clientEmail: clientEmail.toLowerCase().trim(),
        clientPhone: (clientPhone && clientPhone.trim()) ? clientPhone.trim() : null,
        clientCountry: (clientCountry && clientCountry.trim()) ? clientCountry.trim() : null,
        packageTitle: packageTitle.trim(),
        packageSlug,
        numTravellers,
        bookingRef,
        totalPrice,
        depositDue,
        currency,
        specialRequests: (specialRequests && specialRequests.trim()) ? specialRequests.trim() : null,
      })

      await Promise.all([
        resend.emails.send({
          from: FROM_ADDRESS,
          to: clientEmail.toLowerCase().trim(),
          subject: `Your Walz Travels Booking — ${bookingRef}`,
          html: clientHtml,
        }),
        resend.emails.send({
          from: FROM_ADDRESS,
          to: TEAM_EMAILS,
          subject: `New Booking — ${bookingRef} — ${clientName.trim()}`,
          html: teamHtml,
        }),
      ])
    } catch (emailError) {
      console.error('[PackageBooking] Email send failed:', emailError)
      // Do not fail the request — booking is already saved
    }

    return NextResponse.json({ success: true, bookingRef })
  } catch (dbError) {
    console.error('[PackageBooking] DB error:', dbError)
    return NextResponse.json({ error: 'Booking failed. Please try again.' }, { status: 500 })
  }
}
