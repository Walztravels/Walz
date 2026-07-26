// lib/check-ins/emails.ts
// All six transactional email templates for the check-in notification system.
// Each function returns { subject, html } ready to pass to Resend.

const FROM_EMAIL = 'Walz Travels Attendance <hr@walztravels.com>'
export { FROM_EMAIL }

// ── Shared wrapper ─────────────────────────────────────────────────────────────

function wrap(headerAccent: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Walz Travels</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
    style="max-width:540px;margin:32px auto 48px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td style="background:#0B1F3A;padding:24px 32px;">
        <p style="margin:0 0 10px;color:#C9A84C;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">
          Walz Travels · Attendance
        </p>
        <div style="width:40px;height:3px;background:${headerAccent};border-radius:2px;"></div>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:32px 32px 24px;">
        ${body}
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f8f9fb;padding:14px 32px;border-top:1px solid #eaedf0;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;">
          Walz Travels Admin Portal · Automated attendance system ·
          <a href="mailto:hr@walztravels.com" style="color:#C9A84C;text-decoration:none;">hr@walztravels.com</a>
        </p>
      </td>
    </tr>

  </table>
</body>
</html>`
}

function btn(text: string, url: string, color = '#C9A84C', textColor = '#0B1F3A'): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px;">
      <tr>
        <td>
          <a href="${url}"
             style="display:inline-block;background:${color};color:${textColor};
                    font-weight:700;font-size:13px;text-decoration:none;
                    padding:12px 28px;border-radius:10px;letter-spacing:0.2px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`
}

function slotChip(label: string, color: string): string {
  return `<span style="display:inline-block;background:${color}15;color:${color};
    font-size:12px;font-weight:600;padding:4px 12px;border-radius:6px;letter-spacing:0.3px;">
    ${label}
  </span>`
}

// ── 1. Regular 10-minute reminder ─────────────────────────────────────────────

export function reminderEmail(p: {
  name:          string
  slotLabel:     string  // e.g. "3:00 PM"
  nextSlotLabel: string  // e.g. "4:00 PM" (what comes after)
  timezone:      string  // e.g. "Lagos time"
  portalUrl:     string
}): { subject: string; html: string } {
  const subject = `⏰ ${p.slotLabel} check-in due in 10 minutes`
  const html    = wrap('#C9A84C', `
    <p style="margin:0 0 18px;font-size:15px;color:#111827;font-weight:700;">
      ${p.slotLabel} check-in
    </p>

    <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.7;">
      Hi <strong style="color:#111827;">${p.name}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.7;">
      Your <strong style="color:#111827;">${p.slotLabel} ${p.timezone}</strong> check-in window
      opens in 10 minutes. Be active on the admin portal or take a call —
      the system detects both automatically.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#f8f9fb;border-radius:10px;padding:14px 18px;margin-bottom:6px;">
      <tr>
        <td style="font-size:12px;color:#6b7280;">Next slot after this</td>
        <td style="font-size:12px;color:#111827;font-weight:600;text-align:right;">${p.nextSlotLabel} ${p.timezone}</td>
      </tr>
    </table>

    ${btn('Open Admin Portal', p.portalUrl)}
  `)
  return { subject, html }
}

// ── 2. Pre-break reminder ──────────────────────────────────────────────────────

