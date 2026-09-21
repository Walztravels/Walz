/**
 * Walz Team Hub V1.1 — the staff "you missed something in Team Hub" email.
 *
 * Visual/structural convention is copied deliberately from
 * lib/email-staff-notification.ts (navy #0B1F3A header bar, gold #C9A84C
 * accent + CTA button, white card on #f0f2f5, "Walz Travels ·
 * walztravels.com" footer) so Team Hub mail is visually indistinguishable
 * from the rest of Walz's staff mail.
 *
 * Sending goes through getResend() (lib/resend.ts → lib/resend-hardened.ts)
 * like every other send site in this codebase — that wrapper derives the
 * text/plain alternative from the HTML automatically, so the markup below
 * is written to degrade into readable plain text (real headings, one idea
 * per block element, link labels that make sense next to their URL).
 *
 * Rendering is a PURE function (renderTeamHubEmail) separated from sending
 * (sendTeamHubEmail) so the single-event and batched cases are unit
 * testable without touching Resend at all.
 */

import { getResend } from '@/lib/resend'
import type { TeamEmailKind } from '@/lib/team/email-notify'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://walztravels.com'

/** Navigation-only deep link — the exact existing /admin/team?c=<id> convention
 *  (app/admin/team/lib/deepLink.ts's parseDeepLinkConversationId consumes it).
 *  It is NOT an authorization token and NOT a magic login: opening it re-runs
 *  the full session + active-staff + membership checks the page already does. */
export function teamConversationLink(conversationId: string, baseUrl: string = BASE_URL): string {
  return `${baseUrl}/admin/team?c=${encodeURIComponent(conversationId)}`
}

export function teamEmailPreferencesLink(baseUrl: string = BASE_URL): string {
  return `${baseUrl}/admin/team/notifications`
}

export interface TeamHubEmailEvent {
  kind: TeamEmailKind
  conversationId: string
  /** One line, already composed by the caller, e.g. "Ada mentioned you in #reservations". */
  title: string
  /** Optional short message preview. Plain text — escaped here, never trusted as HTML. */
  preview?: string | null
}

export interface TeamHubEmailInput {
  staffName: string
  staffEmail: string
  events: TeamHubEmailEvent[]
  /** Extra qualifying events beyond the ones listed, summarised as "+N more". */
  moreCount?: number
  baseUrl?: string
}

const KIND_LABEL: Record<TeamEmailKind, string> = {
  DM: 'Direct message',
  MENTION: 'Mention',
  THREAD_REPLY: 'Thread reply',
  MISSED_CALL: 'Missed call',
  INVITE: 'Invitation',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function teamHubEmailSubject(events: TeamHubEmailEvent[], moreCount = 0): string {
  const total = events.length + Math.max(0, moreCount)
  if (total === 1) return `${events[0].title} — Walz Team Hub`
  return `${total} new things in Walz Team Hub while you were away`
}

/**
 * Renders the email. Handles BOTH shapes from one template:
 *   - exactly one event  → a single card, CTA deep-links straight to it,
 *   - two or more events → a numbered list ("3 new things while you were
 *     away"), each row carrying its own deep link, CTA opens Team Hub.
 */
export function renderTeamHubEmail(input: TeamHubEmailInput): { subject: string; html: string } {
  const baseUrl = input.baseUrl ?? BASE_URL
  const events = input.events
  const moreCount = Math.max(0, input.moreCount ?? 0)
  const total = events.length + moreCount
  const single = total === 1
  const subject = teamHubEmailSubject(events, moreCount)
  const headline = single
    ? 'You missed something in Team Hub'
    : `${total} new things while you were away`
  const ctaLink = single ? teamConversationLink(events[0].conversationId, baseUrl) : `${baseUrl}/admin/team`
  const ctaLabel = single ? 'Open in Team Hub →' : 'Open Team Hub →'

  const rows = events.map(ev => `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background:#fafafa;border-left:3px solid #C9A84C;border-radius:0 6px 6px 0;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 5px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.6px;">${esc(KIND_LABEL[ev.kind] ?? 'Team Hub')}</p>
                  <p style="margin:0 0 6px;font-size:15px;color:#0B1F3A;font-weight:600;line-height:1.4;">${esc(ev.title)}</p>
                  ${ev.preview ? `<p style="margin:0 0 8px;font-size:14px;color:#444;line-height:1.5;">${esc(ev.preview)}</p>` : ''}
                  <a href="${esc(teamConversationLink(ev.conversationId, baseUrl))}" style="font-size:13px;color:#0B1F3A;font-weight:700;text-decoration:underline;">Open conversation</a>
                </td>
              </tr>
            </table>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px) {
      .walz-card { width:100% !important; border-radius:0 !important; }
      .walz-pad  { padding:22px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" class="walz-card" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td class="walz-pad" style="background:#0B1F3A;padding:20px 32px;">
            <span style="color:#C9A84C;font-size:20px;font-weight:700;letter-spacing:0.5px;">Walz Travels</span>
            <p style="margin:6px 0 0;color:#8B9BAE;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">Team Hub</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="walz-pad" style="padding:32px;">
            <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">Hi ${esc(input.staffName)},</p>
            <p style="margin:0 0 22px;font-size:15px;color:#444;line-height:1.5;">${esc(headline)}.</p>

            ${rows}
            ${moreCount > 0 ? `<p style="margin:0 0 14px;font-size:14px;color:#666;">and ${moreCount} more update${moreCount === 1 ? '' : 's'} waiting in Team Hub.</p>` : ''}

            <a href="${esc(ctaLink)}"
               style="display:inline-block;margin-top:10px;background:#C9A84C;color:#0B1F3A;text-decoration:none;
                      padding:13px 26px;border-radius:6px;font-weight:700;font-size:15px;">
              ${esc(ctaLabel)}
            </a>

            <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.5;">
              You are receiving this because you missed Team Hub activity while you were away. We only email about direct messages, mentions, thread replies, missed calls and invitations — never ordinary channel chatter.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;">
            <p style="margin:0 0 6px;font-size:12px;color:#999;">
              <a href="${esc(teamEmailPreferencesLink(baseUrl))}" style="color:#999;text-decoration:underline;">Manage your Team Hub email notifications</a>
            </p>
            <p style="margin:0;font-size:12px;color:#bbb;">Walz Travels &middot; walztravels.com</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

/**
 * Sends the email. NEVER throws — returns true/false — because the caller
 * (the cron) must be able to mark candidates failed and carry on with the
 * next staff member rather than aborting the tick. Logs metadata only
 * (staffId, event count, kinds) — never the recipient address, never
 * message content, never the API key.
 */
export async function sendTeamHubEmail(input: TeamHubEmailInput & { staffId: string }): Promise<boolean> {
  if (!input.staffEmail || input.events.length === 0) return false
  try {
    const { subject, html } = renderTeamHubEmail(input)
    const resend = getResend()
    const res = await resend.emails.send({
      from: 'Walz Travels <hello@walztravels.com>',
      to: input.staffEmail,
      subject,
      html,
    })
    if (res?.error) {
      console.warn(`[team/email] send rejected staffId=${input.staffId} events=${input.events.length}`)
      return false
    }
    console.info(`[team/email] sent staffId=${input.staffId} events=${input.events.length} kinds=${input.events.map(e => e.kind).join(',')}`)
    return true
  } catch (e) {
    console.warn(`[team/email] send failed staffId=${input.staffId} events=${input.events.length}:`, (e as Error)?.message)
    return false
  }
}
