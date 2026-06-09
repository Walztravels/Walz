import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { sendTravelCreditEmail } from '@/lib/voucher-email'
import { z } from 'zod'
import { nanoid } from 'nanoid'

const actionSchema = z.object({
  action: z.enum(['MARK_CONFIRMED', 'MARK_CANCELLED', 'SEND_UPDATE', 'CANCEL_WITH_CREDIT']),
  message: z.string().optional(),
  creditAmount: z.number().positive().optional(),
  creditCurrency: z.string().optional(),
})

async function generateCreditCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = `WALZ-CRED-${nanoid(8).toUpperCase()}`
    const existing = await prisma.voucher.findUnique({ where: { code } })
    if (!existing) return code
  }
  throw new Error('Failed to generate unique voucher code')
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const booking = await prisma.booking.findUnique({ where: { id: params.id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(booking)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({ where: { id: params.id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { action, message, creditAmount, creditCurrency } = parsed.data

  if (action === 'MARK_CONFIRMED') {
    await prisma.booking.update({
      where: { id: params.id },
      data: { status: 'CONFIRMED' },
    })
    return NextResponse.json({ success: true, status: 'CONFIRMED' })
  }

  if (action === 'MARK_CANCELLED') {
    await prisma.booking.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    })
    return NextResponse.json({ success: true, status: 'CANCELLED' })
  }

  if (action === 'CANCEL_WITH_CREDIT') {
    const amount = creditAmount ?? booking.totalAmount
    const currency = creditCurrency ?? booking.currency

    // Generate unique voucher code
    const code = await generateCreditCode()

    // 12-month expiry
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    // Determine recipient from booking
    const recipientEmail = booking.contactEmail
    const passengers = booking.passengers as Array<{ firstName?: string; lastName?: string }> | null
    const firstPax = Array.isArray(passengers) ? passengers[0] : null
    const recipientName = firstPax
      ? `${firstPax.firstName ?? ''} ${firstPax.lastName ?? ''}`.trim()
      : booking.contactEmail

    // Cancel booking + create voucher in a transaction
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: params.id },
        data: { status: 'CANCELLED' },
      }),
      prisma.voucher.create({
        data: {
          code,
          name: `Travel Credit — ${booking.bookingReference ?? params.id}`,
          voucherKind: 'credit',
          serviceType: 'all',
          discountType: 'fixed',
          amount,
          currency,
          remainingAmount: amount,
          maxUses: 10,          // allow partial redemptions
          usedCount: 0,
          status: 'ACTIVE',
          active: true,
          recipientName,
          recipientEmail,
          redeemedBookingId: booking.bookingReference ?? params.id,
          expiresAt,
        },
      }),
    ])

    // Send email to client
    try {
      await sendTravelCreditEmail({
        recipientName,
        recipientEmail,
        code,
        amount,
        currency,
        bookingReference: booking.bookingReference ?? params.id,
        expiresAt,
      })
    } catch (err) {
      console.error('Failed to send travel credit email:', err)
      // Don't fail the whole request — voucher is already created
    }

    return NextResponse.json({ success: true, status: 'CANCELLED', voucherCode: code })
  }

  if (action === 'SEND_UPDATE') {
    const resend = getResend()
    await resend.emails.send({
      from: 'Walz Travels <bookings@walztravels.com>',
      to: booking.contactEmail,
      subject: `Booking Update — ${booking.bookingReference ?? booking.pnr} | Walz Travels`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#F7F4EF;">
          <div style="max-width:600px;margin:0 auto;background:#fff;">
            <div style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:32px 40px;text-align:center;">
              <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
            </div>
            <div style="padding:32px 40px;">
              <h2 style="color:#0A1628;margin:0 0 16px;">Booking Update</h2>
              <p style="color:#1C3557;line-height:1.6;">
                Reference: <strong>${booking.bookingReference ?? booking.pnr}</strong>
              </p>
              <div style="margin:20px 0;padding:16px 20px;background:#F7F4EF;border-left:4px solid #C9A84C;border-radius:8px;">
                <p style="margin:0;color:#1C3557;">${message ?? 'Your booking is being processed.'}</p>
              </div>
              <p style="color:#8B9BAE;font-size:13px;">
                Questions? Email <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    })
    return NextResponse.json({ success: true, emailSent: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
