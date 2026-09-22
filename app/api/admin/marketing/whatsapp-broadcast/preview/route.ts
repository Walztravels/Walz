/**
 * WhatsApp Broadcast V1 — audience preview.
 *
 * Computes the REAL breakdown server-side from the Prisma Lead table and
 * the consent table. The wizard shows exactly these numbers, and the
 * confirmation step re-runs this same endpoint immediately before queueing
 * so the number a human approves is never a client-cached value from an
 * earlier step.
 *
 * Given the consent position (see lib/whatsapp/broadcast/consent.ts), the
 * honest `eligible` figure today is expected to be zero or near-zero, with
 * almost everyone reported as `missingConsent`. That is correct output.
 *
 * Read-only: this endpoint writes nothing and sends nothing.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { parseTargetFilter, resolveAudience } from '@/lib/whatsapp/broadcast/audience'
import { validateTemplateDefinition, type TemplateDefinition } from '@/lib/whatsapp/broadcast/template'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  let body: {
    broadcastId?: string
    targetFilter?: unknown
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
  let template: TemplateDefinition | null = null
  let templateErrors: string[] = []

  // When a broadcastId is given, the STORED definition wins — the preview
  // must describe what would actually be sent, not what the browser says.
  if (body.broadcastId) {
    const broadcast = await prisma.whatsAppBroadcast.findUnique({
      where: { id: body.broadcastId },
      select: { targetFilter: true, templateName: true, templateLanguage: true, templateParams: true },
    })
    if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    filter = parseTargetFilter(broadcast.targetFilter)
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

  const { breakdown, sample } = await resolveAudience({ filter, template })

  return NextResponse.json({
    filter,
    breakdown,
    sample,
    templateValid: template !== null,
    templateErrors,
    // Surfaced so the wizard can explain a zero count truthfully rather
    // than looking broken.
    consentNotice:
      breakdown.missingConsent > 0
        ? 'Recipients without a recorded WhatsApp marketing consent are excluded. Lead.marketingOptOut is an opt-OUT flag and is never treated as consent.'
        : null,
  })
}
