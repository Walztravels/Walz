import { Resend } from 'resend'
import type { BookingPassenger, BookingAddon } from '@/types/booking'
import { TRUSTPILOT_AFS_EMAIL } from '@/lib/email-visa'

// Lazy init — avoids crashing at build time when RESEND_API_KEY is not set
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set')
  }
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM_ADDRESS = 'Walz Travels <bookings@walztravels.com>'
const ADMIN_EMAIL = 'contact@walztravels.com'

interface FlightEmailDetails {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  airline: string
  flightNumber: string
}

interface HotelEmailDetails {
  name: string
  checkIn: string
  checkOut: string
  city: string
}

interface BookingEmailData {
  contactEmail: string
  contactPhone?: string
  passengers: BookingPassenger[]
  totalPrice: number
  currency: string
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE'
  addons?: BookingAddon[]
  flightDetails?: FlightEmailDetails
  hotelDetails?: HotelEmailDetails
}

interface AdminNotificationData extends BookingEmailData {
  bookingReference: string
  pnr: string
  orderId?: string
  gateway: 'flutterwave' | 'stripe' | 'helcim'
  flutterwaveTransactionId?: string
  stripePaymentIntentId?: string
  helcimTransactionId?: string | number
}

// ── Shared header / footer helpers ─────────────────────────────────────────────

function emailHeader(): string {
  return `
    <div style="background: linear-gradient(135deg, #0A1628, #1C3557); padding: 36px 40px 28px; text-align: center;">
      <img
        src="https://walztravels.com/walz-logo.png"
        alt="Walz Travels"
        width="200"
        height="200"
        style="display: block; margin: 0 auto 10px; width: 200px; height: auto;"
      />
      <p style="margin: 0; color: #8B9BAE; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase;">Luxury Travel Agency</p>
    </div>
  `
}

function emailFooter(): string {
  return `
    <div style="padding: 24px 40px; background: #F7F4EF; border-top: 1px solid #E2D9CC;">
      <p style="margin: 0 0 8px; color: #0A1628; font-weight: 600; font-size: 14px;">Need help?</p>
      <p style="margin: 0; color: #8B9BAE; font-size: 13px;">
        📧 <a href="mailto:info@walztravels.com" style="color: #C9A84C; text-decoration: none;">info@walztravels.com</a>&nbsp;&nbsp;
        📱 <a href="https://wa.me/447398753797" style="color: #C9A84C; text-decoration: none;">+44 7398 753797</a>
      </p>
    </div>
    <div style="padding: 24px 40px; text-align: center; border-top: 1px solid #E2D9CC;">
      <p style="margin: 0; color: #8B9BAE; font-size: 12px;">
        © ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.<br>
        IATA Certified
      </p>
    </div>
  `
}

