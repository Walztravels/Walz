/**
 * WhatsApp Broadcast V1.2 — Export Contacts (CSV).
 *
 * POST /api/admin/marketing/whatsapp-broadcast/export
 * Body: { selection: <same AudienceSelection shape the preview endpoint accepts> }
 *
 * ── A SEPARATE PERMISSION FROM SENDING ───────────────────────────────────
 * Gated behind `marketing_whatsapp_export`, NOT `marketing_whatsapp_broadcast`.
 * Being able to send a campaign does not by itself imply being able to bulk-
 * export the underlying contact/consent directory — these are deliberately
 * two separately-grantable capabilities (see lib/permissions.ts /
 * lib/permissions-registry.ts).
 *
 * ── THIS IS A CONTACT DIRECTORY EXPORT, NOT A "WHO WILL BE SENT TO" EXPORT ──
 * It lists every SELECTED contact — eligible and excluded alike — with
 * their real consent status/date, exactly the way the Select-All/preview
 * screens already show selection as separate from eligibility (see
 * lib/whatsapp/broadcast/audience-multi.ts's SELECTABLE vs
 * ELIGIBLE_TO_SEND doc comment). Exporting NEVER creates, modifies, or
 * implies any consent record — it is a read-only report.
 *
 * Resolves the SAME selection shape used everywhere else in this feature
 * (`parseAudienceSelection` → `resolveMultiSourceAudience`) so the export
 * always reflects the real, server-resolved audience, never a client-sent
 * list of rows.
 *
 * Columns: name, WhatsApp number, source, source reference, country
 * (best-effort, derived from the dialling prefix), service (where
 * available), consent status, consent date, opt-out status, opt-out date.
 * Deliberately excludes every VisaApplication field beyond name/reference/
 * country — no passport data, no application status, no destination or
 * financial detail.
 *
 * Every export is logged to WhatsAppContactExportLog: who, when, how many
 * rows, and a JSON summary of what was exported (source types + filter
 * shape) — never the exported rows themselves.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { can } from '@/lib/permissions-registry'
import { deriveCountryFromNumber } from '@/lib/whatsapp/broadcast/audience'
import { resolveMultiSourceAudience } from '@/lib/whatsapp/broadcast/audience-multi'
import { parseAudienceSelection } from '@/lib/whatsapp/broadcast/selection'

export const dynamic = 'force-dynamic'

const EXPORT_PERMISSION = 'marketing_whatsapp_export'

/**
 * CSV-escape AND defuse formula injection (OWASP CSV Injection). A Lead
 * name or a manually-typed display name is attacker-influenced free text
 * that ends up opened in Excel/Sheets by an admin; a value starting with
 * =, +, -, @, or a tab/CR is a formula trigger in those tools. Prefixing
 * with a single quote is the standard, widely-used mitigation — it forces
 * spreadsheet software to treat the cell as text.
 */
function csvEscape(v: string | null | undefined): string {
  let s = v ?? ''
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!can(session, EXPORT_PERMISSION)) {
    return NextResponse.json(
      { error: 'Export WhatsApp Contacts permission required. Contact your admin.' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const r = (body ?? {}) as Record<string, unknown>
  const selection = parseAudienceSelection(r.selection)

  const { recipients } = await resolveMultiSourceAudience({ selection, template: null })

  // Batch-fetch the fields the resolver's outward shape does not itself
  // carry: Lead.service (for LEAD-sourced rows) and the REAL consent row
  // (status/consentedAt/optedOutAt) — not the eligibility-derived
  // skipReason, which conflates "no consent" with "opted out" for display
  // purposes but is the wrong shape for a literal "consent status" column.
  const leadIds = Array.from(new Set(recipients.map(r2 => r2.leadId).filter((id): id is string => Boolean(id))))
  const numbers = Array.from(new Set(recipients.map(r2 => r2.normalizedNumber).filter((n): n is string => Boolean(n))))

  const [leadRows, consentRows] = await Promise.all([
    leadIds.length
      ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, service: true } })
      : Promise.resolve([]),
    numbers.length
      ? prisma.whatsAppConsent.findMany({
          where: { normalizedNumber: { in: numbers } },
          select: { normalizedNumber: true, status: true, consentedAt: true, optedOutAt: true },
        })
      : Promise.resolve([]),
  ])
  const serviceByLead = new Map(leadRows.map(l => [l.id, l.service]))
  const consentByNumber = new Map(consentRows.map(c => [c.normalizedNumber, c]))

  const header = [
    'name', 'whatsapp_number', 'source', 'source_reference', 'country', 'service',
    'consent_status', 'consent_date', 'opt_out_status', 'opt_out_date',
  ]
  const lines = [header.join(',')]

  for (const rec of recipients) {
    const name = rec.sourceProvenance[0]?.label ?? rec.displayName ?? ''
    const sources = rec.sourceProvenance.map(p => p.type).join('|') || rec.sourceType
    const sourceRef = rec.leadId ?? rec.visaApplicationId ?? ''
    const country = deriveCountryFromNumber(rec.normalizedNumber) ?? ''
    const service = rec.leadId ? (serviceByLead.get(rec.leadId) ?? '') : (rec.visaApplicationId ? 'Visa Processing' : '')
    const consent = rec.normalizedNumber ? consentByNumber.get(rec.normalizedNumber) : undefined
    const consentStatus = consent?.status ?? 'UNKNOWN'
    const consentDate = consent?.consentedAt ? consent.consentedAt.toISOString() : ''
    const optOutStatus = consent?.status === 'OPTED_OUT' ? 'OPTED_OUT' : 'NOT_OPTED_OUT'
    const optOutDate = consent?.optedOutAt ? consent.optedOutAt.toISOString() : ''

    lines.push([
      csvEscape(name),
      csvEscape(rec.normalizedNumber ?? ''),
      csvEscape(sources),
      csvEscape(sourceRef),
      csvEscape(country),
      csvEscape(service ?? ''),
      csvEscape(consentStatus),
      csvEscape(consentDate),
      csvEscape(optOutStatus),
      csvEscape(optOutDate),
    ].join(','))
  }

  const csv = lines.join('\n')

  // Audit the export — never the exported rows, only what was asked for
  // and how many rows came back.
  await prisma.whatsAppContactExportLog.create({
    data: {
      staffId: session.id,
      staffEmail: session.email,
      recipientCount: recipients.length,
      summary: {
        hasLeadFilter: Boolean(selection.leadFilter && Object.keys(selection.leadFilter).length),
        useLeadFilter: Boolean(selection.useLeadFilter),
        leadIdCount: selection.leadIds?.length ?? 0,
        hasVisaFilter: Boolean(selection.visaFilter && Object.keys(selection.visaFilter).length),
        useVisaFilter: Boolean(selection.useVisaFilter),
        visaIdCount: selection.visaApplicationIds?.length ?? 0,
        manualCount: selection.manualEntries?.length ?? 0,
      },
      ipAddress: clientIp(req),
    },
  })

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
