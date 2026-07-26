// lib/concierge/adapters/manual.ts
// ManualAdapter — all suppliers use this on day one.
// Sends a structured ops notification email; all supplier contact is human-operated.
// No supplier API credentials needed or used.

import type { SupplierAdapter } from './base'
import type { DispatchPayload, DispatchResult, AvailabilityQuery, AvailabilityResult } from '../types'
import { getResend } from '@/lib/resend'

const FROM_EMAIL  = 'Jade Concierge <contact@walztravels.com>'
const OPS_FALLBACK = 'contact@walztravels.com'

const SLA_BY_FULFILMENT: Record<string, string> = {
  instant:         'Within 2 hours',
  request_to_book: 'Within 4 hours',
  bespoke:         'Within 24 hours',
}

export class ManualAdapter implements SupplierAdapter {
  readonly type = 'manual' as const

  async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
    const to = payload.supplier.contactEmail ?? OPS_FALLBACK

    try {
      const resend = getResend()
      await resend.emails.send({
        from:    FROM_EMAIL,
        to,
        subject: `[Walz Concierge] ${payload.requestReference} — ${payload.category.name}`,
        html:    buildOpsEmail(payload),
      })
      return { success: true }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      console.error('[ManualAdapter] Email dispatch failed:', error)
      return { success: false, error }
    }
  }

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    // Manual suppliers don't have real-time availability — return the SLA window
    return {
      available: true,
      sla:       SLA_BY_FULFILMENT.request_to_book,
      note:      'A concierge specialist will confirm availability when they contact you.',
    }
  }
}

function buildOpsEmail(payload: DispatchPayload): string {
  const sla = SLA_BY_FULFILMENT[payload.fulfilmentMode] ?? 'Within 4 hours'

  const fieldRows = Object.entries(payload.fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      return `
        <tr>
          <td style="padding:6px 0;color:#6B7280;width:160px;font-size:13px;vertical-align:top">${label}</td>
          <td style="padding:6px 0;color:#0B1F3A;font-size:13px">${String(v)}</td>
        </tr>`
    })
    .join('')

  const chatwootLink = payload.chatwootConvId
    ? `<a href="https://chat.walztravels.com/app/accounts/1/conversations/${payload.chatwootConvId}"
          style="background:#C9A84C;color:#0B1F3A;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;margin-top:16px">
        View conversation in Chatwoot →
      </a>`
    : ''

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:#0B1F3A;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0;font-size:20px">Walz Concierge — New Request</h1>
        <p style="color:#ffffff80;margin:4px 0 0;font-size:13px">Reference: <strong style="color:#fff">${payload.requestReference}</strong></p>
      </div>
      <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px">

        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px 16px;margin-bottom:20px">
          <p style="margin:0;font-size:13px;color:#92400E">
            <strong>SLA: ${sla}</strong> · Fulfilment: ${payload.fulfilmentMode.replace(/_/g, ' ')}
          </p>
        </div>

        <h3 style="color:#0B1F3A;margin:0 0 4px;font-size:16px">${payload.category.name}</h3>
        <p style="color:#6B7280;font-size:13px;margin:0 0 20px">${payload.category.description ?? 'Please review the request details below and contact the client.'}</p>

        <h4 style="color:#0B1F3A;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.06em">Client Details</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:5px 0;color:#6B7280;width:160px;font-size:13px">Name</td><td style="color:#0B1F3A;font-size:13px;font-weight:600">${payload.clientName ?? '—'}</td></tr>
          <tr><td style="padding:5px 0;color:#6B7280;font-size:13px">Email</td><td style="color:#0B1F3A;font-size:13px">${payload.clientEmail ?? '—'}</td></tr>
          <tr><td style="padding:5px 0;color:#6B7280;font-size:13px">Phone</td><td style="color:#0B1F3A;font-size:13px">${payload.clientPhone ?? '—'}</td></tr>
        </table>

        <h4 style="color:#0B1F3A;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.06em">Request Details</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">${fieldRows || '<tr><td colspan="2" style="color:#9CA3AF;font-size:13px;padding:6px 0">No additional details captured.</td></tr>'}</table>

        ${chatwootLink}

        <p style="font-size:11px;color:#9CA3AF;margin:20px 0 0;border-top:1px solid #E5E7EB;padding-top:12px">
          Dispatched by Jade AI · Walz Travels Concierge · ${new Date().toUTCString()}
        </p>
      </div>
    </div>`
}