function passengerTypeLabel(type: 'ADT' | 'CHD' | 'INF'): string {
  return type === 'ADT' ? 'Adult' : type === 'CHD' ? 'Child' : 'Infant'
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

// ── sendBookingConfirmation ─────────────────────────────────────────────────────

export async function sendBookingConfirmation(booking: BookingEmailData, pnr: string) {
  const passengerRows = booking.passengers
    .map(
      (p, i) => `
        <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#F7F4EF'};">
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2D9CC; color: #1C3557; font-weight: 600;">
            ${p.firstName} ${p.lastName}
            ${i === 0 ? '<span style="margin-left:6px;background:#C9A84C;color:#0A1628;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700;">LEAD</span>' : ''}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2D9CC; color: #1C3557;">${passengerTypeLabel(p.type)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2D9CC; color: #1C3557;">${p.dateOfBirth}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #E2D9CC; color: #1C3557; font-family: monospace;">${p.passportNumber.toUpperCase()}</td>
        </tr>
      `
    )
    .join('')

  const flightSection = booking.flightDetails
    ? `
    <div style="margin: 24px 0; padding: 20px; background: #F7F4EF; border-radius: 12px; border-left: 4px solid #C9A84C;">
      <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 16px;">✈️ Flight Details</h3>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Route:</strong> ${booking.flightDetails.origin} → ${booking.flightDetails.destination}</p>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Departure:</strong> ${booking.flightDetails.departureDate}</p>
      ${booking.flightDetails.returnDate ? `<p style="margin: 4px 0; color: #1C3557;"><strong>Return:</strong> ${booking.flightDetails.returnDate}</p>` : ''}
      <p style="margin: 4px 0; color: #1C3557;"><strong>Airline:</strong> ${booking.flightDetails.airline}</p>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Flight No:</strong> ${booking.flightDetails.flightNumber}</p>
    </div>
    `
    : ''

  const hotelSection = booking.hotelDetails
    ? `
    <div style="margin: 24px 0; padding: 20px; background: #F7F4EF; border-radius: 12px; border-left: 4px solid #C9A84C;">
      <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 16px;">🏨 Hotel Details</h3>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Hotel:</strong> ${booking.hotelDetails.name}</p>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Location:</strong> ${booking.hotelDetails.city}</p>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Check-in:</strong> ${booking.hotelDetails.checkIn}</p>
      <p style="margin: 4px 0; color: #1C3557;"><strong>Check-out:</strong> ${booking.hotelDetails.checkOut}</p>
    </div>
    `
    : ''

  const selectedAddons = (booking.addons ?? []).filter((a) => a.selected)
  const addonsSection =
    selectedAddons.length > 0
      ? `
    <div style="margin: 24px 0;">
      <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 16px;">Add-ons</h3>
      ${selectedAddons
        .map(
          (a) =>
            `<p style="margin: 4px 0; color: #1C3557;">✓ ${a.description} — ${formatCurrency(a.price, a.currency)}</p>`
        )
        .join('')}
    </div>
    `
      : ''

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation — Walz Travels</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'DM Sans', system-ui, sans-serif; background-color: #F7F4EF;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">

        ${emailHeader()}

        <!-- Success Banner -->
        <div style="background: linear-gradient(135deg, #C9A84C, #E8C97A); padding: 24px 40px; text-align: center;">
          <h1 style="margin: 0 0 4px; font-size: 24px; color: #0A1628; font-weight: 700;">Booking Confirmed! 🎉</h1>
          <p style="margin: 0; color: #0F2340; font-size: 14px;">Your adventure is officially booked</p>
        </div>

        <!-- PNR Reference -->
        <div style="padding: 32px 40px; border-bottom: 1px solid #E2D9CC;">
          <div style="background: #0A1628; border-radius: 12px; padding: 20px; text-align: center;">
            <p style="margin: 0 0 4px; color: #8B9BAE; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Your Booking Reference</p>
            <p style="margin: 0; color: #C9A84C; font-size: 32px; font-weight: 700; letter-spacing: 8px;">${pnr}</p>
            <p style="margin: 8px 0 0; color: #8B9BAE; font-size: 12px;">Keep this reference — you'll need it at the airport</p>
          </div>
        </div>

        <!-- Content -->
        <div style="padding: 32px 40px;">

          ${flightSection}
          ${hotelSection}

          <!-- Passengers -->
          <div style="margin: 24px 0;">
            <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 16px;">👥 Passengers</h3>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #E2D9CC; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background: #0A1628;">
                  <th style="padding: 10px 12px; text-align: left; color: #C9A84C; font-size: 12px;">Name</th>
                  <th style="padding: 10px 12px; text-align: left; color: #C9A84C; font-size: 12px;">Type</th>
                  <th style="padding: 10px 12px; text-align: left; color: #C9A84C; font-size: 12px;">Date of Birth</th>
                  <th style="padding: 10px 12px; text-align: left; color: #C9A84C; font-size: 12px;">Passport</th>
                </tr>
              </thead>
              <tbody>
                ${passengerRows}
              </tbody>
            </table>
          </div>

          ${addonsSection}

          <!-- Price Breakdown -->
          <div style="margin: 24px 0; border: 1px solid #E2D9CC; border-radius: 12px; overflow: hidden;">
            <div style="padding: 16px 20px; background: #F7F4EF; border-bottom: 1px solid #E2D9CC;">
              <h3 style="margin: 0; color: #0A1628; font-size: 15px;">Payment Summary</h3>
            </div>
            <div style="padding: 16px 20px;">
              ${
                selectedAddons.length > 0
                  ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span style="color: #8B9BAE; font-size: 13px;">Flight</span>
                  <span style="color: #1C3557; font-size: 13px;">${formatCurrency(booking.totalPrice - selectedAddons.reduce((s, a) => s + a.price, 0), booking.currency)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <span style="color: #8B9BAE; font-size: 13px;">Add-ons</span>
                  <span style="color: #1C3557; font-size: 13px;">${formatCurrency(selectedAddons.reduce((s, a) => s + a.price, 0), booking.currency)}</span>
                </div>
                <hr style="border: none; border-top: 1px solid #E2D9CC; margin: 8px 0;">
                `
                  : ''
              }
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #0A1628; font-weight: 700; font-size: 15px;">Total Paid</span>
                <span style="color: #C9A84C; font-size: 22px; font-weight: 700;">${formatCurrency(booking.totalPrice, booking.currency)}</span>
              </div>
            </div>
          </div>

          <!-- What Next -->
          <div style="margin: 24px 0; padding: 20px; border: 1px solid #E2D9CC; border-radius: 12px;">
            <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 16px;">What happens next?</h3>
            <ul style="margin: 0; padding-left: 20px; color: #1C3557; line-height: 1.8;">
              <li>Your e-ticket will be sent within 24 hours</li>
              <li>Check your spam folder if you don't receive it</li>
              <li>Ensure your passport is valid for at least 6 months</li>
              <li>Check visa requirements for your destination</li>
              <li>We'll send travel updates to your WhatsApp${booking.contactPhone ? ` (${booking.contactPhone})` : ''}</li>
            </ul>
          </div>

        </div>

        ${emailFooter()}

      </div>
    </body>
    </html>
  `

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: booking.contactEmail,
    bcc: TRUSTPILOT_AFS_EMAIL,
    subject: `Booking Confirmed — Reference: ${pnr} | Walz Travels`,
    html,
  })
}

// ── sendBookingNotificationToAdmin ──────────────────────────────────────────────

export async function sendBookingNotificationToAdmin(data: AdminNotificationData) {
  const { bookingReference, pnr, orderId, gateway, flutterwaveTransactionId, stripePaymentIntentId } = data

  const passengerRows = data.passengers
    .map(
      (p, i) => `
        <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f9f9f9'};">
          <td style="padding: 8px 10px; border: 1px solid #ddd; font-weight: ${i === 0 ? '700' : '400'};">
            ${p.firstName} ${p.lastName}${i === 0 ? ' ⭐' : ''}
          </td>
          <td style="padding: 8px 10px; border: 1px solid #ddd;">${passengerTypeLabel(p.type)} (${p.gender === 'M' ? 'Male' : 'Female'})</td>
          <td style="padding: 8px 10px; border: 1px solid #ddd;">${p.dateOfBirth}</td>
          <td style="padding: 8px 10px; border: 1px solid #ddd; font-family: monospace;">${p.passportNumber.toUpperCase()}</td>
          <td style="padding: 8px 10px; border: 1px solid #ddd;">${p.passportExpiry}</td>
          <td style="padding: 8px 10px; border: 1px solid #ddd;">${p.nationality}</td>
          <td style="padding: 8px 10px; border: 1px solid #ddd;">${p.email ?? '—'}</td>
          <td style="padding: 8px 10px; border: 1px solid #ddd;">${p.phone ?? '—'}</td>
        </tr>
      `
    )
    .join('')

  const selectedAddons = (data.addons ?? []).filter((a) => a.selected)

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>New Booking — ${bookingReference}</title>
    </head>
    <body style="margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #f5f5f5;">
      <div style="max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

        <!-- Admin Header -->
        <div style="background: #0A1628; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:inline-block;vertical-align:middle;width:200px;height:auto;" />
            <span style="color: #8B9BAE; font-size: 13px; margin-left: 12px; vertical-align: middle;">Admin Notification</span>
          </div>
          <span style="background: #C9A84C; color: #0A1628; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase;">NEW BOOKING</span>
        </div>

        <div style="padding: 32px;">

          <!-- References -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px;">
            <div style="background: #0A1628; border-radius: 8px; padding: 16px; text-align: center;">
              <p style="margin: 0 0 4px; color: #8B9BAE; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;">Booking Reference</p>
              <p style="margin: 0; color: #C9A84C; font-size: 20px; font-weight: 700; letter-spacing: 3px;">${bookingReference}</p>
            </div>
            <div style="background: #0A1628; border-radius: 8px; padding: 16px; text-align: center;">
              <p style="margin: 0 0 4px; color: #8B9BAE; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;">Airline PNR</p>
              <p style="margin: 0; color: #C9A84C; font-size: 20px; font-weight: 700; letter-spacing: 3px;">${pnr}</p>
            </div>
            <div style="background: #0A1628; border-radius: 8px; padding: 16px; text-align: center;">
              <p style="margin: 0 0 4px; color: #8B9BAE; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;">Total Collected</p>
              <p style="margin: 0; color: #C9A84C; font-size: 20px; font-weight: 700;">${formatCurrency(data.totalPrice, data.currency)}</p>
            </div>
          </div>

          <!-- Contact -->
          <div style="margin-bottom: 24px; padding: 16px; background: #F7F4EF; border-radius: 8px; border-left: 4px solid #C9A84C;">
            <h3 style="margin: 0 0 10px; color: #0A1628; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Contact Details</h3>
            <p style="margin: 4px 0; color: #1C3557;">📧 <strong>Email:</strong> <a href="mailto:${data.contactEmail}" style="color: #C9A84C;">${data.contactEmail}</a></p>
            ${data.contactPhone ? `<p style="margin: 4px 0; color: #1C3557;">💬 <strong>WhatsApp:</strong> <a href="https://wa.me/${data.contactPhone.replace(/\D/g, '')}" style="color: #C9A84C;">${data.contactPhone}</a></p>` : ''}
          </div>

          <!-- Payment -->
          <div style="margin-bottom: 24px; padding: 16px; background: #F7F4EF; border-radius: 8px; border-left: 4px solid #22c55e;">
            <h3 style="margin: 0 0 10px; color: #0A1628; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Payment</h3>
            <p style="margin: 4px 0; color: #1C3557;"><strong>Gateway:</strong> ${gateway === 'flutterwave' ? 'Flutterwave' : 'Stripe'}</p>
            ${flutterwaveTransactionId ? `<p style="margin: 4px 0; color: #1C3557;"><strong>Transaction ID:</strong> <code>${flutterwaveTransactionId}</code></p>` : ''}
            ${stripePaymentIntentId ? `<p style="margin: 4px 0; color: #1C3557;"><strong>Payment Intent:</strong> <code>${stripePaymentIntentId}</code></p>` : ''}
            ${orderId ? `<p style="margin: 4px 0; color: #1C3557;"><strong>Duffel Order ID:</strong> <code>${orderId}</code></p>` : ''}
            <p style="margin: 4px 0; color: #1C3557;"><strong>Amount:</strong> ${formatCurrency(data.totalPrice, data.currency)}</p>
          </div>

          ${
            data.flightDetails
              ? `
          <!-- Flight -->
          <div style="margin-bottom: 24px; padding: 16px; background: #F7F4EF; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <h3 style="margin: 0 0 10px; color: #0A1628; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">✈️ Flight</h3>
            <p style="margin: 4px 0; color: #1C3557;"><strong>Route:</strong> ${data.flightDetails.origin} → ${data.flightDetails.destination}</p>
            <p style="margin: 4px 0; color: #1C3557;"><strong>Departure:</strong> ${data.flightDetails.departureDate}</p>
            ${data.flightDetails.returnDate ? `<p style="margin: 4px 0; color: #1C3557;"><strong>Return:</strong> ${data.flightDetails.returnDate}</p>` : ''}
            <p style="margin: 4px 0; color: #1C3557;"><strong>Airline:</strong> ${data.flightDetails.airline}</p>
            <p style="margin: 4px 0; color: #1C3557;"><strong>Flight No:</strong> ${data.flightDetails.flightNumber}</p>
          </div>
          `
              : ''
          }

          <!-- Passengers -->
          <div style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">👥 Passengers (${data.passengers.length})</h3>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #0A1628;">
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Name</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Type/Gender</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Date of Birth</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Passport No.</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Expiry</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Nationality</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">Email</th>
                    <th style="padding: 8px 10px; border: 1px solid #333; color: #C9A84C; text-align: left; white-space: nowrap;">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  ${passengerRows}
                </tbody>
              </table>
            </div>
          </div>

          ${
            selectedAddons.length > 0
              ? `
          <!-- Add-ons -->
          <div style="margin-bottom: 24px; padding: 16px; background: #F7F4EF; border-radius: 8px;">
            <h3 style="margin: 0 0 10px; color: #0A1628; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Add-ons</h3>
            ${selectedAddons.map((a) => `<p style="margin: 4px 0; color: #1C3557;">✓ ${a.description} — ${formatCurrency(a.price, a.currency)}</p>`).join('')}
          </div>
          `
              : ''
          }

          <!-- Action Buttons -->
          <div style="text-align: center; padding: 16px 0; border-top: 2px solid #E2D9CC; margin-top: 24px;">
            <p style="margin: 0 0 16px; color: #1C3557; font-size: 13px;">Take action on this booking:</p>
            <a href="https://walztravels.com/admin/bookings" style="display: inline-block; background: #0A1628; color: #C9A84C; font-weight: 700; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin: 0 8px; font-size: 14px;">View in CRM</a>
            <a href="mailto:${data.contactEmail}?subject=Your%20Booking%20${bookingReference}" style="display: inline-block; background: #C9A84C; color: #0A1628; font-weight: 700; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin: 0 8px; font-size: 14px;">Email Client</a>
          </div>

        </div>

        <div style="background: #0A1628; padding: 16px 32px; text-align: center;">
          <p style="margin: 0; color: #8B9BAE; font-size: 12px;">Walz Travels Admin Notification · ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })} GMT</p>
        </div>

      </div>
    </body>
    </html>
  `

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: ADMIN_EMAIL,
    subject: `🎫 NEW BOOKING ${bookingReference} — ${data.passengers[0]?.firstName} ${data.passengers[0]?.lastName} · ${formatCurrency(data.totalPrice, data.currency)}`,
    html,
  })
}

// ── Other email functions ───────────────────────────────────────────────────────

export async function sendVisaApplicationReceived(email: string, country: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>Visa Application Received</title></head>
    <body style="margin: 0; padding: 0; font-family: system-ui, sans-serif; background: #F7F4EF;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #0A1628, #1C3557); padding: 40px; text-align: center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
        </div>
        <div style="padding: 40px;">
          <h2 style="color: #0A1628; margin: 0 0 16px;">Visa Application Received</h2>
          <p style="color: #1C3557; line-height: 1.6;">
            Thank you for submitting your ${country} visa application with Walz Travels.
            Our visa specialists will review your application and contact you within <strong>2 business days</strong>.
          </p>
          <div style="margin: 24px 0; padding: 20px; background: linear-gradient(135deg, #C9A84C, #E8C97A); border-radius: 12px;">
            <p style="margin: 0; color: #0A1628; font-weight: 600;">What to expect:</p>
            <ul style="margin: 8px 0 0; padding-left: 20px; color: #0F2340;">
              <li>Document checklist via email within 24 hours</li>
              <li>Application review and guidance</li>
              <li>Regular status updates</li>
            </ul>
          </div>
          <p style="color: #8B9BAE; font-size: 13px;">
            Questions? Email us at <a href="mailto:visa@walztravels.com" style="color: #C9A84C;">visa@walztravels.com</a>
            or WhatsApp: <a href="https://wa.me/447398753797" style="color: #C9A84C;">+44 7398 753797</a>
          </p>
        </div>
        <div style="padding: 24px 40px; background: #F7F4EF; text-align: center;">
          <p style="margin: 0; color: #8B9BAE; font-size: 12px;">© ${new Date().getFullYear()} Walz Travels Ltd. IATA Certified</p>
        </div>
      </div>
    </body>
    </html>
  `

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `Visa Application Received — ${country} | Walz Travels`,
    html,
  })
}

