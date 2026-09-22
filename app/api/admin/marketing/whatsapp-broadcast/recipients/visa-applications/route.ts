/**
 * WhatsApp Broadcast V1.1 — SELECTABLE visa applicants.
 *
 * ── THIS ENDPOINT IS SELECTION, NOT ELIGIBILITY ─────────────────────────
 * Same contract as the leads picker: it returns every real
 * VisaApplication matching the search WHATEVER its consent status, and the
 * `consentStatus` / `optedOut` fields are advisory labels for staff
 * visibility only. Eligibility is computed separately and authoritatively
 * in lib/whatsapp/broadcast/audience-multi.ts.
 *
 * ── WHICH FIELDS ARE REAL ───────────────────────────────────────────────
 * Every filter dimension offered here is an actual column on
 * VisaApplication (audited against prisma/schema.prisma):
 *   destinationIso2  destination / visa country
 *   visaType         'tourist' | 'business' | …
 *   status           'draft' | 'received' | … | 'approved' | 'refused'
 *   assignedTo       the staff assignment the admin list UI already uses
 *   branch           'nigeria' | …
 *   createdAt        application date, as a from/to range
 * The applicant's contact number is `phone`. There is no dedicated
 * WhatsApp column on this model, and `whatsappBsuid` is Meta's username
 * field, not a phone number — neither is invented here.
 *
 * NOTE: VisaApplication has NO foreign key to Lead. A visa applicant is
 * therefore resolved as a FIRST-CLASS source, never converted into a
 * synthetic Lead row, and cross-source de-duplication happens on the
 * canonical phone number (the only identity the two stores share).
 *
 * Read-only. Writes nothing, sends nothing.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { parseVisaTargetFilter } from '@/lib/whatsapp/broadcast/selection'
import { buildVisaWhere } from '@/lib/whatsapp/broadcast/audience-multi'
import { normalizePhoneE164 } from '@/lib/identity/normalize'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const filter = parseVisaTargetFilter({
    destinationIso2: sp.get('destinationIso2'),
    visaType: sp.get('visaType'),
    status: sp.get('status'),
    assignedTo: sp.get('assignedTo'),
    branch: sp.get('branch'),
    createdFrom: sp.get('createdFrom'),
    createdTo: sp.get('createdTo'),
  })
  const limitRaw = Number(sp.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), MAX_LIMIT) : DEFAULT_LIMIT
  // The Visa contextual action asks for exactly one application by id.
  const id = (sp.get('id') ?? '').trim()

  const where: Record<string, unknown> = id ? { id } : buildVisaWhere(filter)
  if (!id && q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { referenceNumber: { contains: q, mode: 'insensitive' } },
    ]
  }

  const rows = await prisma.visaApplication.findMany({
    where,
    select: {
      id: true, referenceNumber: true, firstName: true, lastName: true,
      phone: true, email: true, destinationIso2: true, visaType: true,
      status: true, assignedTo: true, branch: true,
      arrivalDate: true, createdAt: true, marketingOptOut: true,
    },
    orderBy: { createdAt: 'desc' },
    take: id ? 1 : limit,
  })

  const withNumbers = rows.map(r => ({ ...r, normalizedNumber: normalizePhoneE164(r.phone) }))

  // Advisory labelling only — this lookup filters nothing.
  const numbers = withNumbers.map(r => r.normalizedNumber).filter((n): n is string => Boolean(n))
  const consents = numbers.length
    ? await prisma.whatsAppConsent.findMany({
        where: { normalizedNumber: { in: numbers } },
        select: { normalizedNumber: true, status: true },
      })
    : []
  const consentByNumber = new Map(consents.map(c => [c.normalizedNumber, c.status]))

  // The REAL size of the filter behind a "select all matching this filter"
  // button — a SQL count, never an estimate and never this page's length.
  const total = id ? rows.length : await prisma.visaApplication.count({ where })

  return NextResponse.json({
    applications: withNumbers.map(r => ({
      id: r.id,
      referenceNumber: r.referenceNumber,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || null,
      email: r.email,
      normalizedNumber: r.normalizedNumber,
      rawNumber: r.phone,
      destinationIso2: r.destinationIso2,
      visaType: r.visaType,
      status: r.status,
      assignedTo: r.assignedTo,
      branch: r.branch,
      createdAt: r.createdAt,
      // ── Advisory only. Never a filter, never trusted by the sender. ──
      optedOut: r.marketingOptOut,
      consentStatus: r.normalizedNumber ? consentByNumber.get(r.normalizedNumber) ?? 'UNKNOWN' : 'UNKNOWN',
      hasValidNumber: Boolean(r.normalizedNumber),
    })),
    limit,
    total,
    truncated: !id && rows.length >= limit,
    selectionNotice:
      'Any applicant can be selected regardless of consent. Whether each one can actually be sent to is computed separately, on the server, at the preview and again when the campaign is approved.',
  })
}
