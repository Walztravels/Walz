import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { updateQuoteTotals } from '@/lib/quotes/update-totals'

/**
 * V1.3 — Edit Pricing (PATCH) and Remove (DELETE) for a single attached
 * quote item. Previously, once a live-search item was attached via
 * /api/admin/travel-search/add-to-quote, it was permanently read-only — a
 * known V1.1/V1.2 limitation this closes.
 *
 * Both handlers below:
 *  - require `quotes.edit` (the semantically correct permission for
 *    modifying an existing quote — add-to-quote itself uses `quotes.create`
 *    for the ADD action, which is a different action from editing/removing
 *    an item already on the quote);
 *  - re-verify conversationId -> VERIFIED/LINKED identity for Inbox-
 *    originated quotes, identical to add-to-quote's own check — removing or
 *    repricing an item on a client's quote is exactly the kind of
 *    commercial mutation that invariant exists for;
 *  - scope every lookup by BOTH `itemId` AND `quoteId` together
 *    (`findFirst({ where: { id: itemId, quoteId: params.id } })`), never a
 *    bare `findUnique({ where: { id: itemId } })` — prevents one quote's
 *    item id from being used to mutate a different quote;
 *  - block entirely once the quote is no longer `draft` — stricter than
 *    add-to-quote's own `converted|archived|cancelled`-only gate, since
 *    silently removing or repricing an item on a quote the client has
 *    already been sent is exactly the "must never silently change"
 *    failure the currency-integrity guard was built to prevent for
 *    currency; the same principle applies here. Once a quote is no longer
 *    draft, the correct path for a commercial change is Create Revision.
 */

function bigintToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') return Number(obj)
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(bigintToNumber)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, bigintToNumber(v)])
    )
  }
  return obj
}

async function loadItemAndQuote(quoteId: string, itemId: string) {
  const item = await prisma.quoteItem.findFirst({ where: { id: itemId, quoteId } })
  if (!item) return null
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
  if (!quote) return null
  return { item, quote }
}

async function authorize(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasPermission(session, 'quotes.edit')) {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, session }
}

async function checkIdentityAndDraftStatus(quote: { conversationId: number | null; status: string }, session: Parameters<typeof resolveClientActionContext>[1]) {
  if (quote.conversationId != null) {
    const resolved = await resolveClientActionContext(quote.conversationId, session)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
    }
    if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
      return NextResponse.json(
        { error: 'Verify the client identity before modifying items on this quote.', code: 'CLIENT_IDENTITY_REQUIRED' },
        { status: 403 },
      )
    }
  }
  if (quote.status !== 'draft') {
    return NextResponse.json(
      {
        error: 'Only draft quotes can have items removed or repriced. Create a new revision to change a quote that has already been shared.',
        code: 'QUOTE_NOT_DRAFT',
      },
      { status: 409 },
    )
  }
  return null
}

// DELETE /api/admin/quotes/[id]/items/[itemId] — Remove
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.res

  const loaded = await loadItemAndQuote(params.id, params.itemId)
  if (!loaded) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  const { item, quote } = loaded

  const gate = await checkIdentityAndDraftStatus(quote, auth.session)
  if (gate) return gate

  try {
    if (item.flightOptionId) {
      // Cascade (onDelete: Cascade from QuoteFlightOption -> QuoteItem)
      // removes the paired QuoteItem row automatically.
      await prisma.quoteFlightOption.delete({ where: { id: item.flightOptionId } })
    } else if (item.hotelOptionId) {
      await prisma.quoteHotelOption.delete({ where: { id: item.hotelOptionId } })
    } else if (item.type === 'flight' && item.supplierRef) {
      // Legacy item, created before flightOptionId existed — fall back to
      // the same (quoteId, duffelOfferId) correlation add-to-quote used to
      // write both rows together, so an orphaned option row is never left
      // behind for pre-migration data.
      const legacyOption = await prisma.quoteFlightOption.findFirst({
        where: { quoteId: item.quoteId, duffelOfferId: item.supplierRef },
      })
      if (legacyOption) await prisma.quoteFlightOption.delete({ where: { id: legacyOption.id } })
      else await prisma.quoteItem.delete({ where: { id: item.id } })
    } else if (item.type === 'hotel' && item.supplierRef) {
      const legacyOption = await prisma.quoteHotelOption.findFirst({
        where: { quoteId: item.quoteId, supplierRef: item.supplierRef },
      })
      if (legacyOption) await prisma.quoteHotelOption.delete({ where: { id: legacyOption.id } })
      else await prisma.quoteItem.delete({ where: { id: item.id } })
    } else {
      await prisma.quoteItem.delete({ where: { id: item.id } })
    }
  } catch (err: unknown) {
    // P2025 = "record to delete does not exist" — a double-click/race lost
    // to a concurrent delete of the same item. Idempotent: treat as already
    // gone, not an error, and never call updateQuoteTotals for a write that
    // didn't happen.
    const code = (err as { code?: string } | null)?.code
    if (code === 'P2025') return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    throw err
  }

  await updateQuoteTotals(quote.id)

  await prisma.quoteActivity.create({
    data: {
      quoteId: quote.id, actor: auth.session.email, actorType: 'staff',
      eventType: 'item_removed',
      detail: `Removed ${item.type} item: ${item.title}`,
    },
  })

  return NextResponse.json({ ok: true })
}

