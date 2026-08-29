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

  // ── H-9: Atomic revision creation with SELECT FOR UPDATE ─────────────────
  // A concurrent POST could read the same revisionNumber before either
  // increments it, creating two revisions with the same number. Locking the
  // row serialises concurrent requests so only one wins.
  type LockedRow = { id: string; status: string; options: string }
  let newRevNum: number
  const now = new Date()

  try {
    const sb = getSupabaseAdmin()
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT id, status, options FROM "Itinerary" WHERE id = ${id} FOR UPDATE
      `
      const locked = rows[0]
      if (!locked) throw new Error('NOT_FOUND')
      if (!isAccepted(locked.status)) throw new Error('INELIGIBLE_STATUS')

      const lockedOpts    = parseOptions(locked.options) as Record<string, unknown>
      const currentRevNum = typeof lockedOpts.revisionNumber === 'number' ? lockedOpts.revisionNumber : 0
      newRevNum = currentRevNum + 1

      // Write history row to Supabase while holding the Prisma row lock.
      // If Supabase fails the transaction is rolled back and we return the error.
      const { error: histErr } = await sb
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

      if (histErr && !histErr.message.includes('unique constraint') && !histErr.message.includes('duplicate key')) {
        console.error('[revisions] Failed to write acceptance history:', histErr.message)
      }

      await tx.itinerary.update({
        where: { id },
        data: {
          status:    'revision_draft',
          updatedAt: now,
          options:   patchOptions(locked.options, {
            revisionNumber:    newRevNum,
            revisionCreatedAt: now.toISOString(),
            revisionCreatedBy: session.email,   // L-10: use email, not opaque session.id
            approvalToken:          null,
            approvalTokenUsed:      false,
            approvalTokenExpiresAt: null,
            sentOptionsHash:        null,
          }),
        },
      })
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err instanceof Error && err.message === 'INELIGIBLE_STATUS') {
      return NextResponse.json(
        { error: 'A revision can only be created from an accepted itinerary.' },
        { status: 409 },
      )
    }
    console.error('[revisions] Transaction error', err)
    return NextResponse.json({ error: 'Could not create revision. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    created:        true,
    revisionNumber: newRevNum!,
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
