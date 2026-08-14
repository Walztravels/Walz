/**
 * Orbit email notifications via Resend.
 * All functions are fire-and-forget safe — call without await or catch internally.
 */

import { getResend } from '@/lib/resend'

const FROM = 'Orbit by Walz <notifications@walztravels.com>'
const ADMIN_BASE = 'https://www.walztravels.com/admin/orbit'

function resendOrNull() {
  try {
    return getResend()
  } catch {
    return null
  }
}

export async function notifyAuditComplete(opts: {
  email: string
  auditId: string
  siteUrl: string
  score: number | null
  issuesCritical: number
  issuesHigh: number
  issuesMedium: number
  issuesLow: number
}) {
  const resend = resendOrNull()
  if (!resend) return

  const total = opts.issuesCritical + opts.issuesHigh + opts.issuesMedium + opts.issuesLow
  const scoreLabel = opts.score != null ? `${opts.score}/100` : '—'
  const scoreColor = opts.score == null ? '#6b7280' : opts.score >= 80 ? '#059669' : opts.score >= 60 ? '#d97706' : '#dc2626'

  await resend.emails.send({
    from: FROM,
    to: opts.email,
    subject: `Orbit audit complete — Score ${scoreLabel} · ${total} issues`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff">
  <div style="margin-bottom:24px">
    <span style="background:#4f46e5;color:white;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px">Orbit SEO</span>
  </div>
  <h1 style="font-size:22px;font-weight:700;color:#0B1F3A;margin:0 0 6px">Audit Complete</h1>
  <p style="color:#6b7280;font-size:14px;margin:0 0 28px">${opts.siteUrl}</p>

  <div style="display:flex;gap:16px;margin-bottom:24px">
    <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:${scoreColor};margin-bottom:4px">${scoreLabel}</div>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">SEO Score</div>
    </div>
    <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:#0B1F3A;margin-bottom:4px">${total}</div>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">Total Issues</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px">
    <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:8px 0;color:#374151">Critical</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#dc2626">${opts.issuesCritical}</td></tr>
    <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:8px 0;color:#374151">High</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#ea580c">${opts.issuesHigh}</td></tr>
    <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:8px 0;color:#374151">Medium</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#d97706">${opts.issuesMedium}</td></tr>
    <tr><td style="padding:8px 0;color:#374151">Low</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#6b7280">${opts.issuesLow}</td></tr>
  </table>

  <a href="${ADMIN_BASE}/audit/${opts.auditId}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600">View Audit Report →</a>

  <p style="color:#d1d5db;font-size:11px;margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6">Orbit SEO Automation · Walz Travels</p>
</div>`,
  }).catch(() => { /* non-fatal */ })
}

export async function notifyCampaignNeedsApproval(opts: {
  email: string
  campaignId: string
  destination: string
  objective: string
  platforms: string[]
  generatedBy: string
}) {
  const resend = resendOrNull()
  if (!resend) return

  await resend.emails.send({
    from: FROM,
    to: opts.email,
    subject: `Campaign ready for approval — ${opts.destination}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff">
  <div style="margin-bottom:24px">
    <span style="background:#f59e0b;color:#0B1F3A;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px">Orbit Campaigns</span>
  </div>
  <h1 style="font-size:22px;font-weight:700;color:#0B1F3A;margin:0 0 8px">Campaign Ready for Review</h1>
  <p style="color:#6b7280;font-size:14px;margin:0 0 24px">A campaign has been generated and is waiting for your approval.</p>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:28px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#9ca3af;width:120px">Destination</td><td style="padding:6px 0;font-weight:600;color:#0B1F3A">${opts.destination}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Objective</td><td style="padding:6px 0;color:#374151">${opts.objective}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Platforms</td><td style="padding:6px 0;color:#374151">${opts.platforms.join(', ')}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Generated by</td><td style="padding:6px 0;color:#374151">${opts.generatedBy}</td></tr>
    </table>
  </div>

  <a href="${ADMIN_BASE}/campaigns/${opts.campaignId}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600">Review Campaign →</a>

  <p style="color:#d1d5db;font-size:11px;margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6">Orbit SEO Automation · Walz Travels</p>
</div>`,
  }).catch(() => { /* non-fatal */ })
}

export async function notifyPublishComplete(opts: {
  email: string
  campaignId: string
  destination: string
  platforms: string[]
  publishedBy: string
}) {
  const resend = resendOrNull()
  if (!resend) return

  await resend.emails.send({
    from: FROM,
    to: opts.email,
    subject: `Campaign queued in Buffer — ${opts.destination}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff">
  <div style="margin-bottom:24px">
    <span style="background:#059669;color:white;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px">Published</span>
  </div>
  <h1 style="font-size:22px;font-weight:700;color:#0B1F3A;margin:0 0 8px">Campaign Queued in Buffer</h1>
  <p style="color:#6b7280;font-size:14px;margin:0 0 24px">Content has been sent to Buffer and will be published according to your posting schedule.</p>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:28px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#9ca3af;width:120px">Destination</td><td style="padding:6px 0;font-weight:600;color:#0B1F3A">${opts.destination}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Platforms</td><td style="padding:6px 0;color:#374151">${opts.platforms.join(', ')}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Published by</td><td style="padding:6px 0;color:#374151">${opts.publishedBy}</td></tr>
    </table>
  </div>

  <a href="${ADMIN_BASE}/campaigns/${opts.campaignId}" style="display:inline-block;background:#059669;color:white;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600">View Campaign →</a>

  <p style="color:#d1d5db;font-size:11px;margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6">Orbit SEO Automation · Walz Travels</p>
</div>`,
  }).catch(() => { /* non-fatal */ })
}
