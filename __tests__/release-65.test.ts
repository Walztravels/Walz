/**
 * Release 6.5 — Jade Portal Integration & Concierge Layer
 * Test suite covering security invariants, architecture rules, and API contracts.
 *
 * HARD RULES enforced:
 *   PAYMENT_RECEIVED ≠ CONFIRMED
 *   JADE ≠ SOURCE OF TRUTH
 *   PORTAL_CONTEXT ≠ UNRESTRICTED DB ACCESS
 *   TRAVELLER_CONTEXT ≠ PASSPORT_DATA
 *   CUSTOMER_RETAIL_DATA ≠ SUPPLIER_COMMERCIAL_DATA
 */

import fs   from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')

function src(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

// ─── Portal Jade Context ──────────────────────────────────────────────────────

describe('lib/portal/portal-jade-context.ts — PortalJadeContext safety', () => {
  const source = src('lib/portal/portal-jade-context.ts')

  it('PortalJadeContext interface has no passportNumber field', () => {
    // Extract the PortalJadeContext interface body
    const match = source.match(/interface PortalJadeContext\s*\{([^}]+)\}/)
    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).not.toContain('passportNumber')
  })

  it('PortalJadeContextTraveller has no passportNumber field', () => {
    const match = source.match(/interface PortalJadeContextTraveller\s*\{([^}]+)\}/)
    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).not.toContain('passportNumber')
  })

  it('buildPortalJadeContext selects passportNumber from vault but does NOT pass it to the context', () => {
    expect(source).toContain('passportNumber: true')   // reads it (to derive passportProvided bool)
    // Must not spread or assign raw passportNumber into the returned PortalJadeContext
    expect(source).not.toMatch(/passportNumber\s*:\s*vault\?\.passportNumber/)
    expect(source).not.toMatch(/passportNumber\s*:\s*vault\.passportNumber/)
  })

  it('serializePortalContextForPrompt exists as an exported function', () => {
    // The route wraps the serialized output in <portal_context> XML delimiters (tested in route tests)
    expect(source).toContain('export function serializePortalContextForPrompt')
  })

  it('buildPortalJadeContext does not select sensitive fields from Prisma', () => {
    // The context builder must not select these as Prisma fields to return to the model
    expect(source).not.toContain('fxMargin: true')
    expect(source).not.toContain('fxRate: true')
    expect(source).not.toContain('fareAmount: true')
    expect(source).not.toContain('supplierCost: true')
  })

  it('buildPortalJadeContext does not select rateKeys or supplier payloads', () => {
    expect(source).not.toContain('rateKey: true')
    expect(source).not.toContain('supplierPayload: true')
  })

  it('PortalContextHint has only tripId, bookingId, proposalId — no userId', () => {
    const match = source.match(/interface PortalContextHint\s*\{([^}]+)\}/)
    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).not.toContain('userId')
    expect(body).toContain('tripId')
    expect(body).toContain('bookingId')
    expect(body).toContain('proposalId')
  })

  it('focus entity ownership is verified by querying within userId scope', () => {
    // Hint verification: find owned trip/booking/proposal within the userId-scoped result set
    expect(source).toContain('trips.find(t => t.id === hint.tripId)')
    expect(source).toContain('bookings.find(b => b.id === hint.bookingId)')
    expect(source).toContain('proposals.find(p => p.id === hint.proposalId)')
  })
})

// ─── Portal Jade Tools ────────────────────────────────────────────────────────

