// Branded "Trip Confirmed" email sent to the client once when ALL required
// fulfilment items reach CONFIRMED or BOOKED status.
// Called from the admin fulfilment PATCH route — never called more than once
// per itinerary (caller checks state transition).

import { BUSINESS } from '@/lib/config/business'

const RESEND_API = 'https://api.resend.com'
const FROM       = 'Walz Travels <bookings@walztravels.com>'

interface ConfirmedItem {
  type:              string
  description:       string
  clientReference:   string | null
  supplierReference: string | null
}

export interface TripConfirmedEmailParams {
  to:              string
  clientName:      string
  referenceNumber: string
  destination?:    string
  confirmedItems:  ConfirmedItem[]
}

const TYPE_LABELS: Record<string, string> = {
  FLIGHT: 'Flight', HOTEL: 'Hotel', TRANSFER: 'Transfer',
  TOUR: 'Experience', TRAIN: 'Train', FERRY: 'Ferry',
  ESIM: 'eSIM', OTHER: 'Service',
}

export async function sendTripConfirmedEmail({
  to, clientName, referenceNumber, destination, confirmedItems,
}: TripConfirmedEmailParams): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log('[email-trip-confirmed] No RESEND_API_KEY — email not sent for', referenceNumber)
    return
  }

  const name    = clientName || 'Traveller'
  const dest    = destination ? ` to ${destination}` : ''
  const itemRows = confirmedItems
    .filter(i => i.type !== 'ESIM')
    .map(i => {
      const label    = TYPE_LABELS[i.type] ?? i.type
      const refLine  = i.clientReference
        ? `<br><span style="color:#8B9BAE;font-size:12px;">Ref: <strong style="color:#C9A84C">${i.clientReference}</strong></span>`
        : i.supplierReference
        ? `<br><span style="color:#8B9BAE;font-size:12px;">Ref: <strong style="color:#C9A84C">${i.supplierReference}</strong></span>`
        : ''
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #1E3A5A;">
            <span style="color:#8B9BAE;font-size:11px;text-transform:uppercase;letter-spacing:1px;">${label}</span><br>
            <span style="color:#EDF2F7;font-size:14px;font-weight:600;">${i.description}</span>
            ${refLine}
          </td>
        </tr>
      `
    })
    .join('')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>Your Trip is Confirmed — Walz Travels</title>
    </head>
    <body style="margin:0;padding:0;font-family:'DM Sans',system-ui,sans-serif;background:#0B1F3A;">
      <div style="max-width:600px;margin:0 auto;background:#0F2A48;">

        <!-- Header -->
        <div style="padding:32px 40px 20px;text-align:center;border-bottom:2px solid #C9A84C;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="140"
            style="display:block;margin:0 auto 12px;width:140px;height:auto;" />
        </div>

        <!-- Hero -->
        <div style="background:linear-gradient(135deg,#C9A84C,#E8C97A);padding:32px 40px;text-align:center;">
          <p style="margin:0 0 6px;color:#0B1F3A;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
            ✦ All Bookings Confirmed
          </p>
          <h1 style="margin:0 0 6px;font-size:28px;color:#0B1F3A;font-weight:700;line-height:1.2;">
            Your Trip is Confirmed${dest ? `<br>${destination}` : ''}
          </h1>
          <p style="margin:0;color:#1C3557;font-size:14px;">Everything is booked and ready for your journey.</p>
        </div>

        <!-- Body -->
        <div style="padding:36px 40px;">
          <p style="margin:0 0 24px;color:#A0B4C8;font-size:15px;line-height:1.7;">
            Hi ${name},<br><br>
            Wonderful news — every component of your trip${dest} has been confirmed.
            Your complete booking details are below, and your full travel documents are
            available in your trip portal.
          </p>

          <!-- Reference card -->
          <div style="background:#0B1F3A;border-radius:14px;padding:22px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 4px;color:#8B9BAE;font-size:11px;letter-spacing:2px;text-transform:uppercase;">
              Booking Reference
            </p>
            <p style="margin:0;color:#C9A84C;font-size:34px;font-weight:700;letter-spacing:8px;font-family:monospace;">
              ${referenceNumber}
            </p>
          </div>

          <!-- Confirmed items -->
          ${itemRows ? `
          <h3 style="margin:0 0 4px;color:#EDF2F7;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
            Your Confirmed Bookings
          </h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #1E3A5A;">
            ${itemRows}
          </table>
          ` : ''}

          <!-- Portal CTA -->
          <div style="margin-top:32px;text-align:center;">
            <p style="margin:0 0 16px;color:#A0B4C8;font-size:14px;">
              View your full itinerary, travel documents, and booking references in your trip portal.
            </p>
            <a href="https://walztravels.com/itinerary/${referenceNumber}/portal"
              style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;
                     padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
              View My Trip Portal →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:24px 40px;background:#0B1F3A;border-top:1px solid #1E3A5A;text-align:center;">
          <p style="margin:0 0 8px;color:#8B9BAE;font-size:13px;">
            Questions? We&apos;re here to help.
          </p>
          <p style="margin:0;color:#8B9BAE;font-size:13px;">
            📧 <a href="mailto:${BUSINESS.contacts.email}" style="color:#C9A84C;text-decoration:none;">${BUSINESS.contacts.email}</a>
            &nbsp;&nbsp;
            📱 <a href="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}" style="color:#C9A84C;text-decoration:none;">
              ${BUSINESS.contacts.globalWhatsapp.display}
            </a>
          </p>
        </div>

        <div style="padding:16px 40px;text-align:center;border-top:1px solid #1E3A5A;">
          <p style="margin:0;color:#4A6180;font-size:12px;">
            © Walz Travels · ${referenceNumber}
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM,
      to,
      subject: `Your Trip is Confirmed — ${referenceNumber} | Walz Travels`,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('[email-trip-confirmed] Resend error:', res.status, body)
  }
}
