import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'

const FROM = 'Walz Travels <noreply@walztravels.com>'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const normalised = email.toLowerCase().trim()
    const user = await prisma.user.findUnique({ where: { email: normalised } })

    // Always return success to prevent email enumeration
    if (!user || !user.password) {
      return NextResponse.json({ success: true })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 1000 * 60 * 60) // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    })

    const resetUrl = `${process.env.NEXTAUTH_URL ?? 'https://walztravels.com'}/reset-password?token=${token}`

    if (process.env.RESEND_API_KEY) {
            await getResend().emails.send({
        from: FROM,
        to: normalised,
        subject: 'Reset your Walz Travels password',
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
          <p style="margin:0;color:#C9A84C;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Password Reset</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#0B1F3A;font-size:16px;font-weight:600;">Hi ${user.name ?? 'there'},</p>
          <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.7;">
            We received a request to reset your password. Click the button below to choose a new one.
            This link expires in <strong>1 hour</strong>.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#E8C97A);color:#0B1F3A;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">
              Reset My Password
            </a>
          </div>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
            If you didn't request this, you can safely ignore this email — your password won't change.<br>
            Or copy this link: <a href="${resetUrl}" style="color:#C9A84C;word-break:break-all;">${resetUrl}</a>
          </p>
        </td></tr>
        <tr><td style="background:#0B1F3A;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels Ltd. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Forgot password error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