describe('lib/portal/portal-jade-tools.ts — tool schema security invariants', () => {
  const source = src('lib/portal/portal-jade-tools.ts')

  it('no tool schema exposes a userId parameter', () => {
    // Parse out all tool schemas to verify none have userId in properties
    const schemaSection = source.match(/PORTAL_JADE_TOOL_SCHEMAS\s*=\s*\[([\s\S]+?)\]\s*as const/)
    expect(schemaSection).not.toBeNull()
    const schemasRaw = schemaSection![1]
    // userId must not appear in any input_schema properties block
    const propMatches = schemasRaw.match(/properties\s*:\s*\{[^}]*\}/g) ?? []
    for (const propBlock of propMatches) {
      expect(propBlock).not.toContain('userId')
    }
  })

  it('PortalToolContext declares userId from server session, never model input', () => {
    expect(source).toContain('userId: string  // from authenticated session')
    expect(source).toContain('const { userId } = ctx  // server-authoritative — never from toolInput')
  })

  it('get_my_travellers never returns passport number', () => {
    // Find the get_my_travellers case body
    const caseMatch = source.match(/case 'get_my_travellers':\s*\{([\s\S]+?)case 'get_my_notifications'/)
    expect(caseMatch).not.toBeNull()
    const caseBody = caseMatch![1]
    // passportNumber must not appear as a return value key
    expect(caseBody).not.toMatch(/passportNumber\s*:(?!\s*true|\s*!!|\s*vault)/)
    // It may reference passportNumber to compute passportProvided bool
    expect(caseBody).toContain('passportProvided: !!vault.passportNumber')
  })

  it('get_my_booking select explicitly excludes sensitive fields', () => {
    const caseMatch = source.match(/case 'get_my_booking':\s*\{([\s\S]+?)case 'get_my_proposals'/)
    expect(caseMatch).not.toBeNull()
    const caseBody = caseMatch![1]
    // Confirm blocked fields are not selected
    expect(caseBody).not.toContain("notes: true")
    expect(caseBody).not.toContain("fxRate: true")
    expect(caseBody).not.toContain("fxMargin: true")
    expect(caseBody).not.toContain("fareAmount: true")
    expect(caseBody).not.toContain("stripeClientSecret: true")
    expect(caseBody).not.toContain("cryptoInvoiceId: true")
    expect(caseBody).not.toContain("jadeAssisted: true")
    expect(caseBody).not.toContain("createdByStaffId: true")
  })

  it('PORTAL_JADE_TOOL_NAMES is derived from PORTAL_JADE_TOOL_SCHEMAS', () => {
    expect(source).toContain('new Set(PORTAL_JADE_TOOL_SCHEMAS.map(t => t.name))')
  })
})

// ─── Portal Chat API Route ────────────────────────────────────────────────────

describe('app/api/jade/portal/chat/route.ts — authentication and security', () => {
  const source = src('app/api/jade/portal/chat/route.ts')

  it('mandatory auth: returns 401 if no session', () => {
    expect(source).toContain("return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })")
  })

  it('userId is always from server session, never from request body', () => {
    expect(source).toContain('const userId = session.user.id')
    // userId must not be parsed from the request body
    expect(source).not.toContain('userId: body.userId')
    expect(source).not.toContain('userId: req.body')
    expect(source).not.toMatch(/userId\s*=\s*body\??\.\s*userId/)
  })

  it('system prompt contains PAYMENT_RECEIVED ≠ CONFIRMED hard rule', () => {
    expect(source).toContain('PAYMENT RECEIVED ≠ CONFIRMED')
  })

  it('system prompt instructs Jade it is not the source of truth', () => {
    expect(source).toMatch(/NOT the source of truth|not.*source of truth/i)
  })

  it('system prompt serialized context wrapped in portal_context XML delimiters', () => {
    expect(source).toContain('<portal_context>')
  })

  it('system prompt blocks passport number retrieval', () => {
    expect(source).toMatch(/passport number/i)
    expect(source).toContain("For security, passport numbers aren't shown here")
  })

  it('portal tool routing uses PORTAL_JADE_TOOL_NAMES.has() guard', () => {
    expect(source).toContain('PORTAL_JADE_TOOL_NAMES.has(name)')
    expect(source).toContain('executePortalTool(name, input, portalToolCtx)')
  })

  it('portalToolCtx carries userId from session', () => {
    expect(source).toContain('const portalToolCtx: PortalToolContext  = { userId }')
  })

  it('callClaude uses haiku for conversations > 10 messages', () => {
    expect(source).toContain("msgCount > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'")
  })

  it('agentic loop is capped at 4 iterations', () => {
    expect(source).toMatch(/for\s*\(let iter\s*=\s*0;\s*iter\s*<\s*4;/)
  })

  it('maxDuration and dynamic are set correctly', () => {
    expect(source).toContain('export const maxDuration = 60')
    expect(source).toContain("export const dynamic     = 'force-dynamic'")
  })

  it('no userId parameter accepted in request body schema', () => {
    // The route reads body.message, body.conversationHistory, body.contextHint — never body.userId
    expect(source).not.toContain('body.userId')
    expect(source).not.toContain("userId: z.string()")
  })

  it('system prompt instructs Jade that customer text is DATA ONLY', () => {
    expect(source).toMatch(/DATA ONLY|data only/i)
  })
})

// ─── Portal Jade Page ─────────────────────────────────────────────────────────

describe('app/dashboard/jade/page.tsx — RSC auth and context', () => {
  const source = src('app/dashboard/jade/page.tsx')

  it('redirects unauthenticated users to login', () => {
    expect(source).toContain("redirect('/login?callbackUrl=/dashboard/jade')")
  })

  it('hint uses searchParams not userId from query', () => {
    expect(source).toContain('searchParams.trip')
    expect(source).toContain('searchParams.booking')
    expect(source).toContain('searchParams.proposal')
    expect(source).not.toContain('searchParams.userId')
  })

  it('context is built from session.user.id not searchParams', () => {
    expect(source).toContain('session.user.id')
    expect(source).toContain('buildPortalJadeContext(session.user.id, hint)')
  })

  it('is marked force-dynamic', () => {
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })
})

// ─── PortalJadeChat component ─────────────────────────────────────────────────

describe('app/dashboard/jade/_components/PortalJadeChat.tsx — client safety', () => {
  const source = src('app/dashboard/jade/_components/PortalJadeChat.tsx')

  it("is a 'use client' component", () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true)
  })

  it('posts to /api/jade/portal/chat (not /api/jade/chat)', () => {
    expect(source).toContain("'/api/jade/portal/chat'")
    expect(source).not.toContain("'/api/jade/chat'")
  })

  it('sends contextHint not userId to the API', () => {
    expect(source).toContain('contextHint:')
    expect(source).not.toContain('userId:')
  })

  it('handles 401 response gracefully (session expired message)', () => {
    expect(source).toContain('res.status === 401')
    expect(source).toMatch(/session.*expired|expired.*session/i)
  })

  it('displays suggested prompts only when conversation is empty', () => {
    expect(source).toContain('isEmpty && (')
    expect(source).toContain('getSuggestedPrompts')
  })

  it('suggested prompts are context-aware based on focusEntity type', () => {
    expect(source).toContain("focusEntity?.type === 'booking'")
    expect(source).toContain("focusEntity?.type === 'proposal'")
    expect(source).toContain("focusEntity?.type === 'trip'")
  })

  it('context chip shows focusEntity label and can be dismissed', () => {
    expect(source).toContain('focus.label')
    expect(source).toContain('clearFocus')
  })

  it('has accessibility attributes on message log', () => {
    expect(source).toContain('role="log"')
    expect(source).toContain('aria-live="polite"')
  })

  it('input allows Enter to submit (Shift+Enter for newline)', () => {
    expect(source).toContain("e.key === 'Enter' && !e.shiftKey")
  })

  it('send button disabled when input is empty or loading', () => {
    expect(source).toContain('!input.trim() || loading')
  })

  it('has safe-area bottom padding for mobile keyboard', () => {
    expect(source).toContain('safe-area-inset-bottom')
  })

  it('disclaimer text refers users to My Bookings for verification', () => {
    expect(source).toContain('/dashboard/bookings')
    expect(source).toMatch(/verify|Always verify/i)
  })
})

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('PortalSidebar — Jade navigation entry', () => {
  const source = src('components/portal/PortalSidebar.tsx')

  it('has /dashboard/jade in NAV', () => {
    expect(source).toContain("href: '/dashboard/jade'")
  })

  it('Jade nav item has correct label', () => {
    expect(source).toContain("label: 'Ask Jade'")
  })
})

