// lib/business/invitation-email.ts — Walz Business (Release 2.1)
//
// Sends an organization-invitation email via the hardened Resend client
// (lib/resend.ts -> lib/resend-hardened.ts — the only sanctioned email
// path in this domain), reusing the exact sending mechanism/style of
// lib/business/claim-invite.ts::sendBusinessTravellerClaimEmail(). The raw
// token is only ever placed in the email link — never logged, never
// returned by any API response, never persisted anywhere but as a hash.

import { getResend } from '@/lib/resend'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'
const FROM_ADDRESS = 'Walz Travels <bookings@walztravels.com>'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendOrganizationInvitationEmail(opts: {
  to: string
  organizationName: string
  role: string
  token: string
  expiresAt: Date
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log('[OrganizationInvitation] No RESEND_API_KEY — invitation email not sent')
    return false
  }
  const link = `${BASE_URL}/business/invitations/${opts.token}`
  const expires = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(opts.expiresAt)
  const roleLabel = opts.role.replace(/_/g, ' ').toLowerCase()
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#0B1F3A;padding:20px 32px;"><span style="color:#C9A84C;font-size:20px;font-weight:700;">Walz Travels</span></td></tr>
<tr><td style="padding:32px;">
<h2 style="margin:0 0 12px;font-size:20px;color:#0B1F3A;">You've been invited to Walz Business</h2>
<p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;"><strong>${esc(opts.organizationName)}</strong> has invited you to join their organization on Walz Business as <strong>${esc(roleLabel)}</strong>.</p>
<p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;">Accept invitation</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#888;">You'll need to sign in with (or create) a Walz account using this email address. This link works once and expires on <strong>${esc(expires)}</strong>.</p>
<p style="margin:0;font-size:13px;color:#888;">If you weren't expecting this, you can ignore this email — nothing will be linked.</p>
</td></tr>
<tr><td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#bbb;">Walz Travels &middot; walztravels.com</p></td></tr>
</table></td></tr></table></body></html>`

  try {
    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `You've been invited to join ${opts.organizationName} on Walz Business`,
      html,
    })
    return true
  } catch (err) {
    console.error('[OrganizationInvitation] invitation email failed (non-fatal):', (err as Error).message)
    return false
  }
}
