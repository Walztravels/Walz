/**
 * GET  /api/admin/itineraries/[id]/revisions
 *   Returns the immutable acceptance history for this itinerary.
 *
 * POST /api/admin/itineraries/[id]/revisions
 *   Creates a new revision from an accepted itinerary.
 *   Captures the current accepted snapshot + content to acceptance history,
 *   then changes status to 'revision_draft'.
 *
 * DELETE /api/admin/itineraries/[id]/revisions
 *   Abandons the active revision draft, returning status to the last accepted state.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseOptions, patchOptions } from '@/lib/itinerary-options'
import { isAccepted, buildContentSnapshot } from '@/lib/v2/revision'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─── GET — list acceptance history ───────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({
    where:  { id },
    select: { id: true, referenceNumber: true, status: true, options: true },
  })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let history: unknown[] = []
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('itinerary_acceptance_history')
      .select('id, revision_number, version, proposal_hash, accepted_at, accepted_by, accepted_total, currency, created_at')
      .eq('itinerary_id', id)
      .order('revision_number', { ascending: true })

    if (!error && data) {
      history = data.map(row => ({
        id:             row.id,
        revisionNumber: row.revision_number,
        version:        row.version,
        proposalHash:   row.proposal_hash,
        acceptedAt:     row.accepted_at,
        acceptedBy:     row.accepted_by,
        acceptedTotal:  row.accepted_total != null ? Number(row.accepted_total) : null,
        currency:       row.currency,
        createdAt:      row.created_at,
      }))
    }
  } catch { /* Supabase may not be configured — return empty */ }

  const parsedOptions  = parseOptions(itin.options) as Record<string, unknown>
  const revisionNumber = parsedOptions.revisionNumber as number | undefined

  return NextResponse.json({
    itineraryId:    id,
    referenceNumber: itin.referenceNumber,
    status:         itin.status,
    revisionNumber: revisionNumber ?? 0,
    history,
  })
}

// ─── POST — create revision ───────────────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!isAccepted(itin.status)) {
    return NextResponse.json(
      { error: `A revision can only be created from an accepted itinerary. Current status: ${itin.status}` },
      { status: 409 },
    )
  }

  if (!itin.selectedOption) {
    return NextResponse.json(
      { error: 'No acceptance snapshot found — cannot create revision.' },
      { status: 409 },
    )
  }

  let existingSnapshot: Record<string, unknown>
  try {
    existingSnapshot = JSON.parse(itin.selectedOption) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'Acceptance snapshot is malformed — cannot create revision.' },
      { status: 500 },
    )
  }

  const opts           = parseOptions(itin.options) as Record<string, unknown>
  const currentRevNum  = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 0
  const newRevNum      = currentRevNum + 1

  // ── Write original accepted state to history ──────────────────────────────
  const contentSnap = buildContentSnapshot({
    flights:    itin.flights,
    hotels:     itin.hotels,
    days:       itin.days,
    inclusions: itin.inclusions,
    exclusions: itin.exclusions,
    totalPrice: itin.totalPrice,
  })

  const snapshotVersion    = (existingSnapshot.version as number | undefined) ?? 1
  const snapshotAcceptedAt = (existingSnapshot.acceptedAt as string | undefined) ?? new Date().toISOString()
  const snapshotAcceptedBy = (existingSnapshot.acceptedBy as string | undefined) ?? 'unknown'
  const snapshotHash       = (existingSnapshot.proposalHash as string | null | undefined) ?? null
  const snapshotTotal      = (existingSnapshot.acceptedTotal as number | null | undefined) ?? null
  const snapshotCurrency   = (existingSnapshot.currency as string | undefined) ?? itin.currency

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb
      .from('itinerary_acceptance_history')
      .insert({
        itinerary_id:     id,
        revision_number:  currentRevNum,
        version:          snapshotVersion,
        snapshot:         existingSnapshot,
        content_snapshot: contentSnap,
        proposal_hash:    snapshotHash,
        accepted_at:      snapshotAcceptedAt,
        accepted_by:      snapshotAcceptedBy,
        accepted_total:   snapshotTotal,
        currency:         snapshotCurrency,
      })
      .select('id')
      .single()

    if (error && !error.message.includes('unique constraint') && !error.message.includes('duplicate key')) {
      console.error('[revisions] Failed to write acceptance history:', error.message)
    }
  } catch (err) {
    console.error('[revisions] Supabase error writing acceptance history:', err)
  }

  // ── Update itinerary to revision_draft ────────────────────────────────────
  const now = new Date()
  await prisma.itinerary.update({
    where: { id },
    data: {
      status:    'revision_draft',
      updatedAt: now,
      options:   patchOptions(itin.options, {
        revisionNumber:    newRevNum,
        revisionCreatedAt: now.toISOString(),
        revisionCreatedBy: session.id,
        // Clear any previous revision approval token so a fresh one is issued on send
        approvalToken:          null,
        approvalTokenUsed:      false,
        approvalTokenExpiresAt: null,
        sentOptionsHash:        null,
      }),
    },
  })

  return NextResponse.json({
    created:        true,
    revisionNumber: newRevNum,
    status:         'revision_draft',
  }, { status: 201 })
}

// ─── DELETE — abandon revision draft ─────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (itin.status !== 'revision_draft') {
    return NextResponse.json(
      { error: `Only a revision_draft can be abandoned. Current status: ${itin.status}` },
      { status: 409 },
    )
  }

  const opts       = parseOptions(itin.options) as Record<string, unknown>
  const revNum     = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 1
  const prevRevNum = revNum - 1

  // Determine what the previous accepted status was
  // If prevRevNum === 0, it was the original 'approved'; otherwise 'revision_accepted'
  const revertStatus = prevRevNum === 0 ? 'approved' : 'revision_accepted'

  await prisma.itinerary.update({
    where: { id },
    data: {
      status:    revertStatus,
      updatedAt: new Date(),
      options:   patchOptions(itin.options, {
        revisionNumber:    prevRevNum,
        revisionCreatedAt: null,
        revisionCreatedBy: null,
        approvalToken:          null,
        approvalTokenUsed:      false,
        approvalTokenExpiresAt: null,
        sentOptionsHash:        null,
      }),
    },
  })

  return NextResponse.json({ abandoned: true, revertedTo: revertStatus })
}
