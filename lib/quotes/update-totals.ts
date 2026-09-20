/**
 * V1.3 — updateQuoteTotals, extracted from
 * app/api/admin/travel-search/add-to-quote/route.ts so it is one shared
 * implementation rather than being duplicated into the new Remove/
 * Edit-pricing/Recalculate-currency routes.
 *
 * Accepts an optional Prisma client, defaulting to the module-level
 * singleton — pass a `tx` (the callback argument from `prisma.$transaction
 * (async (tx) => {...})`) to run this as part of a larger atomic operation
 * (e.g. Remove-then-recompute, or the multi-item Recalculate-currency
 * transaction) instead of as an independent, separately-committed write.
 */
import prisma from '@/lib/db'
import type { Prisma, PrismaClient } from '@prisma/client'
import { calculateProposalPricing } from '@/lib/pricing/proposal-pricing'

export type QuoteDbClient = PrismaClient | Prisma.TransactionClient

export async function updateQuoteTotals(quoteId: string, db: QuoteDbClient = prisma): Promise<void> {
  const [items, quote] = await Promise.all([
    db.quoteItem.findMany({ where: { quoteId } }),
    db.quote.findUnique({
      where: { id: quoteId },
      select: { markupMinor: true, serviceChargeMinor: true, discountMinor: true },
    }),
  ])
  if (!quote) return

  const subtotalMinor = items.reduce((sum, item) => sum + item.sellingPriceMinor, BigInt(0))
  const result = calculateProposalPricing({
    subtotalMinor,
    // Defensive fallback preserved from the original implementation — a
    // test-mocked or partially-selected quote object can come back without
    // these fields; BigInt(0) is the correct neutral default either way.
    markupMinor: quote.markupMinor ?? BigInt(0),
    serviceChargeMinor: quote.serviceChargeMinor ?? BigInt(0),
    discountMinor: quote.discountMinor ?? BigInt(0),
  })

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotalMinor: result.subtotalMinor,
      totalMinor: result.totalMinor,
    },
  })
}
