import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { convertSupplierAmount, convertMinorUnitAmount } from '@/lib/pricing/fx-convert'
import { updateQuoteTotals } from '@/lib/quotes/update-totals'

function bigintToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') return Number(obj)
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(bigintToNumber)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, bigintToNumber(v)]))
  }
  return obj
}

// Kept in sync by hand with app/admin/inbox/components/quote-builder/
// useQuoteBuilderState.ts's CURRENCIES — duplicated rather than imported
// since that file is a client hook ('use client') and this is a server
// route; both must be updated together when a new currency is added.
const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'NGN']

interface ConvertibleRow {
  id: string
  costMinor: bigint
  markupMinor: bigint
  serviceFeeMinor: bigint
  currency: string
  supplierCostMinor: bigint | null
  supplierCurrency: string | null
}

interface PlannedUpdate {
  costMinor: bigint
  markupMinor: bigint
  serviceFeeMinor: bigint
  sellingPriceMinor: bigint
  currency: string
  supplierCostMinor: bigint
  supplierCurrency: string
  fxRate: string
  fxRateAt: Date
  fxSource: string
}

/**
 * Converts one row for the recalculation. Source of truth is the ORIGINAL
 * supplier amount/currency when known (supplierCostMinor/supplierCurrency —
 * never re-derive from the currently-stored, possibly-already-converted
 * costMinor, which would compound rounding error and drift from the true
 * supplier cost). When an item has never been through FX conversion before
 * (supplierCostMinor/supplierCurrency both null — a manual item, or a
 * live-search item attached back when its supplier currency already
 * matched the quote's currency), its own current costMinor/currency IS the
 * only known true amount, so that becomes the conversion source instead —
 * this is not "re-deriving from an already-converted figure," since no
 * conversion happened yet.
 */
async function planRowConversion(row: ConvertibleRow, targetCurrency: string): Promise<PlannedUpdate | { error: string; code: string }> {
  const sourceCostMinor = row.supplierCostMinor !== null ? Number(row.supplierCostMinor) : Number(row.costMinor)
  const sourceCurrency = row.supplierCurrency ?? row.currency

  if (sourceCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
    // Already in the target currency — nothing to convert, but still
    // normalize the stored currency casing and leave FX fields untouched
    // (no conversion occurred for this row).
    return {
      costMinor: BigInt(sourceCostMinor),
      markupMinor: row.markupMinor,
      serviceFeeMinor: row.serviceFeeMinor,
      sellingPriceMinor: BigInt(sourceCostMinor) + row.markupMinor + row.serviceFeeMinor,
      currency: targetCurrency,
      supplierCostMinor: row.supplierCostMinor ?? BigInt(sourceCostMinor),
      supplierCurrency: row.supplierCurrency ?? sourceCurrency,
      fxRate: '1',
      fxRateAt: new Date(),
      fxSource: 'identity',
    }
  }

  const converted = await convertSupplierAmount({
    supplierAmountMinor: sourceCostMinor, supplierCurrency: sourceCurrency, targetCurrency,
  })
  if (!converted.ok) return { error: converted.message, code: converted.code }

  const markupMinor = BigInt(convertMinorUnitAmount(Number(row.markupMinor), converted.rate, targetCurrency))
  const serviceFeeMinor = BigInt(convertMinorUnitAmount(Number(row.serviceFeeMinor), converted.rate, targetCurrency))
  const costMinor = BigInt(converted.convertedAmountMinor)
  return {
    costMinor, markupMinor, serviceFeeMinor,
    sellingPriceMinor: costMinor + markupMinor + serviceFeeMinor,
    currency: targetCurrency,
    supplierCostMinor: BigInt(sourceCostMinor), supplierCurrency: sourceCurrency,
    fxRate: converted.rate, fxRateAt: new Date(converted.rateTimestamp), fxSource: converted.source,
  }
}