export async function sendTourEnquiryConfirmation(email: string, tourName: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>Tour Enquiry Confirmation</title></head>
    <body style="margin: 0; padding: 0; font-family: system-ui, sans-serif; background: #F7F4EF;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #0A1628, #1C3557); padding: 40px; text-align: center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
        </div>
        <div style="padding: 40px;">
          <h2 style="color: #0A1628; margin: 0 0 16px;">Tour Enquiry Received!</h2>
          <p style="color: #1C3557; line-height: 1.6;">
            Thank you for your interest in the <strong>${tourName}</strong>.
            One of our dedicated tour specialists will be in touch within <strong>24 hours</strong>
            to discuss your personalised itinerary.
          </p>
          <div style="margin: 24px 0; padding: 20px; background: #F7F4EF; border-left: 4px solid #C9A84C; border-radius: 8px;">
            <p style="margin: 0; color: #0A1628; font-weight: 600; margin-bottom: 8px;">Your enquiry includes:</p>
            <p style="margin: 4px 0; color: #1C3557;">✓ Custom itinerary planning</p>
            <p style="margin: 4px 0; color: #1C3557;">✓ Private transportation</p>
            <p style="margin: 4px 0; color: #1C3557;">✓ Expert local guide</p>
            <p style="margin: 4px 0; color: #1C3557;">✓ Flexible scheduling</p>
          </div>
          <p style="color: #8B9BAE; font-size: 13px;">
            Can't wait? Contact us directly:<br>
            📧 <a href="mailto:tours@walztravels.com" style="color: #C9A84C;">tours@walztravels.com</a><br>
            📱 <a href="https://wa.me/447398753797" style="color: #C9A84C;">+44 7398 753797</a>
          </p>
        </div>
        <div style="padding: 24px 40px; background: #F7F4EF; text-align: center;">
          <p style="margin: 0; color: #8B9BAE; font-size: 12px;">© ${new Date().getFullYear()} Walz Travels Ltd. IATA Certified</p>
        </div>
      </div>
    </body>
    </html>
  `

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `Tour Enquiry Confirmed — ${tourName} | Walz Travels`,
    html,
  })
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>Reset Your Password</title></head>
    <body style="margin: 0; padding: 0; font-family: system-ui, sans-serif; background: #F7F4EF;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #0A1628, #1C3557); padding: 40px; text-align: center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
        </div>
        <div style="padding: 40px; text-align: center;">
          <h2 style="color: #0A1628; margin: 0 0 16px;">Reset Your Password</h2>
          <p style="color: #1C3557; line-height: 1.6; margin-bottom: 32px;">
            You requested a password reset for your Walz Travels account.
            Click the button below to set a new password. This link expires in 1 hour.
          </p>
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C, #E8C97A); color: #0A1628; font-weight: 700; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
            Reset Password
          </a>
          <p style="margin-top: 24px; color: #8B9BAE; font-size: 12px;">
            If you didn't request this, please ignore this email or contact support.
          </p>
        </div>
        <div style="padding: 24px 40px; background: #F7F4EF; text-align: center;">
          <p style="margin: 0; color: #8B9BAE; font-size: 12px;">© ${new Date().getFullYear()} Walz Travels Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'Reset Your Password — Walz Travels',
    html,
  })
}
