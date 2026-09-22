/**
 * WhatsApp Broadcast V1.1 — SELECTABLE clients & leads.
 *
 * ── THIS ENDPOINT IS SELECTION, NOT ELIGIBILITY ─────────────────────────
 * It returns every real Lead matching the search, WHATEVER their consent
 * status. Selection is never gated by consent: staff must be able to find
 * and tick anybody in order to build a working list and then SEE, in the
 * preview, who is excluded and why. Hiding opted-out or unconsented people
 * from search would not make the feature safer — it would make the
 * exclusions invisible.
 *
 * The `consentStatus` and `optedOut` fields below are ADVISORY LABELS for
 * that visibility. They are never used to filter this list, and they are
 * never what the sender trusts: the authoritative verdict is recomputed
 * server-side in lib/whatsapp/broadcast/audience-multi.ts at preview time
 * and again at snapshot time, from the database, not from anything this
 * response said or the browser remembered.
 *
 * Read-only. Writes nothing, sends nothing.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { matchesCountry, parseTargetFilter } from '@/lib/whatsapp/broadcast/audience'
import { normalizePhoneE164 } from '@/lib/identity/normalize'

export const dynamic = 'force-dynamic'

/** One page of results. Kept small — this is a picker, not an export. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const filter = parseTargetFilter({
    service: sp.get('service'),
    branch: sp.get('branch'),
    country: sp.get('country'),
  })
  const limitRaw = Number(sp.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), MAX_LIMIT) : DEFAULT_LIMIT

  const where: Record<string, unknown> = {}
  if (filter.service) where.service = filter.service
  if (filter.branch) where.branch = filter.branch
  if (q) {
    // Name / email / phone, the three things a staff member actually types.
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { whatsapp: { contains: q } },
    ]
  }

  // The country filter is derived from the dialling prefix (there is no
  // country column on Lead — see audience.ts), so it cannot be a SQL
  // predicate. Over-fetch a little and apply it in process.
  const rows = await prisma.lead.findMany({
    where,
    select: {
      id: true, name: true, email: true, whatsapp: true,
      service: true, branch: true, destination: true,
      marketingOptOut: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: filter.country ? Math.min(limit * 10, MAX_LIMIT * 10) : limit,
  })

  const withNumbers = rows
    .map(r => ({ ...r, normalizedNumber: normalizePhoneE164(r.whatsapp) }))
    .filter(r => (filter.country ? matchesCountry(r.normalizedNumber, filter.country) : true))
    .slice(0, limit)

  // Consent is looked up ONLY to label the rows. It does not filter them.
  const numbers = withNumbers.map(r => r.normalizedNumber).filter((n): n is string => Boolean(n))
  const consents = numbers.length
    ? await prisma.whatsAppConsent.findMany({
        where: { normalizedNumber: { in: numbers } },
        select: { normalizedNumber: true, status: true },
      })
    : []
  const consentByNumber = new Map(consents.map(c => [c.normalizedNumber, c.status]))

  // The REAL size of the filter behind a "select all matching this filter"
  // button. Never an estimate, and never the length of this page of
  // results. When a country filter is active this is the count BEFORE the
  // derived dialling-prefix filter, because that one cannot be a SQL
  // predicate — the response says so rather than pretending otherwise.
  const total = await prisma.lead.count({ where })

  return NextResponse.json({
    leads: withNumbers.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      normalizedNumber: r.normalizedNumber,
      rawNumber: r.whatsapp,
      service: r.service,
      branch: r.branch,
      destination: r.destination,
      // ── Advisory only. Never a filter, never trusted by the sender. ──
      optedOut: r.marketingOptOut,
      consentStatus: r.normalizedNumber ? consentByNumber.get(r.normalizedNumber) ?? 'UNKNOWN' : 'UNKNOWN',
      hasValidNumber: Boolean(r.normalizedNumber),
    })),
    limit,
    total,
    /** True when `total` is counted before the derived country filter. */
    totalIsBeforeCountryFilter: Boolean(filter.country),
    /** Present so the UI can say "showing the first N" honestly. */
    truncated: withNumbers.length >= limit,
    selectionNotice:
      'Anyone can be selected regardless of consent. Whether each selected person can actually be sent to is computed separately, on the server, at the preview and again when the campaign is approved.',
  })
}
