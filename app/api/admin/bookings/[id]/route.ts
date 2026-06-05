import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { z } from 'zod'

const actionSchema = z.object({
  action: z.enum(['MARK_CONFIRMED', 'MARK_CANCELLED', 'SEND_UPDATE']),
  message: z.string().optional(),
})

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

  const { action, message } = parsed.data

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
              <span style="font-size:24px;font-weight:700;color:#C9A84C;">Walz Travels</span>
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
