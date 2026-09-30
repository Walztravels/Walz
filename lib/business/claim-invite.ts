// lib/business/claim-invite.ts — Walz Business (Release 2)
//
// Issues (or re-issues) a BusinessTraveller account-claim invitation:
// verifies the traveller belongs to the caller's already-verified
// organization and is not yet claimed, generates a fresh expiring token
// (lib/business/claim.ts), emails the claim link to the traveller's own
// address via the hardened Resend client (lib/resend.ts ->
// lib/resend-hardened.ts, the only sanctioned email path), and audits it.
//
// The token is only ever placed in the email — it is never returned to the
// API caller (an org manager or staff member must not be able to claim on
// the traveller's behalf).

import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { initiateBusinessTravellerClaim } from '@/lib/business/claim'
import { recordBusinessAudit } from '@/lib/business/audit'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'
const FROM_ADDRESS = 'Walz Travels <bookings@walztravels.com>'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendBusinessTravellerClaimEmail(opts: {
  to: string
  firstName: string
  organizationName: string
  token: string
  expiresAt: Date
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log('[BusinessTravellerClaim] No RESEND_API_KEY — claim email not sent')
    return false
  }
  const link = `${BASE_URL}/business/claim/${opts.token}`
  const expires = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(opts.expiresAt)
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#0B1F3A;padding:20px 32px;"><span style="color:#C9A84C;font-size:20px;font-weight:700;">Walz Travels</span></td></tr>
<tr><td style="padding:32px;">
<h2 style="margin:0 0 12px;font-size:20px;color:#0B1F3A;">Link your traveller profile</h2>
<p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;">Hi ${esc(opts.firstName)}, <strong>${esc(opts.organizationName)}</strong> has added you as a traveller on Walz Business. Confirm it's you to see the trips arranged for you in your Walz account.</p>
<p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;">Confirm my traveller profile</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#888;">You'll need to sign in with (or create) a Walz account using this email address. This link works once and expires on <strong>${esc(expires)}</strong>.</p>
<p style="margin:0;font-size:13px;color:#888;">If you weren't expecting this, you can ignore this email — nothing will be linked.</p>
</td></tr>
<tr><td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#bbb;">Walz Travels &middot; walztravels.com</p></td></tr>
</table></td></tr></table></body></html>`

  try {
    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `Confirm your traveller profile for ${opts.organizationName}`,
      html,
    })
    return true
  } catch (err) {
    console.error('[BusinessTravellerClaim] claim email failed (non-fatal):', (err as Error).message)
    return false
  }
}

export type IssueClaimInviteResult =
  | { ok: true; expiresAt: Date; emailSent: boolean }
  | { ok: false; status: number; error: string }

export async function issueTravellerClaimInvite(input: {
  businessTravellerId: string
  organizationId: string          // ALREADY verified by the caller
  actorUserId?: string | null
  actorStaffId?: string | null
}): Promise<IssueClaimInviteResult> {
  const traveller = await prisma.businessTraveller.findUnique({
    where: { id: input.businessTravellerId },
    select: {
      id: true, organizationId: true, firstName: true, email: true, userId: true,
      organization: { select: { legalName: true, tradingName: true } },
    },
  })
  // Cross-org guard: a traveller id from another organization is the same
  // generic 404 as a nonexistent one.
  if (!traveller || traveller.organizationId !== input.organizationId) {
    return { ok: false, status: 404, error: 'Not found' }
  }
  if (traveller.userId) {
    return { ok: false, status: 409, error: 'This traveller has already linked their account' }
  }

  const issued = await initiateBusinessTravellerClaim(traveller.id)
  if (!issued) return { ok: false, status: 500, error: 'Could not create the claim invitation' }

  const emailSent = await sendBusinessTravellerClaimEmail({
    to: traveller.email,
    firstName: traveller.firstName,
    organizationName: traveller.organization?.tradingName ?? traveller.organization?.legalName ?? 'Your organization',
    token: issued.token,
    expiresAt: issued.expiresAt,
  })

  await recordBusinessAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorStaffId: input.actorStaffId ?? null,
    action: 'traveller.claim_invite_sent',
    entityType: 'BusinessTraveller',
    entityId: traveller.id,
    // Never the token itself.
    after: { expiresAt: issued.expiresAt.toISOString(), emailSent },
  })

  return { ok: true, expiresAt: issued.expiresAt, emailSent }
}