export function preBreakReminderEmail(p: {
  name:          string
  slotLabel:     string   // e.g. "12:00 PM" — the pre-break slot
  breakEndLabel: string   // e.g. "2:00 PM" — when break ends
  timezone:      string
  portalUrl:     string
}): { subject: string; html: string } {
  const subject = `⏰ ${p.slotLabel} check-in — break starts after this slot`
  const html    = wrap('#C9A84C', `
    <p style="margin:0 0 18px;font-size:15px;color:#111827;font-weight:700;">
      Last check-in before break
    </p>

    <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.7;">
      Hi <strong style="color:#111827;">${p.name}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.7;">
      Your <strong style="color:#111827;">${p.slotLabel} ${p.timezone}</strong> check-in is due
      in 10 minutes. This is your <strong style="color:#111827;">last check-in before your break</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:6px;">
      <tr>
        <td style="font-size:12px;color:#92400e;">Back from break</td>
        <td style="font-size:12px;color:#92400e;font-weight:600;text-align:right;">
          First check-in at ${p.breakEndLabel} ${p.timezone}
        </td>
      </tr>
    </table>

    ${btn('Open Admin Portal', p.portalUrl)}
  `)
  return { subject, html }
}

// ── 3. Post-break reminder (break ending) ─────────────────────────────────────

export function postBreakReminderEmail(p: {
  name:             string
  resumeSlotLabel:  string  // e.g. "2:00 PM" — the first slot after break
  timezone:         string
  portalUrl:        string
}): { subject: string; html: string } {
  const subject = `⏰ Break ends soon — check in at ${p.resumeSlotLabel}`
  const html    = wrap('#C9A84C', `
    <p style="margin:0 0 18px;font-size:15px;color:#111827;font-weight:700;">
      Break ends in 10 minutes
    </p>

    <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.7;">
      Hi <strong style="color:#111827;">${p.name}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.7;">
      Your break ends soon. Your next check-in opens at
      <strong style="color:#111827;">${p.resumeSlotLabel} ${p.timezone}</strong>.
      Be back on the admin portal or on a call by then to avoid a missed check-in.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:6px;">
      <tr>
        <td style="font-size:12px;color:#166534;">Resume check-in</td>
        <td style="font-size:12px;color:#166534;font-weight:600;text-align:right;">
          ${p.resumeSlotLabel} ${p.timezone}
        </td>
      </tr>
    </table>

    ${btn('Open Admin Portal', p.portalUrl)}
  `)
  return { subject, html }
}

// ── 4. Immediate miss notification (to staff) ─────────────────────────────────

export function missEmail(p: {
  name:          string
  slotLabel:     string
  deductionAmt:  number
  currency:      string   // 'NGN' | 'GHS'
  currencySymbol: string  // '₦' | 'GH₵'
  isPostBreak:   boolean
  portalUrl:     string
}): { subject: string; html: string } {
  const context = p.isPostBreak
    ? `after your break ended`
    : `during the ${p.slotLabel} window`
  const deductStr = p.deductionAmt > 0
    ? `${p.currencySymbol}${p.deductionAmt.toLocaleString()}`
    : 'none'

  const subject = `⚠️ Missed check-in — ${p.slotLabel}`
  const html    = wrap('#ef4444', `
    <p style="margin:0 0 18px;font-size:15px;color:#111827;font-weight:700;">
      Missed check-in
    </p>

    <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.7;">
      Hi <strong style="color:#111827;">${p.name}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.7;">
      No admin panel or call activity was detected ${context}.
      ${slotChip(p.slotLabel + ' slot', '#ef4444')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:20px;overflow:hidden;">
      <tr style="background:#fee2e2;">
        <td style="padding:10px 18px;font-size:11px;font-weight:700;text-transform:uppercase;
                   letter-spacing:0.8px;color:#991b1b;" colspan="2">
          Missed window
        </td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;">Slot</td>
        <td style="padding:12px 18px;font-size:13px;color:#111827;font-weight:600;text-align:right;">${p.slotLabel}</td>
      </tr>
      <tr style="border-top:1px solid #fecaca;">
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;">Deduction</td>
        <td style="padding:12px 18px;font-size:13px;color:#dc2626;font-weight:700;text-align:right;">${deductStr}</td>
      </tr>
      <tr style="border-top:1px solid #fecaca;">
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;">Status</td>
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;text-align:right;">Pending manager review</td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.7;">
      If you were working and believe this is an error, submit a dispute from
      the portal and your manager will review it.
    </p>

    ${btn('View Check-ins &amp; Dispute', p.portalUrl, '#374151', '#ffffff')}
  `)
  return { subject, html }
}

