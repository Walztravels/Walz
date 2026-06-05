import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { Resend } from 'resend'

const FROM = 'Walz Travels <noreply@walztravels.com>'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

// GET /api/auth/verify-email?token=xxx  →  verify and redirect
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://walztravels.us'

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/login?error=InvalidToken`)
  }

  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationTokenExpires: { gt: new Date() },
    },
  })

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/verify-email?error=expired`)
  }

  // Mark verified and clear token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified:            new Date(),
      verificationToken:        null,
      verificationTokenExpires: null,
    },
  })

  // Send welcome email now that they're verified
  const resend = getResend()
  if (resend) {
    resend.emails.send({
      from: FROM,
      to:   user.email!,
      subject: 'Welcome to Walz Travels ✈️',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr><td style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:40px;text-align:center;">
          <img src="https://walztravels.us/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
          <p style="margin:0;color:#C9A84C;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Your account is active</p>
        </td></tr>

        <tr><td style="padding:36px 40px 0;">
          <p style="margin:0 0 16px;color:#0B1F3A;font-size:18px;font-weight:600;">Hi ${user.name ?? 'there'}, welcome aboard! 🎉</p>
          <p style="margin:0 0 20px;color:#4a5568;font-size:14px;line-height:1.8;">
            Your Walz Travels account is now active. You can manage your bookings, track visa applications,
            and access your gift vouchers — all from your personal dashboard.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <a href="https://walztravels.us/portal/dashboard"
               style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#E8C97A);color:#0B1F3A;font-weight:700;padding:15px 32px;border-radius:12px;text-decoration:none;font-size:15px;">
              Go to My Dashboard →
            </a>
          </div>
          <div style="background:#F7F8FA;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 12px;color:#0B1F3A;font-size:14px;font-weight:600;">🌍 What you can do with your account</p>
            <ul style="margin:0;padding:0 0 0 20px;color:#4a5568;font-size:13px;line-height:2.2;">
              <li>Book flights, hotels and tours</li>
              <li>Track your bookings in real time</li>
              <li>Apply for visa assistance</li>
              <li>Manage and redeem gift vouchers</li>
            </ul>
          </div>
        </td></tr>

        <tr><td style="background:#0B1F3A;padding:28px 40px;text-align:center;">
          <p style="margin:0 0 10px;color:#8B9BAE;font-size:13px;">Need help? Our team is always available.</p>
          <p style="margin:0;font-size:13px;">
            <a href="https://wa.me/447398753797" style="color:#C9A84C;text-decoration:none;font-weight:600;">💬 WhatsApp: +44 7398 753797</a>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <a href="mailto:contact@walztravels.com" style="color:#C9A84C;text-decoration:none;font-weight:600;">✉️ contact@walztravels.com</a>
          </p>
          <p style="margin:16px 0 0;color:#4a5568;font-size:11px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    }).catch(err => console.error('Welcome email error:', err))
  }

  return NextResponse.redirect(`${baseUrl}/login?verified=true&callbackUrl=/portal/dashboard`)
}

// POST /api/auth/verify-email  { email }  →  resend verification
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    // Always succeed to avoid enumeration
    if (!user || user.emailVerified) {
      return NextResponse.json({ success: true })
    }

    const token   = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: token, verificationTokenExpires: expires },
    })

    const baseUrl   = process.env.NEXTAUTH_URL ?? 'https://walztravels.us'
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`
    const resend    = getResend()

    if (resend) {
      await resend.emails.send({
        from: FROM,
        to:   email.toLowerCase().trim(),
        subject: 'Verify your Walz Travels account',
        html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
  <h2 style="color:#0B1F3A;">Verify your email</h2>
  <p style="color:#4a5568;line-height:1.7;">Here's a new verification link for your Walz Travels account. It expires in 24 hours.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${verifyUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">
      ✅ Verify My Email
    </a>
  </div>
  <p style="color:#9ca3af;font-size:12px;word-break:break-all;">Or copy: ${verifyUrl}</p>
</div>`,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Resend verify error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
