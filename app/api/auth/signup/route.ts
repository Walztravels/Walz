import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { Resend } from 'resend'

const FROM  = 'Walz Travels <noreply@walztravels.com>'
const ADMIN = 'contact@walztravels.com'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function fmt(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const normalised = email.toLowerCase().trim()
    const displayName = name?.trim() || null

    const existing = await prisma.user.findUnique({ where: { email: normalised } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      )
    }

    const hashed = await bcrypt.hash(password, 12)

    // Verification token — 24 hr expiry
    const verificationToken        = crypto.randomBytes(32).toString('hex')
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const user = await prisma.user.create({
      data: {
        name:                    displayName,
        email:                   normalised,
        password:                hashed,
        verificationToken,
        verificationTokenExpires,
      },
    })

    const baseUrl    = process.env.NEXTAUTH_URL ?? 'https://walztravels.com'
    const verifyUrl  = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`
    const resend     = getResend()

    // ── Verification email ──────────────────────────────────────────────────
    if (resend) {
      await resend.emails.send({
        from: FROM,
        to:   normalised,
        subject: 'Verify your Walz Travels account',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr><td style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:36px 40px 28px;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="200" height="200" style="display:block;margin:0 auto 16px;width:200px;height:auto;" />
          <p style="margin:0;color:#C9A84C;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Email Verification</p>
        </td></tr>

        <tr><td style="padding:36px 40px 0;">
          <p style="margin:0 0 8px;color:#0B1F3A;font-size:18px;font-weight:600;">Hi ${displayName ?? 'there'}, almost there! 👋</p>
          <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.7;">
            Thanks for creating your Walz Travels account. Click the button below to verify your email address and activate your account.
            This link expires in <strong>24 hours</strong>.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <a href="${verifyUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#E8C97A);color:#0B1F3A;font-weight:700;padding:16px 36px;border-radius:12px;text-decoration:none;font-size:16px;">
              ✅ Verify My Email
            </a>
          </div>
          <p style="margin:0 0 28px;color:#6b7280;font-size:12px;line-height:1.6;">
            Or copy this link into your browser:<br>
            <a href="${verifyUrl}" style="color:#C9A84C;word-break:break-all;">${verifyUrl}</a>
          </p>
          <p style="margin:0;color:#9ca3af;font-size:12px;">If you didn't create a Walz Travels account, you can safely ignore this email.</p>
        </td></tr>

        <tr><td style="background:#0B1F3A;padding:24px 40px;text-align:center;margin-top:32px;">
          <p style="margin:0 0 8px;color:#8B9BAE;font-size:13px;">Questions? We're here to help.</p>
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
      }).catch(err => console.error('Verification email error:', err))

      // ── Admin notification ────────────────────────────────────────────────
      resend.emails.send({
        from: FROM,
        to:   ADMIN,
        subject: `🆕 New Client Registration — Walz Travels`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f7f8fa;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#0B1F3A;padding:20px 28px;">
      <h2 style="margin:0;color:#C9A84C;font-size:18px;">🆕 New Client Registration</h2>
    </div>
    <div style="padding:24px 28px;">
      <table width="100%" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="color:#6b7280;padding:7px 0;width:120px;">Name</td><td style="color:#0B1F3A;font-weight:600;">${displayName ?? '(not provided)'}</td></tr>
        <tr><td style="color:#6b7280;padding:7px 0;">Email</td><td style="color:#0B1F3A;">${normalised}</td></tr>
        <tr><td style="color:#6b7280;padding:7px 0;">Date joined</td><td style="color:#0B1F3A;">${fmt(user.createdAt)}</td></tr>
        <tr><td style="color:#6b7280;padding:7px 0;">Status</td><td style="color:#d97706;font-weight:600;">Pending email verification</td></tr>
      </table>
      <div style="margin-top:20px;padding:12px 16px;background:#FFF8EC;border-radius:8px;border-left:3px solid #C9A84C;">
        <p style="margin:0;color:#0B1F3A;font-size:13px;">
          View in admin: <a href="https://walztravels.com/admin/clients" style="color:#C9A84C;">walztravels.com/admin/clients</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,
      }).catch(err => console.error('Admin notification error:', err))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
