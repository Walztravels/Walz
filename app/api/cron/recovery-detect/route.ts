// Recovery detection cron (Release 3A + 3B)
//
// Detects: abandoned carts, supplier failures, incomplete trips,
//          unpaid proposals, hot leads.
// Failed payments are detected reactively in the Stripe webhook (provider-authoritative).
//
// Schedule: every 30 minutes (see vercel.json).
// Guard: RECOVERY_ENGINE_ENABLED=true must be set in environment.

import { NextResponse } from 'next/server'
import { detectAbandonedCarts, detectSupplierFailures, detectIncompleteTrips } from '@/lib/recovery/detect'
import { detectUnpaidProposals }        from '@/lib/recovery/detect-proposals'
import { detectHotLeads }               from '@/lib/recovery/detect-leads'
import { runScheduledRecoveryContacts } from '@/lib/recovery/schedule'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.RECOVERY_ENGINE_ENABLED !== 'true') {
    return NextResponse.json({ skipped: true, reason: 'RECOVERY_ENGINE_ENABLED not set' })
  }

  // Detection runs first, then scheduled contacts (so newly detected opps get
  // their nextActionAt set before the scheduler looks for due contacts)
  const [carts, suppliers, trips, proposals, hotLeads] = await Promise.allSettled([
    detectAbandonedCarts(),
    detectSupplierFailures(),
    detectIncompleteTrips(),
    detectUnpaidProposals(),
    detectHotLeads(),
  ])

  // Run scheduled customer contacts (email/WhatsApp for due opportunities)
  let scheduled: number | { error: string } = 0
  try {
    scheduled = await runScheduledRecoveryContacts()
  } catch (err) {
    scheduled = { error: String(err) }
  }

  function unwrap(r: PromiseSettledResult<number>) {
    return r.status === 'fulfilled' ? r.value : { error: String((r as PromiseRejectedResult).reason) }
  }

  return NextResponse.json({
    ok: true,
    results: {
      abandonedCarts:     unwrap(carts),
      supplierFailures:   unwrap(suppliers),
      incompleteTrips:    unwrap(trips),
      unpaidProposals:    unwrap(proposals),
      hotLeads:           unwrap(hotLeads),
      scheduledContacts:  scheduled,
    },
  })
}
