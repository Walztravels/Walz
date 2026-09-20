import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { resolveClientActionContext } from '@/lib/inbox/client-context'

export const dynamic = 'force-dynamic'

/**
 * Team Hub "Ask Team" — minimal, safe client-context card for a given
 * Inbox conversation.
 *
 * Authorization is NOT reimplemented here: resolveClientActionContext
 * (lib/inbox/client-context.ts) already runs the real, unmodified
 * checkInboxPermission('inbox_view') + checkConversationAccess gate before
 * touching any identity data, and this route calls it directly rather than
 * duplicating that logic — mirrors the existing V1.4 jade-assist route's
 * "gate first, resolve after" convention (app/api/admin/inbox/
 * conversations/[id]/jade-assist/route.ts).
 *
 * RELEASE-BLOCKING RULE: Team Hub conversation membership is NEVER treated
 * as equivalent to Inbox authorization. This route has no knowledge of
 * Team Hub at all — it only knows the caller's AdminSession and the target
 * Inbox conversation id — so a staff member who is a Team Hub conversation
 * member but lacks real Inbox access is denied here exactly like any other
 * Inbox route (see __tests__/team-inbox-authz-boundary.test.ts).
 *
 * Response contract:
 *   - `{ available: false }` unless identity resolution is EXACTLY LINKED
 *     or VERIFIED (never HEURISTIC or UNRESOLVED — a guess is not an
 *     established identity, see lib/inbox/client-context.ts's own
 *     resolution contract).
 *   - `{ available: true, clientDisplayName, area, conversationId,
 *       identityResolution }` — and NOTHING else. Never the full
 *     transcript, passport/bank/card data, documents, risk scores,
 *     supplier cost/margin, or unrelated history. `area` is a coarse
 *     department/route-shaped label derived from the already-sanitized
 *     `application.applicationType` (itself already coarse — see
 *     lib/inbox/client-context.ts's safeStatusLabel usage) — never the
 *     full itinerary (no dates, flight numbers, or price ever appear here).
 */

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function deriveArea(applicationType: string | null | undefined): string | null {
  return applicationType && applicationType.trim() ? applicationType.trim() : null
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })

  // resolveClientActionContext re-checks inbox_view + checkConversationAccess
  // internally (defense in depth, cached) — a denial there propagates
  // untouched, exactly as if this route had checked it directly.
  const result = await resolveClientActionContext(convId, session)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const { context } = result
  if (context.resolution !== 'LINKED' && context.resolution !== 'VERIFIED') {
    return NextResponse.json({ available: false })
  }

  const clientDisplayName =
    context.user?.name
    ?? context.clientAccount?.name
    ?? context.prismaLead?.name
    ?? context.supabaseLead?.name
    ?? context.contact?.name
    ?? null

  return NextResponse.json({
    available: true,
    clientDisplayName,
    area: deriveArea(context.application?.applicationType),
    conversationId: context.conversationId,
    identityResolution: context.resolution,
  })
}