// POST /api/admin/quotes/[id]/recalculate-currency
// { targetCurrency: string }
//
// The SANCTIONED exception to the currency-integrity guard on the generic
// PATCH /api/admin/quotes/[id] route (which blocks any Quote.currency
// change once the quote has priced items) — this endpoint IS the safe path
// for that exact scenario: converting every existing item's pricing
// atomically, server-side, rather than relabeling the parent row alone.
// Draft-only (once a quote is no longer draft, the correct path for any
// commercial change — including currency — is Create Revision).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const targetCurrency = String(body.targetCurrency ?? '').toUpperCase()
  if (!SUPPORTED_CURRENCIES.includes(targetCurrency)) {
    return NextResponse.json({ error: `Unsupported currency: ${body.targetCurrency}`, code: 'UNSUPPORTED_CURRENCY' }, { status: 400 })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { items: true, flightOptions: true, hotelOptions: true },
  })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  if (quote.conversationId != null) {
    const resolved = await resolveClientActionContext(quote.conversationId, session)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
    }
    if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
      return NextResponse.json(
        { error: 'Verify the client identity before recalculating this quote\'s currency.', code: 'CLIENT_IDENTITY_REQUIRED' },
        { status: 403 },
      )
    }
  }

  if (quote.status !== 'draft') {
    return NextResponse.json(
      { error: 'Only draft quotes can be recalculated into a new currency. Create a new revision to change a quote that has already been shared.', code: 'QUOTE_NOT_DRAFT' },
      { status: 409 },
    )
  }

  if (quote.currency.toUpperCase() === targetCurrency) {
    return NextResponse.json({ error: 'Quote already uses this currency.', code: 'NO_OP' }, { status: 400 })
  }

  // ── Phase 1: pre-flight — convert every row's pricing OUTSIDE any DB
  // transaction (a DB transaction cannot roll back an external FX call
  // anyway). If ANY row fails, abort the whole operation with zero writes.
  // Each plan is kept alongside the exact snapshot values it was computed
  // from, so Phase 2 can verify per-row that nothing changed underneath it
  // (see the security-review finding this closes: a concurrent Remove/Edit-
  // Pricing on the same item during a slow recalculation was previously
  // undetected — either crashing with an uncaught 500 on a deleted row, or
  // silently overwriting a concurrent reprice with the stale Phase-1 plan).
  const itemPlans = new Map<string, { plan: PlannedUpdate; snapshot: ConvertibleRow }>()
  const flightOptionPlans = new Map<string, { plan: PlannedUpdate; snapshot: ConvertibleRow }>()
  const hotelOptionPlans = new Map<string, { plan: PlannedUpdate; snapshot: ConvertibleRow }>()

  for (const item of quote.items) {
    const plan = await planRowConversion(item, targetCurrency)
    if ('error' in plan) return NextResponse.json({ error: plan.error, code: plan.code, itemId: item.id }, { status: 502 })
    itemPlans.set(item.id, { plan, snapshot: item })
  }
  for (const fo of quote.flightOptions) {
    const plan = await planRowConversion(fo, targetCurrency)
    if ('error' in plan) return NextResponse.json({ error: plan.error, code: plan.code, flightOptionId: fo.id }, { status: 502 })
    flightOptionPlans.set(fo.id, { plan, snapshot: fo })
  }
  for (const ho of quote.hotelOptions) {
    const plan = await planRowConversion(ho, targetCurrency)
    if ('error' in plan) return NextResponse.json({ error: plan.error, code: plan.code, hotelOptionId: ho.id }, { status: 502 })
    hotelOptionPlans.set(ho.id, { plan, snapshot: ho })
  }

  // Per-row optimistic precondition: an atomic updateMany scoped by id AND
  // every pre-conversion value the plan was computed from. count===0 means
  // some other request changed (or deleted) this exact row between the
  // Phase-1 read and now — abort the whole transaction rather than either
  // crashing (a delete) or silently applying a plan based on stale numbers
  // (a concurrent reprice).
  async function applyPlan(
    updateMany: (args: { where: Record<string, unknown>; data: PlannedUpdate }) => Promise<{ count: number }>,
    id: string, plan: PlannedUpdate, snapshot: ConvertibleRow, label: string,
  ) {
    const claim = await updateMany({
      where: {
        id,
        costMinor: snapshot.costMinor, markupMinor: snapshot.markupMinor, serviceFeeMinor: snapshot.serviceFeeMinor,
        currency: snapshot.currency, supplierCostMinor: snapshot.supplierCostMinor, supplierCurrency: snapshot.supplierCurrency,
      },
      data: plan,
    })
    if (claim.count === 0) {
      throw Object.assign(new Error(`${label} was changed by someone else during recalculation.`), { code: 'QUOTE_STALE' })
    }
  }

  // ── Phase 2: every conversion succeeded — apply all writes in one
  // transaction. An optimistic rowVersion precondition on the final Quote
  // update catches a concurrent edit that happened between the read above
  // and this write (a genuine race, not merely a slow request).
  let updatedItems: unknown[] = []
  try {
    await prisma.$transaction(async (tx) => {
      for (const [id, { plan, snapshot }] of itemPlans) {
        await applyPlan(tx.quoteItem.updateMany.bind(tx.quoteItem), id, plan, snapshot, 'An item')
      }
      for (const [id, { plan, snapshot }] of flightOptionPlans) {
        await applyPlan(tx.quoteFlightOption.updateMany.bind(tx.quoteFlightOption), id, plan, snapshot, 'A flight option')
      }
      for (const [id, { plan, snapshot }] of hotelOptionPlans) {
        await applyPlan(tx.quoteHotelOption.updateMany.bind(tx.quoteHotelOption), id, plan, snapshot, 'A hotel option')
      }

      const claim = await tx.quote.updateMany({
        where: { id: quote.id, rowVersion: quote.rowVersion },
        data: { currency: targetCurrency, rowVersion: { increment: 1 } },
      })
      if (claim.count === 0) {
        throw Object.assign(new Error('Quote was modified concurrently.'), { code: 'QUOTE_STALE' })
      }

      await updateQuoteTotals(quote.id, tx)

      await tx.quoteActivity.create({
        data: {
          quoteId: quote.id, actor: session.email, actorType: 'staff',
          eventType: 'currency_recalculated',
          detail: `Recalculated from ${quote.currency} to ${targetCurrency} (${itemPlans.size} item(s), ${flightOptionPlans.size} flight option(s), ${hotelOptionPlans.size} hotel option(s))`,
        },
      })

      // Returned in the response so the client can refresh its local
      // attachedLive state from these authoritative figures without a
      // separate follow-up fetch.
      updatedItems = await tx.quoteItem.findMany({ where: { quoteId: quote.id } })
    })
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code
    if (code === 'QUOTE_STALE') {
      return NextResponse.json(
        { error: 'This quote was changed by someone else while recalculating. Please refresh and try again.', code: 'QUOTE_STALE' },
        { status: 409 },
      )
    }
    throw err
  }

  return NextResponse.json({ ok: true, currency: targetCurrency, items: bigintToNumber(updatedItems) })
}
