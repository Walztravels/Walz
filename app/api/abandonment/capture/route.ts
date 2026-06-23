import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Jade at Walz Travels <jade@walztravels.com>'

type AbandonType = 'flight_search' | 'visa_application' | 'booking_checkout'

function buildEmail(
  type:  AbandonType,
  name:  string | null,
  data:  Record<string, string | number | null>,
): { subject: string; html: string } {
  const hi = name ? `Hi ${name}` : 'Hi there'

  if (type === 'flight_search') {
    const origin      = data.origin      ? String(data.origin)      : ''
    const destination = data.destination ? String(data.destination) : ''
    const date        = data.date        ? String(data.date)        : ''
    return {
      subject: `✈️ Still searching for flights${destination ? ` to ${destination}` : ''}?`,
      html: `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)">
  <div style="background:#0B1F3A;padding:24px 28px">
    <p style="color:#C9A84C;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px">Walz Travels</p>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0">Your flight search is waiting ✈️</h1>
  </div>
  <div style="padding:24px 28px">
    <p style="color:#374151;font-size:14px;margin:0 0 16px">${hi},<br><br>
    We noticed you were searching for flights${origin && destination ? ` from <strong>${origin}</strong> to <strong>${destination}</strong>` : ''}${date ? ` on <strong>${date}</strong>` : ''}.
    The best fares are available right now — let us help you find them.</p>
    ${origin && destination ? `<div style="background:#F8F8F8;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center">
      <p style="color:#0B1F3A;font-weight:700;font-size:16px;margin:0">${origin} → ${destination}</p>
      ${date ? `<p style="color:#6B7280;font-size:13px;margin:4px 0 0">${date}</p>` : ''}
    </div>` : ''}
    <a href="https://walztravels.com/flights" style="display:block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;text-decoration:none;padding:14px;border-radius:10px;text-align:center;margin:0 0 16px">
      Continue My Search →
    </a>
    <p style="color:#6B7280;font-size:13px;margin:0">
      Or chat with <strong>Jade</strong> — our AI can find the best fares and book for you directly.
    </p>
    <p style="color:#9CA3AF;font-size:11px;margin:20px 0 0">
      WhatsApp: <a href="https://wa.me/447398753797" style="color:#C9A84C">+44 7398 753797</a> ·
      <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a>
    </p>
  </div>
</div>
</body></html>`,
    }
  }

  if (type === 'visa_application') {
    const destination = data.destination ? String(data.destination) : ''
    return {
      subject: `📋 Complete your${destination ? ` ${destination}` : ''} visa application`,
      html: `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)">
  <div style="background:#0B1F3A;padding:24px 28px">
    <p style="color:#C9A84C;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px">Walz Travels</p>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0">Your visa application isn't finished yet</h1>
  </div>
  <div style="padding:24px 28px">
    <p style="color:#374151;font-size:14px;margin:0 0 16px">${hi},<br><br>
    You started a visa application${destination ? ` for <strong>${destination}</strong>` : ''} but didn't quite finish.
    Our specialists are ready to help — processing can take 3–8 weeks, so don't wait too long!</p>
    <a href="https://walztravels.com/visa" style="display:block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;text-decoration:none;padding:14px;border-radius:10px;text-align:center;margin:0 0 16px">
      Continue My Application →
    </a>
    <p style="color:#6B7280;font-size:13px;margin:0">
      Questions? Reply to this email or WhatsApp us — we typically respond within 30 minutes.
    </p>
    <p style="color:#9CA3AF;font-size:11px;margin:20px 0 0">
      WhatsApp: <a href="https://wa.me/447398753797" style="color:#C9A84C">+44 7398 753797</a>
    </p>
  </div>
</div>
</body></html>`,
    }
  }

  // booking_checkout
  return {
    subject: '🎫 Your booking is almost complete — pick up where you left off',
    html: `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)">
  <div style="background:#0B1F3A;padding:24px 28px">
    <p style="color:#C9A84C;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px">Walz Travels</p>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0">Almost there!</h1>
  </div>
  <div style="padding:24px 28px">
    <p style="color:#374151;font-size:14px;margin:0 0 16px">${hi},<br><br>
    You were so close to completing your booking! Your details are safe — just click below to pick up where you left off.</p>
    <a href="https://walztravels.com/flights" style="display:block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;text-decoration:none;padding:14px;border-radius:10px;text-align:center;margin:0 0 16px">
      Complete My Booking →
    </a>
    <p style="color:#9CA3AF;font-size:11px;margin:20px 0 0">
      Need help? Call us: <a href="tel:+19843880110" style="color:#C9A84C">+1 984-388-0110</a>
    </p>
  </div>
</div>
</body></html>`,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      email?: string
      name?:  string
      type:   AbandonType
      step?:  string
      data?:  Record<string, string | number | null>
    }

    const { email, name, type, step, data = {} } = body
    if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 })

    // Save to DB (best-effort — don't fail the response if prisma is slow)
    let emailSent = false
    try {
      await prisma.abandonedSession.create({
        data: { email: email ?? null, name: name ?? null, type, step: step ?? null, data, emailSent: false },
      })
    } catch (dbErr) {
      console.error('[abandonment] db save error:', dbErr)
    }

    // Send follow-up email if we have an address
    if (email) {
      try {
        const { subject, html } = buildEmail(type, name ?? null, data)
        await resend.emails.send({ from: FROM, to: email, subject, html })
        emailSent = true
        await prisma.abandonedSession.updateMany({
          where: { email, type, emailSent: false },
          data:  { emailSent: true },
        })
      } catch (emailErr) {
        console.error('[abandonment] email error:', emailErr)
      }
    }

    return NextResponse.json({ success: true, emailSent })
  } catch (err) {
    console.error('[abandonment/capture]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