describe('PortalBottomNav — Jade mobile nav', () => {
  const source = src('components/portal/PortalBottomNav.tsx')

  it('has /dashboard/jade in mobile ITEMS', () => {
    expect(source).toContain("href: '/dashboard/jade'")
  })
})

// ─── Contextual Ask Jade CTAs ─────────────────────────────────────────────────

describe('Dashboard — Ask Jade CTA', () => {
  const source = src('app/dashboard/page.tsx')

  it('has Ask Jade link pointing to /dashboard/jade', () => {
    expect(source).toContain('/dashboard/jade')
  })
})

describe('Booking detail page — Ask Jade CTA', () => {
  const source = src('app/dashboard/bookings/[id]/page.tsx')

  it('Ask Jade link includes booking ID as context hint', () => {
    expect(source).toMatch(/dashboard\/jade\?booking=/)
  })

  it('does not link to public /jade route for authenticated Ask Jade', () => {
    // The old /jade link should be replaced with the portal one
    expect(source).not.toContain('href="/jade"')
  })
})

describe('Proposals page — Ask Jade CTA', () => {
  const source = src('app/dashboard/proposals/page.tsx')

  it('has Ask Jade link to /dashboard/jade', () => {
    expect(source).toContain('/dashboard/jade')
  })
})

describe('Travellers page — Ask Jade CTA', () => {
  const source = src('app/dashboard/travellers/page.tsx')

  it('has Ask Jade link to /dashboard/jade', () => {
    expect(source).toContain('/dashboard/jade')
  })
})

