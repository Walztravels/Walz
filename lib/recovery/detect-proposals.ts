// Proposal recovery detection (Release 3B)
//
// Detects Quotes that have been sent but not converted, paid, or declined
// after a configurable delay. Creates UNPAID_PROPOSAL RecoveryOpportunity.
// Idempotent: dedupeKey = "UNPAID_PROPOSAL:<quoteId>"

import prisma                   from '@/lib/db'
import { createOrUpdateOpportunity } from './opportunity'

const PROPOSAL_DETECT_DELAY_HOURS = parseInt(
  process.env.PROPOSAL_DETECT_DELAY_HOURS ?? '2', 10
)

function priorityFromQuote(viewCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (viewCount >= 4) return 'HIGH'
  if (viewCount >= 1) return 'MEDIUM'
  return 'LOW'
}

// Lookup staff ID from Quote.createdBy (email) or Quote.assignedTo (name).
// Returns null if no match — opportunity goes to general queue.
async function resolveQuoteStaff(
  createdBy: string,
  assignedTo: string | null
): Promise<string | null> {
  // Try createdBy as email first (most reliable)
  const byEmail = await prisma.staff.findFirst({
    where:  { email: createdBy, isActive: true },
    select: { id: true },
  })
  if (byEmail) return byEmail.id

  // Fallback: assignedTo as name
  if (assignedTo) {
    const byName = await prisma.staff.findFirst({
      where:  { name: assignedTo, isActive: true },
      select: { id: true },
    })
    if (byName) return byName.id
  }

  return null
}

export async function detectUnpaidProposals(): Promise<number> {
  if (process.env.RECOVERY_ENGINE_ENABLED !== 'true') return 0

  const threshold = new Date(
    Date.now() - PROPOSAL_DETECT_DELAY_HOURS * 60 * 60 * 1000
  )

  // Find active, sent, unresolved proposals past the detection delay
  const quotes = await prisma.quote.findMany({
    where: {
      sentAt:      { not: null, lte: threshold },
      convertedAt: null,
      declinedAt:  null,
      acceptedAt:  null,
      status:      { in: ['sent', 'viewed'] },
      validUntil:  { gte: new Date() },  // not yet expired
    },
    select: {
      id:         true,
      reference:  true,
      clientName: true,
      clientEmail: true,
      currency:   true,
      totalMinor: true,
      viewCount:  true,
      sentAt:     true,
      lastViewedAt: true,
      createdBy:  true,
      assignedTo: true,
    },
    take: 500,
  })

  let created = 0

  for (const quote of quotes) {
    try {
      const amountInMajor = Number(quote.totalMinor) / 100
      const priority      = priorityFromQuote(quote.viewCount)
      const assignedToId  = await resolveQuoteStaff(quote.createdBy, quote.assignedTo)

      const viewSuffix = quote.viewCount > 0
        ? ` — viewed ${quote.viewCount} time${quote.viewCount === 1 ? '' : 's'}`
        : ' — not yet opened'

      await createOrUpdateOpportunity({
        type:        'UNPAID_PROPOSAL',
        reason:      `Proposal ${quote.reference} sent to ${quote.clientName}${viewSuffix}`,
        priority,
        amount:      amountInMajor > 0 ? amountInMajor : undefined,
        currency:    quote.currency,
        quoteId:     quote.id,
        assignedToId,
      })
      created++
    } catch (err) {
      console.warn('[ProposalDetect] failed for quote', quote.id, (err as Error).message)
    }
  }

  return created
}
