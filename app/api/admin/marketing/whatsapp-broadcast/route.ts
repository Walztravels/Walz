/**
 * WhatsApp Broadcast V1 — campaign CRUD.
 *
 * Creating or editing a broadcast NEVER sends anything and never resolves
 * an audience. Dispatch happens only through
 * POST /api/admin/marketing/whatsapp-broadcast/[id]/schedule, which is an
 * explicit human action, and then only via the cron processor.
 *
 * Changes from the pre-V1 route:
 *  - the `marketing_whatsapp_broadcast` permission is now ENFORCED (it was
 *    declared but unchecked — any admin could write broadcast rows);
 *  - statuses are the constrained uppercase vocabulary;
 *  - POST can no longer be told to create anything but a DRAFT (it already
 *    hardcoded 'draft', but the client still sent a `status` it ignored);
 *  - PATCH can no longer set an arbitrary status string — it edits CONTENT
 *    only, and refuses to touch a campaign past READY;
 *  - a browser-supplied `recipientCount` is ignored entirely; counts are
 *    always server-derived.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { parseTargetFilter } from '@/lib/whatsapp/broadcast/audience'
import { parseAudienceSelection } from '@/lib/whatsapp/broadcast/selection'
import { parseTemplateCategory } from '@/lib/whatsapp/broadcast/sources'
import { validateTemplateDefinition } from '@/lib/whatsapp/broadcast/template'
import { canScheduleBroadcast } from '@/lib/whatsapp/broadcast/lifecycle'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const broadcasts = await prisma.whatsAppBroadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ broadcasts })
}

export async function POST(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  let body: {
    name?: string
    message?: string
    mediaUrl?: string
    targetFilter?: unknown
    audienceSelection?: unknown
    templateName?: string
    templateLanguage?: string
    templateParams?: unknown
    templateCategory?: unknown
    scheduledAt?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: 'name and message are required' }, { status: 400 })
  }

  // A template may be supplied at creation or added later; it is only
  // MANDATORY at schedule time. Validate whatever was given.
  let templateName: string | null = null
  let templateLanguage: string | null = null
  let templateParams: unknown = []
  if (body.templateName || body.templateLanguage || body.templateParams) {
    const validation = validateTemplateDefinition({
      name: body.templateName,
      language: body.templateLanguage,
      params: body.templateParams,
    })
    if (!validation.ok) {
      return NextResponse.json({ error: 'Template is not valid', details: validation.errors }, { status: 422 })
    }
    templateName = validation.definition!.name
    templateLanguage = validation.definition!.language
    templateParams = validation.definition!.params
  }

  const broadcast = await prisma.whatsAppBroadcast.create({
    data: {
      name: body.name.trim(),
      // Internal description of the campaign. NEVER sent to Meta — the
      // outbound payload is always the approved template.
      message: body.message.trim(),
      mediaUrl: body.mediaUrl?.trim() || null,
      targetFilter: parseTargetFilter(body.targetFilter) as object,
      // POINTERS ONLY (ids, filters, raw manual strings) — narrowed by
      // parseAudienceSelection, which has no field for a number belonging
      // to a record, a name, a count or an eligibility claim. Re-resolved
      // against the live database on every preview and at snapshot time.
      audienceSelection: parseAudienceSelection(body.audienceSelection) as object,
      templateName,
      templateLanguage,
      templateParams: templateParams as object,
      // RECORDED FOR BOOKKEEPING ONLY. Never read by any eligibility code
      // path — see lib/whatsapp/broadcast/sources.ts.
      templateCategory: parseTemplateCategory(body.templateCategory),
      // recipientCount is deliberately NOT read from the request.
      recipientCount: 0,
      status: 'DRAFT',
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      createdBy: access.session.email,
    },
  })

  return NextResponse.json({ broadcast }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  let body: {
    id?: string
    name?: string
    message?: string
    mediaUrl?: string | null
    targetFilter?: unknown
    audienceSelection?: unknown
    templateName?: string
    templateLanguage?: string
    templateParams?: unknown
    templateCategory?: unknown
    scheduledAt?: string | null
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.whatsAppBroadcast.findUnique({
    where: { id: body.id },
    select: { id: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  // Editing a campaign whose audience has already been snapshotted would
  // make the snapshot a lie. Statuses past READY are immutable here.
  if (!canScheduleBroadcast(existing.status)) {
    return NextResponse.json(
      { error: `A broadcast in ${existing.status} can no longer be edited.` },
      { status: 409 },
    )
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.message !== undefined) data.message = String(body.message).trim()
  if (body.mediaUrl !== undefined) data.mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : null
  if (body.targetFilter !== undefined) data.targetFilter = parseTargetFilter(body.targetFilter)
  // Re-narrowed on every edit, never merged with whatever is stored: an
  // edit replaces the selection wholesale, so a removed recipient is
  // genuinely removed rather than lingering in an un-overwritten key.
  if (body.audienceSelection !== undefined) data.audienceSelection = parseAudienceSelection(body.audienceSelection)
  if (body.templateCategory !== undefined) data.templateCategory = parseTemplateCategory(body.templateCategory)
  if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null

  if (body.templateName !== undefined || body.templateLanguage !== undefined || body.templateParams !== undefined) {
    const validation = validateTemplateDefinition({
      name: body.templateName,
      language: body.templateLanguage,
      params: body.templateParams,
    })
    if (!validation.ok) {
      return NextResponse.json({ error: 'Template is not valid', details: validation.errors }, { status: 422 })
    }
    data.templateName = validation.definition!.name
    data.templateLanguage = validation.definition!.language
    data.templateParams = validation.definition!.params
  }

  // NOTE: there is intentionally no `status` branch. Status changes happen
  // only through the lifecycle endpoints (schedule / cancel) and the cron
  // processor, all of which enforce the state machine.
  const broadcast = await prisma.whatsAppBroadcast.update({ where: { id: body.id }, data })

  return NextResponse.json({ broadcast })
}
