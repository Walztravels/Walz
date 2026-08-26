// Reconciliation cron: runs every 5 minutes via Vercel Cron.
// Handles bookings in RECONCILIATION_REQUIRED and stale SUPPLIER_CONFIRMING.
//
// Strategy:
//   1. Find stale SUPPLIER_CONFIRMING (>10 min old) → move to RECONCILIATION_REQUIRED
//   2. Find RECONCILIATION_REQUIRED within the 2-hour window → query Viator
//   3. Update status based on Viator response
//
// Idempotent: safe to run multiple times for the same booking.

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

import { NextRequest, NextResponse }   from 'next/server'
import { prisma }                      from '@/lib/db'
import { reconcileViatorBooking }      from '@/lib/activities/booking'

const STALE_CONFIRMING_MS  = 10 * 60 * 1000  // 10 min
const MAX_RECONCILE_WINDOW = 2 * 60 * 60 * 1000  // 2 hours

export async function GET(req: NextRequest) {
  // Vercel Cron sends Authorization: Bearer {CRON_SECRET}
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now          = new Date()
  const staleThresh  = new Date(now.getTime() - STALE_CONFIRMING_MS)
  const windowStart  = new Date(now.getTime() - MAX_RECONCILE_WINDOW)

  // ── 1. Move stale SUPPLIER_CONFIRMING → RECONCILIATION_REQUIRED ──────────
  const stale = await prisma.activityBooking.updateMany({
    where: {
      status:  'SUPPLIER_CONFIRMING',
      supplier: 'VIATOR',
      supplierConfirmingAt: { lt: staleThresh },
      supplierReference: null,  // not yet confirmed
    },
    data: {
      status:        'RECONCILIATION_REQUIRED',
      failureReason: 'TIMEOUT',
      notes:         'Moved from SUPPLIER_CONFIRMING after stale timeout',
    },
  })

  if (stale.count > 0) {
    console.info(`[ActivityReconciliation] Moved ${stale.count} stale SUPPLIER_CONFIRMING → RECONCILIATION_REQUIRED`)
  }

  // ── 2. Find RECONCILIATION_REQUIRED bookings within the window ────────────
  const pending = await prisma.activityBooking.findMany({
    where: {
      status:   'RECONCILIATION_REQUIRED',
      supplier: 'VIATOR',
      createdAt: { gte: windowStart },
    },
    select: { id: true, walzReference: true, reconciliationAttempts: true },
    orderBy: { createdAt: 'asc' },
    take: 20,  // process up to 20 per run
  })

  if (!pending.length) {
    return NextResponse.json({
      message:       'No bookings require reconciliation',
      staleResolved: stale.count,
    })
  }

  const results: Array<{ id: string; walzRef: string | null; outcome: string }> = []

  for (const booking of pending) {
    try {
      const outcome = await reconcileViatorBooking(booking.id)
      console.info(`[ActivityReconciliation] ${booking.walzReference} → ${outcome}`)
      results.push({ id: booking.id, walzRef: booking.walzReference, outcome })
    } catch (err) {
      console.error(`[ActivityReconciliation] Error for ${booking.id}:`, err instanceof Error ? err.message : err)
      results.push({ id: booking.id, walzRef: booking.walzReference, outcome: 'ERROR' })
    }
  }

  const confirmed       = results.filter(r => r.outcome === 'CONFIRMED').length
  const stillUnknown    = results.filter(r => r.outcome === 'STILL_UNKNOWN').length
  const manualRequired  = results.filter(r => r.outcome === 'MANUAL_REQUIRED').length
  const errors          = results.filter(r => r.outcome === 'ERROR').length

  return NextResponse.json({
    processed:       pending.length,
    staleResolved:   stale.count,
    confirmed,
    stillUnknown,
    manualRequired,
    errors,
    results,
  })
}
