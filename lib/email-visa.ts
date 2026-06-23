import { getResend } from '@/lib/email-internal'
import { getVisaConfig, STATUS_CONFIG } from '@/lib/visa-config'

const FROM = 'Jade at Walz Travels <jade@walztravels.com>'
const ADMIN = 'contact@walztravels.com'
const BASE_URL = 'https://walztravels.com'

function header() {
  return `<div style="background:#0B1F3A;padding:32px 40px 24px;text-align:center;">
    <img src="${BASE_URL}/walz-logo.png" alt="Walz Travels" width="160" style="height:auto;display:block;margin:0 auto 8px;"/>
    <p style="margin:0;color:#C9A84C;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Visa Application</p>
  </div>`
}

function footer() {
  return `<div style="padding:24px 40px;background:#F4F6F9;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0 0 8px;color:#0B1F3A;font-weight:600;font-size:13px;">Questions?</p>
    <p style="margin:0;color:#64748b;font-size:13px;">
      💬 <a href="https://wa.me/447398753797" style="color:#C9A84C;">WhatsApp +44 7398 753797</a> &nbsp;|&nbsp;
      ✉️ <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a>
    </p>
    <p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">Walz Travels Ltd · walztravels.com</p>
  </div>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVisaApplicationConfirmation(app: any) {
  const resend = getResend()
  const config = getVisaConfig(app.destinationIso2)
  const clientName = `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || 'Client'
  const portalUrl = `${BASE_URL}/portal/visa-application/${app.id}`

  await resend.emails.send({
    from: FROM,
    to: app.email ?? ADMIN,
    subject: `Your ${config?.name ?? app.destinationIso2} visa application is confirmed — ${app.referenceNumber}`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:#0B1F3A;font-size:22px;">Application Received ✅</h2>
        <p style="color:#475569;margin:0 0 24px;">Hi ${clientName}, we've received your visa application and your Walz Travels service fee payment. Here's your reference:</p>

        <div style="background:#0B1F3A;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
          <p style="color:#C9A84C;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1.5px;">Application Reference</p>
          <p style="color:#ffffff;font-size:28px;font-weight:700;margin:0;letter-spacing:3px;">${app.referenceNumber}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr style="background:#F4F6F9;">
            <td style="padding:10px 16px;color:#64748b;font-size:13px;width:40%;">Destination</td>
            <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-weight:600;">${config?.flag ?? ''} ${config?.name ?? app.destinationIso2}</td>
          </tr>
          <tr>
            <td style="padding:10px 16px;color:#64748b;font-size:13px;">Visa Type</td>
            <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-weight:600;">${app.visaType}</td>
          </tr>
          <tr style="background:#F4F6F9;">
            <td style="padding:10px 16px;color:#64748b;font-size:13px;">Service Fee Paid</td>
            <td style="padding:10px 16px;color:#16a34a;font-size:13px;font-weight:600;">USD $${config?.serviceFeeUsd ?? app.serviceFeeAmount} ✓</td>
          </tr>
          <tr>
            <td style="padding:10px 16px;color:#64748b;font-size:13px;">Government Fee</td>
            <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${config?.govtFeeDisplay ?? 'TBC'} — paid when instructed by Walz</td>
          </tr>
        </table>

        <h3 style="color:#0B1F3A;font-size:15px;margin:0 0 12px;">What happens next?</h3>
        <ol style="margin:0 0 24px;padding-left:20px;color:#475569;font-size:13px;line-height:1.8;">
          <li>Jade will review your application and prepare your document checklist</li>
          <li>You'll receive an email listing exactly which documents to upload</li>
          <li>Upload your documents at your Walz portal</li>
          <li>Jade submits your application to the embassy on your behalf</li>
          <li>You receive real-time updates until a decision is reached</li>
        </ol>

        <a href="${portalUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;">
          Track My Application →
        </a>
      </div>
      ${footer()}
    `,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVisaAdminNotification(app: any, initiatedBy: 'admin' | 'client' = 'client') {
  const resend = getResend()
  const config = getVisaConfig(app.destinationIso2)
  const clientName = `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || 'Unknown'
  const adminUrl = `${BASE_URL}/admin/visa-applications/${app.id}`
  const isAdmin = initiatedBy === 'admin'

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: isAdmin
      ? `🔔 Admin-Initiated Application — ${clientName} — ${config?.name ?? app.destinationIso2} (${app.referenceNumber})`
      : `🆕 New Application + Payment — ${clientName} — ${config?.name ?? app.destinationIso2} (${app.referenceNumber})`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:#0B1F3A;">${isAdmin ? 'Admin-Initiated Application Submitted' : 'New Visa Application + Payment Received'}</h2>
        ${isAdmin
          ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:0 0 16px;"><p style="margin:0;color:#92400e;font-size:13px;font-weight:700;">🔔 Admin-Initiated — No payment collected. Jade arranged this application directly.</p></div>`
          : `<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin:0 0 16px;"><p style="margin:0;color:#166534;font-size:13px;font-weight:700;">💳 Client Self-Applied — Service fee payment received.</p></div>`
        }
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr style="background:#F4F6F9;"><td style="padding:10px 16px;color:#64748b;font-size:13px;width:40%;">Reference</td><td style="padding:10px 16px;color:#0B1F3A;font-weight:700;">${app.referenceNumber}</td></tr>
          <tr><td style="padding:10px 16px;color:#64748b;font-size:13px;">Client</td><td style="padding:10px 16px;color:#0B1F3A;">${clientName}</td></tr>
          <tr style="background:#F4F6F9;"><td style="padding:10px 16px;color:#64748b;font-size:13px;">Email</td><td style="padding:10px 16px;color:#0B1F3A;">${app.email}</td></tr>
          <tr><td style="padding:10px 16px;color:#64748b;font-size:13px;">Phone</td><td style="padding:10px 16px;color:#0B1F3A;">${app.phone ?? '—'}</td></tr>
          <tr style="background:#F4F6F9;"><td style="padding:10px 16px;color:#64748b;font-size:13px;">Destination</td><td style="padding:10px 16px;color:#0B1F3A;">${config?.flag ?? ''} ${config?.name ?? app.destinationIso2}</td></tr>
          <tr><td style="padding:10px 16px;color:#64748b;font-size:13px;">Visa Type</td><td style="padding:10px 16px;color:#0B1F3A;">${app.visaType}</td></tr>
          <tr style="background:#F4F6F9;"><td style="padding:10px 16px;color:#64748b;font-size:13px;">${isAdmin ? 'Service Fee' : 'Service Fee Paid'}</td><td style="padding:10px 16px;${isAdmin ? 'color:#9a3412' : 'color:#16a34a'};font-weight:700;">${isAdmin ? 'Not collected (admin flow)' : `USD $${app.serviceFeeAmount} PAID`}</td></tr>
          <tr><td style="padding:10px 16px;color:#64748b;font-size:13px;">Arrival Date</td><td style="padding:10px 16px;color:#0B1F3A;">${app.arrivalDate ? new Date(app.arrivalDate).toLocaleDateString('en-GB') : '—'}</td></tr>
        </table>
        <a href="${adminUrl}" style="display:inline-block;background:#0B1F3A;color:#C9A84C;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;">
          Open Application in CRM →
        </a>
      </div>
      ${footer()}
    `,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVisaStatusUpdate(app: any) {
  if (!app.email) return
  const resend = getResend()
  const config = getVisaConfig(app.destinationIso2)
  const statusCfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.received
  const clientName = `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || 'Client'
  const portalUrl = `${BASE_URL}/portal/visa-application/${app.id}`

  const statusMessages: Record<string, string> = {
    documents_pending:    'We\'ve reviewed your application. Please upload your supporting documents through the portal as soon as possible.',
    under_review:         'Your documents have been received. Our team is reviewing your complete application before submission.',
    ready_to_submit:      'Great news! Your application is complete and ready to be submitted to the embassy.',
    submitted_to_embassy: 'Your visa application has been officially submitted to the embassy. We\'ll keep you updated on progress.',
    decision_pending:     'The embassy is processing your application. Decisions typically take a few working days from this point.',
    approved:             '🎉 Congratulations! Your visa application has been APPROVED! Check your portal for next steps.',
    refused:              'We\'re sorry — your visa application was refused. Please check your portal for details and resubmission options.',
  }

  const message = statusMessages[app.status] ?? `Your application status has been updated to: ${statusCfg.label}`

  await resend.emails.send({
    from: FROM,
    to: app.email,
    subject: `Application Update — ${app.referenceNumber} — ${statusCfg.label}`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:#0B1F3A;">Application Update</h2>
        <p style="color:#475569;margin:0 0 20px;">Hi ${clientName},</p>
        <div style="background:#F4F6F9;border-left:4px solid #C9A84C;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">New Status</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#0B1F3A;">${statusCfg.label}</p>
        </div>
        <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">${message}</p>
        ${app.decisionNotes ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:0 0 20px;"><p style="margin:0;color:#9a3412;font-size:13px;">${app.decisionNotes}</p></div>` : ''}
        <a href="${portalUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;">
          View My Application →
        </a>
      </div>
      ${footer()}
    `,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendGovtFeeInstructions(app: any, instructions: string) {
  if (!app.email) return
  const resend = getResend()
  const config = getVisaConfig(app.destinationIso2)
  const clientName = `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || 'Client'
  const portalUrl = `${BASE_URL}/portal/visa-application/${app.id}`

  await resend.emails.send({
    from: FROM,
    to: app.email,
    subject: `Action Required — Pay Your Government Visa Fee (${app.referenceNumber})`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:20px;margin:0 0 24px;">
          <h2 style="margin:0 0 8px;color:#92400e;font-size:18px;">⚠️ Action Required</h2>
          <p style="margin:0;color:#92400e;font-size:14px;">Please pay your ${config?.name} government visa fee</p>
        </div>
        <p style="color:#475569;margin:0 0 16px;">Hi ${clientName},</p>
        <p style="color:#475569;font-size:14px;margin:0 0 20px;">Your application is ready for the government fee. Please follow the instructions below:</p>
        <div style="background:#F4F6F9;border-radius:12px;padding:20px 24px;margin:0 0 24px;white-space:pre-wrap;font-size:14px;color:#0B1F3A;line-height:1.7;">${instructions}</div>
        <p style="color:#475569;font-size:13px;margin:0 0 24px;">Once you've paid, click the button in your portal to notify us.</p>
        <a href="${portalUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;">
          I've Paid My Government Fee →
        </a>
      </div>
      ${footer()}
    `,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendApplicationFormLink(
  app: any,
  clientEmail: string,
  clientName: string,
  personalMessage?: string,
  formUrl?: string,
  feeInfo?: { amount: number; currency: string; paymentChoice: 'now' | 'later'; govtFee?: number; govtCurrency?: string; showGovtFee?: boolean } | null,
) {
  const resend = getResend()
  const config = getVisaConfig(app.destinationIso2)
  const resolvedFormUrl = formUrl ?? `${BASE_URL}/visa/apply/${app.destinationIso2.toLowerCase()}?draft=${app.id}`

  const govtFeeRow = feeInfo?.govtFee && feeInfo.showGovtFee !== false ? `
    <tr>
      <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Government Fee</td>
      <td style="padding:8px 0;color:#0B1F3A;font-size:13px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;">
        ${feeInfo.govtCurrency ?? 'USD'} ${Number(feeInfo.govtFee).toLocaleString()} <span style="color:#999;font-weight:400;font-size:12px;">(paid later)</span>
      </td>
    </tr>
  ` : ''

  const feeHtml = feeInfo && (feeInfo.amount > 0 || (feeInfo.govtFee && feeInfo.showGovtFee !== false)) ? `
    <div style="background:#f5f0e8;border-radius:12px;padding:16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${feeInfo.amount > 0 ? `
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:13px;">Walz Travels Service Fee</td>
            <td style="padding:8px 0;color:#0B1F3A;font-size:22px;font-weight:bold;text-align:right;">
              ${feeInfo.currency} ${Number(feeInfo.amount).toLocaleString()}
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 4px;color:#999;font-size:12px;">
              ${feeInfo.paymentChoice === 'now'
                ? 'Payment required to complete your application'
                : 'You can submit now and pay later'}
            </td>
          </tr>
          ` : ''}
          ${govtFeeRow}
        </tbody>
      </table>
    </div>
  ` : ''

  const paymentNote = feeInfo
    ? feeInfo.paymentChoice === 'now'
      ? `<p style="color:#475569;font-size:14px;margin:0 0 8px;">💳 <strong>Payment of ${feeInfo.currency} ${Number(feeInfo.amount).toLocaleString()} required</strong> — you'll be prompted to pay via Flutterwave when you submit.</p>`
      : `<p style="color:#475569;font-size:14px;margin:0 0 8px;">📋 <strong>Service fee: ${feeInfo.currency} ${Number(feeInfo.amount).toLocaleString()}</strong> — complete the form now and Jade will send a payment link after review.</p>`
    : `<p style="color:#475569;font-size:14px;margin:0 0 8px;">✅ <strong>No payment required</strong> — Jade will handle payment separately.</p>`

  await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: `Your ${config?.name ?? app.destinationIso2} Visa Application Form is Ready`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:#0B1F3A;">Your Visa Application Form is Ready</h2>
        <p style="color:#475569;margin:0 0 20px;">Hi ${clientName},</p>
        ${personalMessage ? `<div style="background:#F4F6F9;border-left:4px solid #C9A84C;border-radius:8px;padding:16px;margin:0 0 20px;"><p style="margin:0;color:#0B1F3A;font-size:14px;">${personalMessage}</p></div>` : ''}
        <p style="color:#475569;font-size:14px;margin:0 0 20px;">
          Jade has prepared your <strong>${config?.name ?? app.destinationIso2}</strong> visa application form.
          Your known details have been pre-filled to save you time — please review and complete all fields.
        </p>
        ${feeHtml}
        ${paymentNote}
        <p style="color:#475569;font-size:14px;margin:0 0 24px;">Simply complete the form, review your details, and click Submit. Jade will be in touch within 24 hours.</p>
        <a href="${resolvedFormUrl}" style="display:block;text-align:center;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:16px;padding:16px 32px;border-radius:12px;text-decoration:none;margin:0 0 24px;">
          Complete My Application →
        </a>
        <div style="background:#0B1F3A;border-radius:10px;padding:16px 20px;">
          <p style="margin:0;color:#C9A84C;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Questions? WhatsApp Jade</p>
          <p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;">+44 7398 753797</p>
        </div>
      </div>
      ${footer()}
    `,
  })
}

// ── Welcome email: sent when admin creates a client account automatically ──────

export async function sendClientWelcomeEmail({
  to, name, tempPassword, loginUrl,
}: {
  to: string
  name: string
  tempPassword: string
  loginUrl: string
}) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Welcome to Walz Travels — Your account is ready',
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:#0B1F3A;font-size:22px;">Your account has been created ✅</h2>
        <p style="color:#475569;margin:0 0 20px;">Hi ${name},</p>
        <p style="color:#475569;font-size:14px;margin:0 0 20px;">
          Walz Travels has created a personal account for you so you can track your visa application
          and manage all your travel documents in one place.
        </p>
        <div style="background:#F4F6F9;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
          <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Your login details</p>
          <p style="color:#0B1F3A;font-size:14px;margin:0 0 4px;"><strong>Email:</strong> ${to}</p>
          <p style="color:#0B1F3A;font-size:14px;margin:0;"><strong>Temporary password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${tempPassword}</code></p>
        </div>
        <p style="color:#475569;font-size:13px;margin:0 0 24px;">
          Please change your password after your first login.
        </p>
        <a href="${loginUrl}" style="display:block;text-align:center;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;margin:0 0 24px;">
          Log in to My Account →
        </a>
        <div style="background:#0B1F3A;border-radius:10px;padding:16px 20px;">
          <p style="margin:0;color:#C9A84C;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Need help?</p>
          <p style="margin:0;color:#ffffff;font-size:14px;">WhatsApp us on <strong>+44 7398 753797</strong> or email <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a></p>
        </div>
      </div>
      ${footer()}
    `,
  })
}

// ── Tracking email: sent after visa application is created ─────────────────────

export async function sendVisaTrackingEmail({
  to, name, reference, destination, trackingUrl,
}: {
  to: string
  name: string
  reference: string
  destination: string
  trackingUrl: string
}) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your visa application reference: ${reference}`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:#0B1F3A;font-size:22px;">Application Received 📋</h2>
        <p style="color:#475569;margin:0 0 20px;">Hi ${name},</p>
        <p style="color:#475569;font-size:14px;margin:0 0 20px;">
          We've received your <strong>${destination}</strong> visa application and our team will begin reviewing it shortly.
        </p>
        <div style="background:#0B1F3A;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
          <p style="color:#C9A84C;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Your Reference</p>
          <p style="color:#ffffff;font-size:32px;font-weight:700;letter-spacing:4px;margin:0;">${reference}</p>
        </div>
        <p style="color:#475569;font-size:14px;margin:0 0 24px;">
          Use the button below to track your application status in real time. You'll also receive an email each time your status is updated.
        </p>
        <a href="${trackingUrl}" style="display:block;text-align:center;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;margin:0 0 24px;">
          Track My Application →
        </a>
        <div style="background:#F4F6F9;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
          <p style="color:#0B1F3A;font-size:13px;font-weight:600;margin:0 0 8px;">What happens next?</p>
          <ol style="color:#475569;font-size:13px;margin:0;padding-left:16px;line-height:2;">
            <li>We review your application and documents</li>
            <li>We submit to the embassy on your behalf</li>
            <li>You receive real-time updates until a decision</li>
          </ol>
        </div>
      </div>
      ${footer()}
    `,
  })
}

// ── Status update email: sent when admin changes application status ─────────────

export async function sendVisaStatusUpdateEmail({
  to, name, reference, destination, newStatus, message, trackingUrl,
}: {
  to: string
  name: string
  reference: string
  destination: string
  newStatus: string
  message: string
  trackingUrl: string
}) {
  const resend = getResend()

  const statusLabels: Record<string, string> = {
    received:             '📋 Application Received',
    documents_pending:    '📎 Documents Required',
    under_review:         '🔍 Under Review',
    ready_to_submit:      '✅ Ready to Submit',
    submitted_to_embassy: '🏛️ Submitted to Embassy',
    decision_pending:     '⏳ Decision Pending',
    approved:             '✅ APPROVED',
    refused:              '❌ Refused',
  }

  const label = statusLabels[newStatus] ?? newStatus
  const isApproved = newStatus === 'approved'
  const isRefused  = newStatus === 'refused'

  await resend.emails.send({
    from: FROM,
    to,
    subject: isApproved
      ? `🎉 Your ${destination} visa has been APPROVED! — ${reference}`
      : `Update on your ${destination} visa application — ${reference}`,
    html: `
      ${header()}
      <div style="padding:32px 40px;">
        <h2 style="margin:0 0 8px;color:${isApproved ? '#16a34a' : isRefused ? '#dc2626' : '#0B1F3A'};font-size:22px;">
          ${isApproved ? '🎉 Congratulations!' : isRefused ? 'Application Update' : 'Application Update'}
        </h2>
        <p style="color:#475569;margin:0 0 20px;">Hi ${name},</p>
        <p style="color:#475569;font-size:14px;margin:0 0 20px;">
          There's an update on your <strong>${destination}</strong> visa application (<strong>${reference}</strong>).
        </p>
        <div style="background:${isApproved ? '#f0fdf4' : isRefused ? '#fef2f2' : '#F4F6F9'};border:1px solid ${isApproved ? '#86efac' : isRefused ? '#fca5a5' : '#e2e8f0'};border-radius:12px;padding:20px 24px;margin:0 0 24px;">
          <p style="font-size:16px;font-weight:700;color:${isApproved ? '#15803d' : isRefused ? '#b91c1c' : '#0B1F3A'};margin:0 0 8px;">${label}</p>
          <p style="color:#475569;font-size:14px;margin:0;">${message}</p>
        </div>
        <a href="${trackingUrl}" style="display:block;text-align:center;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;margin:0 0 24px;">
          View Full Timeline →
        </a>
        <div style="background:#0B1F3A;border-radius:10px;padding:16px 20px;">
          <p style="margin:0;color:#C9A84C;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Questions?</p>
          <p style="margin:0;color:#ffffff;font-size:14px;">WhatsApp <strong>+44 7398 753797</strong> or <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a></p>
        </div>
      </div>
      ${footer()}
    `,
  })
}
