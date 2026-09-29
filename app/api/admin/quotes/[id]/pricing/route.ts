import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { calculateProposalPricing } from '@/lib/pricing/proposal-pricing'
import { resolveClientActionContext } from '@/lib/inbox/client-context'

export const dynamic = 'force-dynamic'

/**
 * SECURITY FIX (UX-4.2 closure review): this route previously had NO
 * permission check at all — any authenticated staff session, regardless of
 * role, could PATCH any quote's markup/serviceCharge/discount/total. It also
 * had no conversation-identity re-check (unlike every sibling mutation route
 * — items/[itemId], recalculate-currency, add-to-quote), no draft-status
 * gate, and no QuoteActivity audit entry. Fixed to match the exact pattern
 * already established by app/api/admin/quotes/[id]/items/[itemId]/route.ts:
 *  - requires `quotes.manage_pricing` (the permission already existed in the
 *    enum, unused — see lib/admin/permissions.ts);
 *  - re-verifies conversationId -> VERIFIED/LINKED identity for Inbox-
 *    originated quotes;
 *  - blocks once the quote is no longer `draft` (same principle as the
 *    currency-integrity guard: a quote the client has already been sent
 *    must never silently change price underneath them — Create Revision is
 *    the correct path once shared);
 *  - writes a QuoteActivity audit row.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.manage_pricing')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { items: { select: { sellingPriceMinor: true } } },
  })
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (quote.conversationId != null) {
    const resolved = await resolveClientActionContext(quote.conversationId, session)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
    }
    if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
      return NextResponse.json(
        { error: 'Verify the client identity before changing pricing on this quote.', code: 'CLIENT_IDENTITY_REQUIRED' },
        { status: 403 },
      )
    }
  }
  if (quote.status !== 'draft') {
    return NextResponse.json(
      {
        error: 'Only draft quotes can have their pricing changed. Create a new revision to change a quote that has already been shared.',
        code: 'QUOTE_NOT_DRAFT',
      },
      { status: 409 },
    )
  }

  const { markupMinor = 0, serviceChargeMinor = 0, discountMinor = 0 } = await req.json()

  const subtotalMinor = quote.items.reduce((s, i) => s + i.sellingPriceMinor, BigInt(0))
  const result = calculateProposalPricing({
    subtotalMinor,
    markupMinor:        BigInt(Math.round(Number(markupMinor))),
    serviceChargeMinor: BigInt(Math.round(Number(serviceChargeMinor))),
    discountMinor:      BigInt(Math.round(Number(discountMinor))),
  })

  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: {
      markupMinor:        result.markupMinor,
      serviceChargeMinor: result.serviceChargeMinor,
      discountMinor:      result.discountMinor,
      subtotalMinor:      result.subtotalMinor,
      totalMinor:         result.totalMinor,
    } as Parameters<typeof prisma.quote.update>[0]['data'],
  })

  await prisma.quoteActivity.create({
    data: {
      quoteId: quote.id, actor: session.email, actorType: 'staff',
      eventType: 'pricing_updated',
      detail: `markup=${result.markupMinor} serviceCharge=${result.serviceChargeMinor} discount=${result.discountMinor}`,
    },
  })

  return NextResponse.json({
    subtotalMinor:      Number(updated.subtotalMinor),
    markupMinor:        Number((updated as any).markupMinor ?? 0),
    serviceChargeMinor: Number((updated as any).serviceChargeMinor ?? 0),
    discountMinor:      Number((updated as any).discountMinor ?? 0),
    totalMinor:         Number(updated.totalMinor),
  })
}
