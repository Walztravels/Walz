import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

const BASE_URL = process.env.NEXTAUTH_URL || 'https://walztravels.com'

export interface PortalAccountResult {
  userId: string
  email: string
  isNew: boolean
}

export async function ensurePortalAccount(
  email: string,
  name?: string,
  applicationRef?: string,
  applicationType?: string,
): Promise<PortalAccountResult> {
  const normalEmail = email.toLowerCase().trim()

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalEmail, mode: 'insensitive' } },
    select: { id: true, email: true },
  }).catch(() => null)

  if (existing) {
    return { userId: existing.id, email: normalEmail, isNew: false }
  }

  const magicToken = crypto.randomBytes(32).toString('hex')
  const magicExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const newUser = await prisma.user.create({
    data: {
      email: normalEmail,
      name: name || normalEmail.split('@')[0],
      emailVerified: null,
    },
  })

  await prisma.verificationToken.create({
    data: {
      identifier: normalEmail,
      token: magicToken,
      expires: magicExpiry,
    },
  }).catch(err => console.error('[portal-account] verificationToken create failed:', err))

  const magicLink = `${BASE_URL}/portal/verify?token=${magicToken}&email=${encodeURIComponent(normalEmail)}`
  const firstName = (name || normalEmail).split(' ')[0]

  const resend = getResend()
  if (resend) {
    await resend.emails.send({
      from: 'Walz Travels <contact@walztravels.com>',
      to: normalEmail,
      subject: '✅ Your Walz Travels portal account is ready',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <tr><td style="background:#ffffff;padding:24px 40px 16px;text-align:center;border-bottom:3px solid #C9A84C;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" style="display:block;margin:0 auto 16px;height:auto;" />
    <p style="margin:0;color:#0B1F3A;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Your Client Portal</p>
  </td></tr>

  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 8px;color:#0B1F3A;font-size:18px;font-weight:700;">Welcome, ${firstName}! 👋</p>
    <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.8;">
      Your Walz Travels portal account has been created for <strong>${normalEmail}</strong>.
      ${applicationRef ? `Your <strong>${applicationType || 'application'}</strong> (ref: <strong>${applicationRef}</strong>) is already linked to your account.` : ''}
    </p>

    <p style="margin:0 0 12px;color:#4a5568;font-size:14px;">From your portal you can:</p>
    <ul style="margin:0 0 24px;padding-left:20px;color:#4a5568;font-size:14px;line-height:1.9;">
      <li>Track your application status in real time</li>
      <li>Upload documents securely</li>
      <li>Receive updates from our team</li>
      <li>View your booking history</li>
    </ul>

    <div style="text-align:center;margin:0 0 28px;">
      <a href="${magicLink}"
         style="display:inline-block;padding:16px 36px;background:#C9A84C;color:#0B1F3A;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;">
        Access My Portal →
      </a>
    </div>

    <p style="margin:0 0 24px;color:#9ca3af;font-size:13px;text-align:center;">
      This link expires in 7 days. After that, visit
      <a href="${BASE_URL}/portal/login" style="color:#C9A84C;">${BASE_URL}/portal/login</a>
    </p>

    <div style="background:#F8F9FA;border-radius:12px;padding:16px 20px;">
      <p style="margin:0;color:#6b7280;font-size:13px;">
        Need help? WhatsApp us: <strong>+12317902336</strong><br/>
        contact@walztravels.com
      </p>
    </div>
  </td></tr>

  <tr><td style="background:#0B1F3A;padding:20px 40px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:12px;">© Walz Travels. Your secure client portal.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
    }).catch(err => console.error('[portal-account] welcome email failed:', err))
  }

  return { userId: newUser.id, email: normalEmail, isNew: true }
}
