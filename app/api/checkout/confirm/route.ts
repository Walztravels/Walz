import { NextRequest, NextResponse } from 'next/server'
import { stripe }  from '@/lib/stripe'
import { Resend }  from 'resend'
import prisma      from '@/lib/db'
import { generateVoucherPDF }               from '@/lib/voucher/generateVoucher'
import { sendWhatsAppBookingConfirmation }  from '@/lib/whatsapp/sendBookingConfirmation'

const resend = new Resend(process.env.RESEND_API_KEY)
const SITE   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

function generateRef() {
  return 'WLZ-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  const { sessionId, gateway, txRef } = await req.json()

  const bookingReference = generateRef()
  let customerEmail = ''
  let customerName  = ''
  let customerPhone = ''
  let total         = 0
  let currency      = 'USD'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let voucherItems: any[] = []

  try {
    if (gateway !== 'flutterwave' && sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items'],
      })
      customerEmail = session.customer_details?.email ?? ''
      customerName  = session.customer_details?.name  ?? ''
      customerPhone = session.customer_details?.phone  ?? ''
      total         = (session.amount_total ?? 0) / 100
      currency      = (session.currency ?? 'usd').toUpperCase()

      const lineItems = session.line_items?.data ?? []
      const metaItems = JSON.parse(session.metadata?.items ?? '[]')

      // Merge metadata items (id/type/title) with Stripe line item amounts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      voucherItems = metaItems.map((meta: any, i: number) => ({
        id:       meta.id ?? `item-${i}`,
        type:     meta.type ?? 'service',
        title:    meta.title ?? lineItems[i]?.description ?? 'Travel Service',
        price:    lineItems[i]?.price?.unit_amount ? lineItems[i].price.unit_amount / 100 : 0,
        currency: (lineItems[i]?.price?.currency ?? session.currency ?? 'usd').toUpperCase(),
        quantity: lineItems[i]?.quantity ?? 1,
        meta:     {},
      }))
    }

    // Save to DB (silent fail)
    await prisma.booking.create({
      data: {
        bookingReference,
        type:          'ACTIVITY' as never,
        status:        'CONFIRMED' as never,
        paymentStatus: 'SUCCEEDED' as never,
        totalAmount:   total,
        currency,
        contactEmail:  customerEmail || 'unknown@walztravels.com',
        contactPhone:  customerPhone || null,
      },
    }).catch(e => console.error('[Cart Booking DB]', e))

    // Generate PDF voucher
    const voucherData = {
      bookingReference,
      customerName:  customerName || 'Valued Customer',
      customerEmail,
      items:         voucherItems,
      total,
      currency,
      createdAt:     new Date().toISOString(),
    }

    let pdfBuffer: Buffer | null = null
    try {
      pdfBuffer = await generateVoucherPDF(voucherData)
    } catch (e) {
      console.error('[Cart PDF generation]', e)
    }

    const voucherUrl = `${SITE}/api/voucher/${bookingReference}`

    // Send confirmation email with PDF attachment
    if (customerEmail) {
      await resend.emails.send({
        from:    'Walz Travels <bookings@walztravels.com>',
        to:      customerEmail,
        subject: `Booking Confirmed — ${bookingReference} | Your Voucher is Ready`,
        attachments: pdfBuffer ? [{
          filename:    `walz-voucher-${bookingReference}.pdf`,
          content:     pdfBuffer,
          contentType: 'application/pdf',
        }] : [],
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f5f0e8;padding:0">
            <div style="background:#0B1F3A;padding:32px;text-align:center">
              <img src="https://www.walztravels.com/walz-logo.png" width="140" alt="Walz Travels" />
            </div>
            <div style="padding:32px;background:#ffffff">
              <div style="text-align:center;margin-bottom:32px">
                <div style="width:64px;height:64px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
                  <span style="font-size:32px">✅</span>
                </div>
                <h1 style="color:#0B1F3A;font-size:24px;margin:0 0 8px">Booking Confirmed!</h1>
                <p style="color:#6b7280;margin:0">Hi ${customerName || 'there'}, your booking is all set.</p>
              </div>
              <div style="background:#f5f0e8;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
                <p style="color:#6b7280;font-size:12px;margin:0 0 8px;letter-spacing:2px">BOOKING REFERENCE</p>
                <p style="color:#C9A84C;font-size:28px;font-weight:bold;font-family:monospace;margin:0">${bookingReference}</p>
              </div>
              ${voucherItems.length > 0 ? `
                <h3 style="color:#0B1F3A;margin:0 0 12px">Your Bookings:</h3>
                ${voucherItems.map((i: { type: string; title: string; currency: string; price: number }) => `
                  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:8px">
                    <span style="font-size:10px;color:#C9A84C;font-weight:bold;text-transform:uppercase">${i.type}</span>
                    <p style="color:#0B1F3A;font-weight:bold;margin:4px 0 0">${i.title}</p>
                    ${i.price > 0 ? `<p style="color:#6b7280;margin:4px 0 0;font-size:14px">${i.currency} ${i.price}</p>` : ''}
                  </div>
                `).join('')}
              ` : ''}
              <div style="margin:24px 0">
                <a href="${voucherUrl}"
                  style="display:block;background:#C9A84C;color:#0B1F3A;font-weight:bold;
                    text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-size:16px">
                  Download Your Voucher PDF
                </a>
              </div>
              <p style="color:#6b7280;font-size:14px">
                Your voucher is also attached to this email. Present it at the point of service.
              </p>
              <div style="background:#f0fdf4;border-radius:12px;padding:16px;margin-top:24px">
                <p style="color:#166534;font-size:14px;margin:0">
                  Need help? WhatsApp us on
                  <a href="https://wa.me/447398753797" style="color:#16a34a;font-weight:bold">+44 7398 753797</a>
                </p>
              </div>
            </div>
            <div style="background:#0B1F3A;padding:24px;text-align:center">
              <p style="color:#9ca3af;font-size:12px;margin:0">
                Walz Travels LLC · walztravels.com · contact@walztravels.com
              </p>
            </div>
          </div>
        `,
      }).catch(e => console.error('[Cart Email send]', e))
    }

    // WhatsApp confirmation (fire and forget)
    if (customerPhone) {
      sendWhatsAppBookingConfirmation({
        customerPhone,
        customerName:     customerName || 'Valued Customer',
        bookingReference,
        items:            voucherItems,
        total,
        currency,
        voucherUrl,
      }).catch(e => console.error('[Cart WhatsApp]', e))
    }

    console.log('[Cart confirm]', { bookingReference, customerEmail, gateway, txRef })
    return NextResponse.json({ bookingReference, customerEmail, voucherUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Cart confirm]', msg)
    return NextResponse.json({ bookingReference, error: msg })
  }
}
