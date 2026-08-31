import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { createCustomerNotification, resolveUserIdForBookingNotification } from '@/lib/portal/notifications'
import { sendTravelCreditEmail } from '@/lib/voucher-email'
import { trackCommercialEvent } from '@/lib/commercial/track'
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
    resolveUserIdForBookingNotification({ userId: booking.userId, contactEmail: booking.contactEmail })
      .then(uid => {
        if (!uid) return
        return createCustomerNotification({
          userId: uid,
          category: 'BOOKING',
          type: 'booking_confirmed',
          title: 'Booking confirmed',
          body: `Your ${booking.type.toLowerCase()} booking ${booking.bookingReference} has been confirmed.`,
          href: `/dashboard/bookings/${booking.id}`,
          entityType: 'booking',
          entityId: booking.id,
          dedupeKey: `booking_confirmed_${booking.id}`,
        })
      })
      .catch(err => console.error('[Admin Booking] CONFIRMED notification failed (non-fatal):', err))

    // ── Miles earning — only on CONFIRMED, never CANCELLED/REFUNDED/FAILED ──
    try {
      const MILES_PER_CURRENCY_UNIT = parseFloat(process.env.MILES_PER_CURRENCY_UNIT ?? '1')
      const amount = booking.totalAmount ? Number(booking.totalAmount) : 0
      const earnedMiles = Math.floor(amount * MILES_PER_CURRENCY_UNIT)
      if (earnedMiles > 0 && booking.userId) {
        // Application-level idempotency guard (fast path — avoids a DB write on re-confirm)
        const alreadyEarned = await prisma.walzMilesTransaction.findFirst({
          where: { bookingId: booking.id, type: 'earned' },
          select: { id: true },
        })
        if (alreadyEarned) {
          console.log('[Admin Booking] Miles already awarded for booking', booking.id, '— skipping duplicate')
        } else {
          try {
            // Ensure the membership row exists and get its id.
            // Do NOT increment the balance here — balance is only credited after the
            // transaction row is successfully written. This prevents a concurrent
            // confirm that races past the findFirst above from double-incrementing.
            const membership = await prisma.walzRewardsMembership.upsert({
              where: { userId: booking.userId },
              create: { userId: booking.userId, tier: 'bronze', milesBalance: 0, lifetimeMiles: 0 },
              update: {},
            })
            // Write the idempotency anchor first. The DB-level @@unique([bookingId, type])
            // constraint makes this the atomic gate: a concurrent confirm that raced past
            // the findFirst above will be rejected here with P2002 instead of producing a
            // duplicate row and double-incrementing the balance.
            await prisma.walzMilesTransaction.create({
              data: {
                membershipId: membership.id,
                miles: earnedMiles,
                type: 'earned',
                description: 'Booking confirmed',
                bookingId: booking.id,
              },
            })
            // Balance is only incremented after the transaction row is committed —
            // a P2002-rejected duplicate never reaches this line.
            await prisma.walzRewardsMembership.update({
              where: { id: membership.id },
              data: { milesBalance: { increment: earnedMiles }, lifetimeMiles: { increment: earnedMiles } },
            })
            trackCommercialEvent('miles_earned', {
              userId: booking.userId,
              amount: earnedMiles,
              metadata: { bookingId: booking.id, currency: booking.currency },
            })
          } catch (e) {
            if ((e as { code?: string }).code === 'P2002') {
              // Unique constraint violation: a concurrent confirm already wrote this
              // transaction — balance has already been (or is being) credited. Skip silently.
              console.log('[Admin Booking] Miles transaction unique violation — concurrent confirm, skipping', booking.id)
            } else {
              throw e // re-throw unexpected errors (still non-fatal at outer try-catch)
            }
          }
        } // end else (no prior transaction)
      }
    } catch { /* non-fatal — miles earning must never block booking confirmation */ }

    return NextResponse.json({ success: true, status: 'CONFIRMED' })
  }

  if (action === 'MARK_CANCELLED') {
    await prisma.booking.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    })
    resolveUserIdForBookingNotification({ userId: booking.userId, contactEmail: booking.contactEmail })
      .then(uid => {
        if (!uid) return
        return createCustomerNotification({
          userId: uid,
          category: 'BOOKING',
          type: 'booking_cancelled',
          title: booking.paymentStatus === 'SUCCEEDED' ? 'Booking cancelled — refund in progress' : 'Booking cancelled',
          body: booking.paymentStatus === 'SUCCEEDED'
            ? `Your booking ${booking.bookingReference} has been cancelled. Your refund is being processed.`
            : `Your booking ${booking.bookingReference} has been cancelled.`,
          href: `/dashboard/bookings/${booking.id}`,
          entityType: 'booking',
          entityId: booking.id,
          dedupeKey: `booking_cancelled_${booking.id}`,
        })
      })
      .catch(err => console.error('[Admin Booking] CANCELLED notification failed (non-fatal):', err))
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
