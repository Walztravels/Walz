import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/resend'

const FROM = 'Walz Travels <noreply@walztravels.com>'
const SITE = process.env.NEXTAUTH_URL ?? 'https://walztravels.com'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json() as { email?: string }
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const normalised = email.toLowerCase().trim()
  const user = await prisma.user.findUnique({ where: { email: normalised } })
  if (!user) return NextResponse.json({ error: 'No account found with that email' }, { status: 404 })

  const token   = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24) // 24 hours (longer for support cases)

  if (user.password) {
    // Existing password — send a standard reset link
    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordResetToken: token, passwordResetExpires: expires },
    })

    const resetUrl = `${SITE}/reset-password?token=${token}`

    await getResend().emails.send({
      from:    FROM,
      to:      normalised,
      subject: 'Reset your Walz Travels password',
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:36px 40px 28px;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" height="auto" style="display:block;margin:0 auto 16px;" />
          <p style="margin:0;color:#C9A84C;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Password Reset</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#0B1F3A;font-size:16px;font-weight:600;">Hi ${user.name ?? 'there'},</p>
          <p style="margin:0 0 8px;color:#4a5568;font-size:14px;line-height:1.7;">
            Our support team has sent you this link to reset your Walz Travels portal password.
            This link expires in <strong>24 hours</strong>.
          </p>
          <p style="margin:0 0 24px;color:#4a5568;font-size:14px;">
            If you have trouble clicking the button, copy the link at the bottom of this email.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#E8C97A);color:#0B1F3A;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">
              Reset My Password
            </a>
          </div>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;word-break:break-all;">
            Or copy this link:<br>
            <a href="${resetUrl}" style="color:#C9A84C;">${resetUrl}</a>
          </p>
        </td></tr>
        <tr><td style="background:#0B1F3A;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.</p>
          <p style="margin:4px 0 0;color:#8B9BAE;font-size:11px;">Need help? Reply to this email or WhatsApp us at +1 231 790 2336</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    })

    return NextResponse.json({ success: true, type: 'reset' })
  } else {
    // No password set yet — send a "set your password" link via verificationToken
    await prisma.verificationToken.deleteMany({ where: { identifier: normalised } }).catch(() => {})
    await prisma.verificationToken.create({
      data: { identifier: normalised, token, expires },
    })

    const setUrl = `${SITE}/portal/verify?token=${token}&email=${encodeURIComponent(normalised)}`

    await getResend().emails.send({
      from:    FROM,
      to:      normalised,
      subject: 'Set up your Walz Travels portal password',
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0A1628,#1C3557);padding:36px 40px 28px;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" height="auto" style="display:block;margin:0 auto 16px;" />
          <p style="margin:0;color:#C9A84C;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Portal Access</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#0B1F3A;font-size:16px;font-weight:600;">Hi ${user.name ?? 'there'},</p>
          <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.7;">
            Click the button below to set up a password and access your Walz Travels portal, where you can
            track your visa application, upload documents, and more.
            This link expires in <strong>24 hours</strong>.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="${setUrl}" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#E8C97A);color:#0B1F3A;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">
              Set Up My Password
            </a>
          </div>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;word-break:break-all;">
            Or copy this link:<br>
            <a href="${setUrl}" style="color:#C9A84C;">${setUrl}</a>
          </p>
        </td></tr>
        <tr><td style="background:#0B1F3A;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.</p>
          <p style="margin:4px 0 0;color:#8B9BAE;font-size:11px;">Need help? Reply to this email or WhatsApp us at +1 231 790 2336</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    })

    return NextResponse.json({ success: true, type: 'set-password' })
  }
}