// ── 5. Management miss alert ───────────────────────────────────────────────────

export function managementMissEmail(p: {
  staffName:      string
  slotLabel:      string
  deductionAmt:   number
  currencySymbol: string
  missedToday:    number
  weekDeductions: number
  isPostBreak:    boolean
  portalUrl:      string
}): { subject: string; html: string } {
  const postBreakNote = p.isPostBreak ? ' (post-break slot)' : ''
  const deductStr     = p.deductionAmt > 0
    ? `${p.currencySymbol}${p.deductionAmt.toLocaleString()}`
    : '—'
  const weekStr = `${p.currencySymbol}${p.weekDeductions.toLocaleString()}`

  const subject = `⚠️ ${p.staffName} missed the ${p.slotLabel} check-in${postBreakNote}`
  const html    = wrap('#f59e0b', `
    <p style="margin:0 0 18px;font-size:15px;color:#111827;font-weight:700;">
      Missed check-in — action may be required
    </p>

    <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.7;">
      <strong style="color:#111827;">${p.staffName}</strong> missed the
      <strong style="color:#111827;">${p.slotLabel}</strong> check-in${postBreakNote}.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#f8f9fb;border-radius:10px;margin-bottom:20px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr style="background:#f1f5f9;">
        <td style="padding:10px 18px;font-size:11px;font-weight:700;text-transform:uppercase;
                   letter-spacing:0.8px;color:#374151;" colspan="2">
          Summary
        </td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Deduction pending</td>
        <td style="padding:12px 18px;font-size:13px;color:#dc2626;font-weight:700;text-align:right;border-top:1px solid #e5e7eb;">${deductStr}</td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Missed today</td>
        <td style="padding:12px 18px;font-size:13px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #e5e7eb;">${p.missedToday} slot${p.missedToday === 1 ? '' : 's'}</td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Deductions this week</td>
        <td style="padding:12px 18px;font-size:13px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #e5e7eb;">${weekStr}</td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.7;">
      Log in to waive or apply the deduction. If the staff member submitted a dispute, approve or reject it from the flagged records section.
    </p>

    ${btn('Review in Admin Panel', p.portalUrl)}
  `)
  return { subject, html }
}

// ── 6. Check-in confirmation ───────────────────────────────────────────────────

export function confirmationEmail(p: {
  name:           string
  slotLabel:      string
  method:         'admin_panel' | 'call' | 'manual'
  nextSlotLabel:  string | null
  isLastSlot:     boolean
  timezone:       string
}): { subject: string; html: string } {
  const methodLabel =
    p.method === 'call'  ? 'call presence' :
    p.method === 'manual' ? 'manual check-in' :
    'admin panel activity'

  const nextLine = p.isLastSlot
    ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">That was your last check-in for today. Closing time is 5:00 PM.</p>`
    : p.nextSlotLabel
      ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Next check-in: <strong style="color:#111827;">${p.nextSlotLabel} ${p.timezone}</strong></p>`
      : ''

  const subject = `✅ Checked in — ${p.slotLabel}`
  const html    = wrap('#22c55e', `
    <p style="margin:0 0 18px;font-size:15px;color:#111827;font-weight:700;">
      Check-in confirmed
    </p>

    <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.7;">
      Hi <strong style="color:#111827;">${p.name}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.7;">
      You&apos;ve been checked in for the <strong style="color:#111827;">${p.slotLabel} ${p.timezone}</strong>
      slot via ${methodLabel}.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;">
      <tr>
        <td style="font-size:13px;color:#166534;font-weight:600;">
          ✓ &nbsp;${p.slotLabel} — Checked in via ${methodLabel}
        </td>
      </tr>
    </table>

    ${nextLine}
  `)
  return { subject, html }
}