// PATCH /api/admin/quotes/[id]/items/[itemId] — Edit Pricing
// Body: { markupMinor?: number, serviceFeeMinor?: number } only. Never
// accepts cost/offer fields — cost is supplier-owned and only ever moves
// via a fresh, revalidated add-to-quote/Replace. No supplier revalidation
// runs here: markup/service fee are purely internal Walz figures with no
// supplier-side expiry to re-check, unlike a fresh attach.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.res

  const loaded = await loadItemAndQuote(params.id, params.itemId)
  if (!loaded) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  const { item, quote } = loaded

  const gate = await checkIdentityAndDraftStatus(quote, auth.session)
  if (gate) return gate

  const body = await req.json()
  if (body.markupMinor === undefined && body.serviceFeeMinor === undefined) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }
  const nextMarkupMinor = body.markupMinor !== undefined ? Math.round(Number(body.markupMinor)) : Number(item.markupMinor)
  const nextServiceFeeMinor = body.serviceFeeMinor !== undefined ? Math.round(Number(body.serviceFeeMinor)) : Number(item.serviceFeeMinor)
  if (!Number.isFinite(nextMarkupMinor) || !Number.isFinite(nextServiceFeeMinor) || nextMarkupMinor < 0 || nextServiceFeeMinor < 0) {
    return NextResponse.json({ error: 'markupMinor and serviceFeeMinor must be non-negative numbers.' }, { status: 400 })
  }

  const costMinor = Number(item.costMinor)
  const nextSellingPriceMinor = costMinor + nextMarkupMinor + nextServiceFeeMinor

  const updatedItem = await prisma.quoteItem.update({
    where: { id: item.id },
    data: {
      markupMinor: BigInt(nextMarkupMinor),
      serviceFeeMinor: BigInt(nextServiceFeeMinor),
      sellingPriceMinor: BigInt(nextSellingPriceMinor),
    },
  })

  // Keep the paired option row (if any) in sync — same dual-write-symmetry
  // requirement as REMOVE, so the option card and the price line never
  // disagree. Falls back to the legacy (quoteId, supplierRef) correlation
  // for items created before flightOptionId/hotelOptionId existed.
  if (item.flightOptionId) {
    await prisma.quoteFlightOption.update({
      where: { id: item.flightOptionId },
      data: { markupMinor: BigInt(nextMarkupMinor), serviceFeeMinor: BigInt(nextServiceFeeMinor), sellingPriceMinor: BigInt(nextSellingPriceMinor) },
    })
  } else if (item.hotelOptionId) {
    await prisma.quoteHotelOption.update({
      where: { id: item.hotelOptionId },
      data: { markupMinor: BigInt(nextMarkupMinor), serviceFeeMinor: BigInt(nextServiceFeeMinor), sellingPriceMinor: BigInt(nextSellingPriceMinor) },
    })
  } else if (item.type === 'flight' && item.supplierRef) {
    const legacyOption = await prisma.quoteFlightOption.findFirst({ where: { quoteId: item.quoteId, duffelOfferId: item.supplierRef } })
    if (legacyOption) {
      await prisma.quoteFlightOption.update({
        where: { id: legacyOption.id },
        data: { markupMinor: BigInt(nextMarkupMinor), serviceFeeMinor: BigInt(nextServiceFeeMinor), sellingPriceMinor: BigInt(nextSellingPriceMinor) },
      })
    }
  } else if (item.type === 'hotel' && item.supplierRef) {
    const legacyOption = await prisma.quoteHotelOption.findFirst({ where: { quoteId: item.quoteId, supplierRef: item.supplierRef } })
    if (legacyOption) {
      await prisma.quoteHotelOption.update({
        where: { id: legacyOption.id },
        data: { markupMinor: BigInt(nextMarkupMinor), serviceFeeMinor: BigInt(nextServiceFeeMinor), sellingPriceMinor: BigInt(nextSellingPriceMinor) },
      })
    }
  }

  await updateQuoteTotals(quote.id)

  await prisma.quoteActivity.create({
    data: {
      quoteId: quote.id, actor: auth.session.email, actorType: 'staff',
      eventType: 'item_repriced',
      detail: `Repriced ${item.type} item: ${item.title}`,
    },
  })

  return NextResponse.json({ item: bigintToNumber(updatedItem) })
}
