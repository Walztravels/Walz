import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { BUSINESS } from '@/lib/config/business'

// POST /api/itinerary/[ref]/approve
// Public endpoint — validates the one-time token and records the client signature.

export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const body = await req.json().catch(() => ({})) as { token?: string; signature?: string; name?: string }

  if (!body.token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['proposal', 'live'].includes(itin.status)) {
    return NextResponse.json({ error: 'This itinerary cannot be approved in its current state' }, { status: 409 })
  }

  // Validate token
  let options: Record<string, unknown> = {}
  try { options = JSON.parse(itin.options) } catch { options = {} }

  const storedToken = options.approvalToken as string | undefined
  const used        = options.approvalTokenUsed as boolean | undefined

  if (!storedToken || storedToken !== body.token) {
    return NextResponse.json({ error: 'Invalid or expired approval link' }, { status: 403 })
  }
  if (used) {
    return NextResponse.json({ error: 'This approval link has already been used' }, { status: 409 })
  }

  // Mark token as used, record approval
  options.approvalTokenUsed = true
  const signerName = body.name || itin.clientName

  await prisma.itinerary.update({
    where: { id: itin.id },
    data: {
      status:          'approved',
      approvedAt:      new Date(),
      clientSignature: body.signature ?? signerName,
      approvedBy:      signerName,
      options:         JSON.stringify(options),
      updatedAt:       new Date(),
    },
  })

  // Send confirmation emails (non-fatal)
  try {
    const resend = getResend()
    const BASE   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

    await resend.emails.send({
      from:    'Walz Travels <contact@walztravels.com>',
      to:      itin.clientEmail,
      subject: `Booking Confirmed — ${itin.referenceNumber}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#fff;">
          <div style="background:#0B1F3A;padding:28px 36px;text-align:center;">
            <img src="${BASE}/walz-logo.png" alt="Walz Travels" width="140" style="display:block;margin:0 auto 10px;"/>
          </div>
          <div style="padding:36px;">
            <h1 style="color:#0B1F3A;font-size:22px;margin:0 0 12px;">Your trip is confirmed! 🎉</h1>
            <p style="color:#475569;font-size:14px;margin:0 0 8px;">Dear ${signerName},</p>
            <p style="color:#475569;font-size:14px;margin:0 0 24px;">
              Thank you for approving your <strong>${itin.destination}</strong> itinerary
              (${itin.referenceNumber}). Your booking is now confirmed.
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#475569;">
                <strong>Trip:</strong> ${itin.title}
              </p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;">
                <strong>Reference:</strong> ${itin.referenceNumber}
              </p>
              ${itin.deposit ? `<p style="margin:0;font-size:14px;color:#C9A84C;font-weight:600;">Deposit of ${itin.currency === 'GBP' ? '£' : itin.currency === 'USD' ? '$' : itin.currency}${Number(itin.deposit).toLocaleString()} required to secure your booking.</p>` : ''}
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="${BASE}/itinerary/${itin.referenceNumber}" style="background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;display:inline-block;">View Itinerary →</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:24px;">
              Questions? <a href="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}" style="color:#C9A84C;">WhatsApp us</a> or email <a href="mailto:${BUSINESS.contacts.email}" style="color:#C9A84C;">${BUSINESS.contacts.email}</a>
            </p>
          </div>
        </div>`,
    })

    // Internal notification
    await resend.emails.send({
      from:    'Walz Travels System <contact@walztravels.com>',
      to:      BUSINESS.contacts.email,
      subject: `✅ Itinerary approved — ${itin.referenceNumber} (${signerName})`,
      html: `<p><strong>${signerName}</strong> approved itinerary <strong>${itin.referenceNumber}</strong> for ${itin.destination}.</p>
             <p>Signed at: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
             <p><a href="${BASE}/admin/itinerary-planner/${itin.id}">Open in admin →</a></p>`,
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, status: 'approved', referenceNumber: itin.referenceNumber })
}
