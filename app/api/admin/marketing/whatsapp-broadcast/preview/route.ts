/**
 * WhatsApp Broadcast — audience preview (V1, extended for V1.1).
 *
 * Computes the REAL breakdown server-side from the Prisma Lead table, the
 * VisaApplication table, the manual numbers as typed, and the consent
 * table. The wizard shows exactly these numbers, and the confirmation step
 * re-runs this same endpoint immediately before queueing so the number a
 * human approves is never a client-cached value from an earlier step.
 *
 * ── V1.1: SELECTION IN, ELIGIBILITY OUT ─────────────────────────────────
 * The request carries a SELECTION — Lead ids, VisaApplication ids,
 * explicitly resolved filters, raw manual strings. It carries no phone
 * number belonging to a record, no name, no count and no eligibility
 * claim, because `parseAudienceSelection` has no field for any of those.
 * This route reads the named records back from the database itself and
 * computes eligibility here. A tampered selection can only ever name a
 * different real record.
 *
 * ── V1 PATH IS UNCHANGED ────────────────────────────────────────────────
 * A filter-only request (no ids, no manual numbers, no explicit
 * "select all") still runs through V1's untouched `resolveAudience()`.
 * The multi-source resolver is an added path, not a reroute.
 *
 * Given the consent position (see lib/whatsapp/broadcast/consent.ts), the
 * honest `eligible` figure today is expected to be zero for EVERY source,
 * with almost everyone reported as `missingConsent`. That is correct
 * output, and the exclusion buckets below say so in words.
 *
 * Read-only: this endpoint writes nothing and sends nothing.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { parseTargetFilter, resolveAudience } from '@/lib/whatsapp/broadcast/audience'
import {
  exclusionsFromV1Breakdown,
  resolveMultiSourceAudience,
} from '@/lib/whatsapp/broadcast/audience-multi'
import { hasMultiSourceSelection, parseAudienceSelection } from '@/lib/whatsapp/broadcast/selection'
import { validateTemplateDefinition, type TemplateDefinition } from '@/lib/whatsapp/broadcast/template'

export const dynamic = 'force-dynamic'

const CONSENT_NOTICE =
  'Recipients without a recorded WhatsApp marketing consent are excluded. Lead.marketingOptOut and ' +
  'VisaApplication.marketingOptOut are opt-OUT flags and are never treated as consent, and a manually ' +
  'entered number gets exactly the same check as a stored record.'

export async function POST(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  let body: {
    broadcastId?: string
    targetFilter?: unknown
    audienceSelection?: unknown
    templateName?: string
    templateLanguage?: string
    templateParams?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let filter = parseTargetFilter(body.targetFilter)
  let selection = parseAudienceSelection(body.audienceSelection)
  let template: TemplateDefinition | null = null
  let templateErrors: string[] = []

  // When a broadcastId is given, the STORED definition wins — the preview
  // must describe what would actually be sent, not what the browser says.
  if (body.broadcastId) {
    const broadcast = await prisma.whatsAppBroadcast.findUnique({
      where: { id: body.broadcastId },
      select: {
        targetFilter: true, audienceSelection: true,
        templateName: true, templateLanguage: true, templateParams: true,
      },
    })
    if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    filter = parseTargetFilter(broadcast.targetFilter)
    selection = parseAudienceSelection(broadcast.audienceSelection)
    if (broadcast.templateName) {
      const v = validateTemplateDefinition({
        name: broadcast.templateName,
        language: broadcast.templateLanguage,
        params: broadcast.templateParams,
      })
      template = v.definition
      templateErrors = v.errors
    }
  } else if (body.templateName || body.templateLanguage || body.templateParams) {
    const v = validateTemplateDefinition({
      name: body.templateName,
      language: body.templateLanguage,
      params: body.templateParams,
    })
    template = v.definition
    templateErrors = v.errors
  }

  // ── V1.1 multi-source path ────────────────────────────────────────────
  if (hasMultiSourceSelection(selection)) {
    const { breakdown, sample, manual } = await resolveMultiSourceAudience({ selection, template })
    return NextResponse.json({
      multiSource: true,
      selection,
      breakdown,
      exclusions: breakdown.exclusions,
      manual,
      sample,
      templateValid: template !== null,
      templateErrors,
      consentNotice: breakdown.missingConsent > 0 ? CONSENT_NOTICE : null,
    })
  }

  // ── V1 single-source path — untouched resolver ────────────────────────
  const { breakdown, sample } = await resolveAudience({ filter, template })

  return NextResponse.json({
    multiSource: false,
    filter,
    breakdown,
    // Explained buckets, so the redesigned preview reads the same whichever
    // resolver produced the numbers.
    exclusions: exclusionsFromV1Breakdown(breakdown),
    sample,
    templateValid: template !== null,
    templateErrors,
    // Surfaced so the wizard can explain a zero count truthfully rather
    // than looking broken.
    consentNotice: breakdown.missingConsent > 0 ? CONSENT_NOTICE : null,
  })
}