// ─── Architecture invariants ──────────────────────────────────────────────────

describe('R6.5 architecture — no forbidden patterns', () => {
  it('portal chat route does not create a second booking model', () => {
    const source = src('app/api/jade/portal/chat/route.ts')
    expect(source).not.toContain('BookingV2')
    expect(source).not.toContain('CustomerBooking')
    expect(source).not.toContain('FulfillmentBooking')
    expect(source).not.toContain('PortalBooking')
  })

  it('portal tools do not expose stripeClientSecret', () => {
    const source = src('lib/portal/portal-jade-tools.ts')
    expect(source).not.toContain("stripeClientSecret: true")
  })

  it('portal tools do not expose cryptoInvoiceId', () => {
    const source = src('lib/portal/portal-jade-tools.ts')
    expect(source).not.toContain("cryptoInvoiceId: true")
  })

  it('portal jade context does not reference Viator or Hotelbeds internals', () => {
    const source = src('lib/portal/portal-jade-context.ts')
    expect(source).not.toContain('viator')
    expect(source).not.toContain('hotelbeds')
    expect(source).not.toContain('Hotelbeds')
  })

  it('portal chat route does not reference automation flags that must stay off', () => {
    const source = src('app/api/jade/portal/chat/route.ts')
    expect(source).not.toContain('JADE_AUTOMATED_FOLLOWUP_ENABLED')
    expect(source).not.toContain('JADE_PROPOSAL_AUTOMATION_ENABLED')
    expect(source).not.toContain('JADE_PROPOSAL_AUTO_SEND_ENABLED')
  })

  it('portal chat route reuses existing tool executors (no duplicate implementation)', () => {
    const source = src('app/api/jade/portal/chat/route.ts')
    expect(source).toContain('executeJadeTripTool')
    expect(source).toContain('executeJadeSearchTool')
    expect(source).toContain('executeJadeRefinementTool')
  })

  it('public Jade route (/api/jade/chat) is unchanged — portal route is a new file', () => {
    // Portal route exists as a separate endpoint
    expect(fs.existsSync(path.join(ROOT, 'app/api/jade/portal/chat/route.ts'))).toBe(true)
    // Public route still exists
    expect(fs.existsSync(path.join(ROOT, 'app/api/jade/chat/route.ts'))).toBe(true)
  })

  it('PAYMENT_RECEIVED booking state is not labelled as CONFIRMED anywhere in portal tools', () => {
    const source = src('lib/portal/portal-jade-tools.ts')
    // Tool descriptions must warn about the distinction
    expect(source).toContain('PAYMENT_RECEIVED means payment succeeded but supplier has not yet confirmed')
    expect(source).toContain("never call this CONFIRMED")
  })
})
