/**
 * INBOX UX-4.2 — Create Quote (Client Action Centre).
 *
 * The quotes engine (POST /api/admin/quotes) is EXTENDED additively: when
 * the body carries a conversationId, the route re-resolves identity
 * server-side and requires VERIFIED/LINKED before touching the database —
 * mirroring the UX-4.1B hard invariant. When conversationId is absent,
 * the plain admin-wizard path is untouched (behavioral proof below).
 */

import fs from 'fs'
import path from 'path'

const mockPrisma = {
  quote: { create: jest.fn(), findFirst: jest.fn(), $transaction: undefined as unknown },
  quoteItem: { createMany: jest.fn() },
  quoteFlightOption: { create: jest.fn() },
  quoteHotelOption: { create: jest.fn() },
  quoteActivity: { create: jest.fn() },
  $transaction: jest.fn(),
}
const mockResolve = jest.fn()
const mockSendEmail = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: () => true }))
jest.mock('@/lib/quote-reference', () => ({ generateQuoteReference: async () => 'WT-Q-20260918-0001' }))
jest.mock('@/lib/email-quote-proposal', () => ({
  sendQuoteProposalEmail: (...a: unknown[]) => { mockSendEmail(...a); return Promise.resolve() },
}))
jest.mock('@/lib/inbox/authz', () => ({
  checkInboxPermission: () => ({ allowed: true }),
  checkConversationAccess: async () => ({ allowed: true }),
}))
jest.mock('@/lib/inbox/client-context', () => ({
  resolveClientActionContext: (...a: unknown[]) => mockResolve(...a),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { POST } from '@/app/api/admin/quotes/route'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const routeSrc = read('app/api/admin/quotes/route.ts')
const idRouteSrc = read('app/api/admin/quotes/[id]/route.ts')
const inboxRouteSrc = read('app/api/admin/inbox/conversations/[id]/quote/route.ts')
const drawerSrc = read('app/admin/inbox/components/CreateQuoteDrawer.tsx')
// QUOTE BUILDER V1.2 step 1: all Quote Builder business logic (manual line
// items, live search, pending-offer pricing, quote create/finalize/send)
// was mechanically extracted out of CreateQuoteDrawer.tsx into this hook —
// same source, same fetch calls/conditionals/comments, just relocated. The
// source-pin assertions below that target that business logic now read
// hookSrc instead of drawerSrc; assertions on what legitimately stayed in
// CreateQuoteDrawer.tsx (a11y/DOM-shell plumbing) are unchanged.
const hookSrc = read('app/admin/inbox/components/quote-builder/useQuoteBuilderState.ts')
const clientInfoSrc = read('app/admin/inbox/components/ClientInfo.tsx')
const pageSrc = read('app/admin/inbox/page.tsx')
const migrationSrc = read('prisma/migrations/inbox_ux42_quote_conversation_columns.sql')
// QUOTE BUILDER V1.2 step 2/3: the workspace JSX that used to render
// directly inside CreateQuoteDrawer.tsx now lives in these three
// breakpoint-specific trees instead (desktop 3-column grid / tablet
// two-pane / mobile full-screen flow). Assertions below that check
// JSX/DOM content which moved out of CreateQuoteDrawer.tsx now read these
// — checking the SAME invariant in every tree that renders it, per the
// V1.2 integration brief ("do not narrow the invariant to only one
// breakpoint just because it's easier").
const desktopWorkspaceSrc = read('app/admin/inbox/components/quote-builder/desktop/DesktopWorkspace.tsx')
const tabletWorkspaceSrc = read('app/admin/inbox/components/quote-builder/tablet/TabletWorkspace.tsx')
const mobileWorkspaceSrc = read('app/admin/inbox/components/quote-builder/mobile/MobileWorkspace.tsx')
const desktopSummaryPanelSrc = read('app/admin/inbox/components/quote-builder/desktop/QuoteSummaryPanel.tsx')
const mobileBasketSheetSrc = read('app/admin/inbox/components/quote-builder/mobile/QuoteBasketSheet.tsx')

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const VERIFIED_CTX = {
  ok: true,
  context: {
    resolution: 'VERIFIED',
    contact: { name: 'Ama Mensah', email: 'ama@example.com', phone: '+233554000000' },
    application: { id: 'appA', walzRef: 'WALZ-ABC123', applicationType: 'GB Tourist Visa', status: 'In review' },
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  mockResolve.mockResolvedValue(VERIFIED_CTX)
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.quote.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'q1', reference: 'WT-Q-20260918-0001', status: 'draft', ...data,
  }))
  mockPrisma.quoteItem.createMany.mockResolvedValue({ count: 1 })
  mockPrisma.quoteActivity.create.mockResolvedValue({})
  mockPrisma.quote.findFirst.mockResolvedValue(null)
})

describe('hard identity invariant on inbox-originated quotes', () => {
  it('VERIFIED client → allowed, and client fields come from the SERVER context, not the body', async () => {
    const res = await POST(req({
      conversationId: 318, source: 'inbox_action_centre',
      clientName: 'FORGED NAME', clientEmail: 'attacker@evil.com',
      title: 'Lagos trip', currency: 'GBP',
      items: [{ type: 'custom', title: 'Flight', sellingPriceMinor: 50000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(200)
    const persisted = mockPrisma.quote.create.mock.calls[0][0].data
    expect(persisted.clientName).toBe('Ama Mensah')
    expect(persisted.clientEmail).toBe('ama@example.com')
    expect(persisted.clientName).not.toBe('FORGED NAME')
    expect(persisted.conversationId).toBe(318)
    expect(persisted.source).toBe('inbox_action_centre')
  })

  it('LINKED client → allowed (LINKED is authoritative)', async () => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...VERIFIED_CTX.context, resolution: 'LINKED' } })
    const res = await POST(req({
      conversationId: 318, clientName: 'x', clientEmail: 'x@x.com', title: 'Trip',
      items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(200)
  })

  it.each(['HEURISTIC', 'UNRESOLVED'] as const)('%s → rejected, no quote ever created', async resolution => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...VERIFIED_CTX.context, resolution } })
    const res = await POST(req({
      conversationId: 318, clientName: 'x', clientEmail: 'x@x.com', title: 'Trip',
      items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('resolver denial (401/403) → rejected before any write', async () => {
    mockResolve.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    const res = await POST(req({ conversationId: 318, title: 'Trip', items: [] }))
    expect(res.status).toBe(403)
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('mixed-currency items are rejected before any write (engine sums blindly otherwise)', async () => {
    const res = await POST(req({
      conversationId: 318, title: 'Trip', currency: 'GBP',
      items: [
        { type: 'custom', title: 'Flight', sellingPriceMinor: 1000, currency: 'GBP' },
        { type: 'custom', title: 'Hotel', sellingPriceMinor: 1000, currency: 'USD' },
      ],
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('INVALID_INPUT')
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('missing contact data fails closed as a PROFILE (not identity) gap — NEVER falls back to the browser-supplied value', async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      context: { ...VERIFIED_CTX.context, contact: { name: null, email: null, phone: null } },
    })
    const res = await POST(req({
      conversationId: 318, clientName: 'FORGED', clientEmail: 'attacker@evil.com', title: 'Trip',
      items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    // The client IS VERIFIED here — this is the shared Client Profile
    // Completeness layer (lib/inbox/client-profile.ts), a distinct concept
    // from CLIENT_IDENTITY_REQUIRED. "Link the client first" would be
    // conceptually wrong: the client is already linked/verified.
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('CLIENT_PROFILE_INCOMPLETE')
    expect(data.missingFields).toEqual(['name', 'email'])
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('sendEmail on an inbox-originated quote uses the SERVER-resolved email, never a forged body value', async () => {
    await POST(req({
      conversationId: 318, sendEmail: true,
      clientName: 'FORGED', clientEmail: 'attacker@evil.com',
      title: 'Trip', items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0].to).toBe('ama@example.com')
    expect(mockSendEmail.mock.calls[0][0].to).not.toBe('attacker@evil.com')
  })
})

describe('duplicate-draft guard (security closing re-check)', () => {
  it('a matching recent draft for this conversation → 409 DUPLICATE_DRAFT with the existing id/reference, no second quote created', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q-existing', reference: 'WT-Q-20260918-0001', status: 'draft' })
    const res = await POST(req({
      conversationId: 318, title: 'Trip', items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.code).toBe('DUPLICATE_DRAFT')
    expect(data.existing).toEqual({ id: 'q-existing', reference: 'WT-Q-20260918-0001', status: 'draft' })
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('the duplicate check is scoped to THIS conversation — a duplicate found for another conversation could never leak here (query pin)', () => {
    const block = routeSrc.slice(routeSrc.indexOf('recentDuplicate'), routeSrc.indexOf('const reference = await generateQuoteReference()'))
    expect(block).toContain('conversationId: quoteConversationId')
    expect(block).toContain("source:         'inbox_action_centre'")
    expect(block).toContain("status:         'draft'")
  })

  it('no conversationId (plain admin path) → the duplicate check never runs', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'unrelated', reference: 'WT-Q-OTHER', status: 'draft' })
    const res = await POST(req({
      clientName: 'Real Client', clientEmail: 'client@walztravels.com', title: 'Trip',
      items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(200)   // never 409 — findFirst result is irrelevant on this path
    expect(mockPrisma.quote.create).toHaveBeenCalled()
  })
})

describe('plain admin path (no conversationId) is untouched', () => {
  it('creates a quote with body-supplied client fields verbatim — identity gate never runs', async () => {
    const res = await POST(req({
      clientName: 'Real Client', clientEmail: 'client@walztravels.com', title: 'Trip',
      items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(200)
    expect(mockResolve).not.toHaveBeenCalled()
    const persisted = mockPrisma.quote.create.mock.calls[0][0].data
    expect(persisted.clientName).toBe('Real Client')
    expect(persisted.clientEmail).toBe('client@walztravels.com')
    expect(persisted.conversationId).toBeNull()
    expect(persisted.source).toBeNull()
  })

  it('source pin: the identity block is scoped inside `if (conversationId != null)`', () => {
    const block = routeSrc.slice(routeSrc.indexOf('conversationId != null'), routeSrc.indexOf('if (!clientName'))
    expect(block).toContain('resolveClientActionContext')
    expect(block).toContain("resolution !== 'VERIFIED'")
  })
})

describe('PATCH send/resend: suppressNotifications (UX-4.2 finalize-without-emailing)', () => {
  it('default (false) still calls email + activity exactly as before', () => {
    expect(idRouteSrc).toContain('suppressNotifications = fields.suppressNotifications === true')
    const block = idRouteSrc.slice(idRouteSrc.indexOf("action === 'send'"), idRouteSrc.indexOf("if (action === 'extend'"))
    expect(block).toContain('if (!suppressNotifications) {')
    expect(block).toContain('sendQuoteProposalEmail')
  })

  it('token rotation and status transition happen unconditionally (outside the suppress check)', () => {
    const block = idRouteSrc.slice(idRouteSrc.indexOf("action === 'send'"), idRouteSrc.indexOf('if (!suppressNotifications) {'))
    expect(block).toContain("status:         'sent'")
    expect(block).toContain('secureTokenHash')
  })
})

describe('inbox conversation quote list route', () => {
  it('exposes no token, cost, or markup fields — DTO is allowlisted', () => {
    expect(inboxRouteSrc).not.toMatch(/secureTokenHash|costMinor|markupMinor|rawToken/i)
    expect(inboxRouteSrc).toContain('id: q.id, reference: q.reference, title: q.title, status: q.status')
  })

  it('full auth chain before any read', () => {
    const sIdx = inboxRouteSrc.indexOf('getAdminSession')
    const aIdx = inboxRouteSrc.indexOf("checkInboxPermission(session, 'inbox_view')")
    const cIdx = inboxRouteSrc.indexOf('checkConversationAccess(session, params.id)')
    const qIdx = inboxRouteSrc.indexOf('prisma.quote.findMany')
    expect(sIdx).toBeGreaterThan(-1)
    expect(sIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(cIdx)
    expect(cIdx).toBeLessThan(qIdx)
  })

  it('there is no POST here — creation goes through the one extended admin route', () => {
    expect(inboxRouteSrc).not.toContain('export async function POST')
    expect(inboxRouteSrc).toContain('There is NO POST here')
    expect(inboxRouteSrc).toContain('creation path')
  })
})

describe('CreateQuoteDrawer — send/share discipline and a11y (source pins)', () => {
  it('Create quote never sends: it only POSTs to /api/admin/quotes and never calls onSendMessage', () => {
    // handleCreate moved into useQuoteBuilderState.ts (QUOTE BUILDER V1.2
    // step 1, pure relocation — same invariant, same source, new home).
    const fn = hookSrc.slice(hookSrc.indexOf('async function handleCreate'), hookSrc.indexOf('async function handleFinalize'))
    expect(fn).toContain("fetch('/api/admin/quotes'")
    expect(fn).not.toContain('onSendMessage')
  })

  it('Finalize mints the real share token via PATCH send + suppressNotifications, still never sends', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function handleFinalize'), hookSrc.indexOf('function buildQuoteMessage'))
    expect(fn).toContain("action: 'send', suppressNotifications: true")
    expect(fn).not.toContain('onSendMessage')
  })

  it('Insert into Reply uses insertDraft and never sends; explicit Send is the only path to onSendMessage', () => {
    const ins = hookSrc.slice(hookSrc.indexOf('function handleInsert'), hookSrc.indexOf('async function handleSendToClient'))
    expect(ins).toContain('insertDraft')
    expect(ins).not.toContain('onSendMessage')
    expect(hookSrc).toContain('await onSendMessage(buildQuoteMessage())')
  })

  it('a failed send never shows Sent (boolean contract from the existing path)', () => {
    expect(hookSrc).toContain('if (ok) setSent(true)')
    expect(hookSrc).toContain('The message could not be sent. Try again.')
  })

  it('one submission latch — a second click after success cannot re-POST', () => {
    expect(hookSrc).toContain('if (submitting || created) return')
  })

  it('identity gate mirrors the server; drawer never shows a heuristic identity as usable', () => {
    // The resolution check itself lives in useQuoteBuilderState.ts
    // (unchanged). QUOTE BUILDER V1.2: the JSX text it gates ("Client
    // identity required") no longer renders directly in
    // CreateQuoteDrawer.tsx — it moved into all three breakpoint-specific
    // workspace trees, each of which renders its OWN full-panel identity
    // gate (see each file's own "state.identityOk" branch). Checked in
    // all three, not just one, so the invariant isn't narrowed to a single
    // breakpoint.
    expect(hookSrc).toContain("ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'")
    expect(desktopWorkspaceSrc).toContain('Client identity required')
    expect(tabletWorkspaceSrc).toContain('Client identity required')
    expect(mobileWorkspaceSrc).toContain('Client identity required')
  })

  it('a11y: dialog + Esc + Tab trap (:disabled-aware) + focus restore + safe-area + motion-safe', () => {
    expect(drawerSrc).toContain('role="dialog"')
    expect(drawerSrc).toContain("e.key === 'Escape'")
    expect(drawerSrc).toContain("!el.matches(':disabled')")
    expect(drawerSrc).toContain('restoreRef.current?.focus()')
    expect(drawerSrc).toContain('safe-area-inset-bottom')
    expect(drawerSrc).toContain('motion-safe:transition-transform')
  })

  it('stale-response guard on context load (conversation-switch safety)', () => {
    expect(hookSrc).toContain('loadSeqRef.current')
  })

  it('amount validation reuses the epsilon-safe helper, not a re-implemented exact check', () => {
    expect(hookSrc).toContain("from '@/lib/action-centre/constants'")
    expect(hookSrc).toContain('isValidAmountMajor')
  })

  it('client-facing message text carries only title/reference/link — no cost or markup fields', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('function buildQuoteMessage'), hookSrc.indexOf('async function handleCopy'))
    expect(fn).not.toMatch(/costMinor|markupMinor|supplier/i)
  })

  it('manual item pattern matches the wizard convention: cost=selling, markup 0, metadata {}', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function handleCreate'), hookSrc.indexOf('async function handleFinalize'))
    expect(fn).toContain("sourceType: 'manual'")
    expect(fn).toContain('markupMinor: 0')
    expect(fn).toContain('metadata: {}')
  })

  it('Phase 2 (UX-4.2b): live Flight/Hotel/Activity/Transfer search reuses the existing travel-search infrastructure only — no new supplier calls', () => {
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/flights'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/hotels'")
    expect(hookSrc).toContain('fetch(`/api/admin/travel-search/activities?')
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/transfers'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/add-to-quote'")
    expect(hookSrc).not.toMatch(/duffel\.|hotelbedsRequest|new Duffel/i)
  })

  it('live-search attach enforces the single-quote-currency invariant client-side before calling add-to-quote', () => {
    expect(hookSrc).toContain('pendingCurrencyMismatch')
    expect(hookSrc).toContain('the quote is in')
  })

  it('flight/hotel offers must revalidate before attach; activity/transfer (no revalidate route) are not blocked on it', () => {
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/flights/revalidate'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/hotels/revalidate'")
    expect(hookSrc).toContain("revalidateState !== 'ok'")
  })

  it('Finalize is disabled while in flight (security closing re-check)', () => {
    // QUOTE BUILDER V1.2: the "Finalize for client" button no longer
    // renders in CreateQuoteDrawer.tsx — it moved into the desktop
    // QuoteSummaryPanel (sidebar) and the mobile/tablet QuoteBasketSheet
    // (tablet reuses the mobile component unmodified — see
    // tablet/TabletWorkspace.tsx's own comment on that reuse). Checked in
    // both underlying files so the invariant covers every breakpoint.
    for (const src of [desktopSummaryPanelSrc, mobileBasketSheetSrc]) {
      const start = src.indexOf('onClick={() => void handleFinalize()}')
      expect(start).toBeGreaterThan(-1)
      const btn = src.slice(start, src.indexOf("'Finalize for client'", start))
      expect(btn).toContain('disabled={finalizing}')
    }
  })

  it('finalizing always resets in a finally block — never stuck disabled on success, failure, or throw', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function handleFinalize'), hookSrc.indexOf('function buildQuoteMessage'))
    expect(fn).toContain('finally {')
    expect(fn).toContain('setFinalizing(false)')
  })

  it('DUPLICATE_DRAFT renders a clear pointer to the EXISTING draft — never mislabels it as this request’s own success', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function handleCreate'), hookSrc.indexOf('async function handleFinalize'))
    expect(fn).toContain("data?.code === 'DUPLICATE_DRAFT'")
    expect(fn).toContain('setDuplicateOf(')
    // the duplicate branch never sets `quote` (which drives the "Draft created" success copy)
    expect(fn).not.toMatch(/DUPLICATE_DRAFT[\s\S]{0,120}setQuote\(/)
    // QUOTE BUILDER V1.2: the JSX rendering the duplicate pointer moved out
    // of CreateQuoteDrawer.tsx into all three workspace trees (each has its
    // own full-panel `state.duplicateOf` branch).
    expect(desktopWorkspaceSrc).toContain('A matching draft already exists')
    expect(tabletWorkspaceSrc).toContain('A matching draft already exists')
    expect(mobileWorkspaceSrc).toContain('A matching draft already exists')
    // All three trees additionally render an "Open in quote editor" link
    // out to the existing draft. Tablet's own duplicateOf branch initially
    // shipped without one (a real gap in the independently-built tree,
    // caught during integration review) — fixed directly to match desktop/
    // mobile rather than left as a silent parity gap.
    expect(desktopWorkspaceSrc).toContain('Open in quote editor')
    expect(tabletWorkspaceSrc).toContain('Open in quote editor')
    expect(mobileWorkspaceSrc).toContain('Open in quote editor')
  })
})

describe('page wiring: quote drawer force-closed on conversation change and screen change', () => {
  it('applyConvSelection closes the quote drawer', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('function applyConvSelection'), pageSrc.indexOf('function doSelectConv'))
    expect(fn).toContain('setQuoteOpen(false)')
  })

  it('the screen-change effect closes the quote drawer alongside payment/copilot', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('prevScreenRef.current'), pageSrc.indexOf('}, [screens.screen])'))
    expect(fn).toContain('setQuoteOpen(false)')
  })

  it('both rail and overlay ClientInfo wire onOpenCreateQuote', () => {
    expect(pageSrc.match(/onOpenCreateQuote=/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ClientInfo Quick Actions: Create Quote button gated identically to Request Payment', () => {
  it('a second live button exists, disabled below VERIFIED/LINKED, no new dead buttons', () => {
    expect(clientInfoSrc).toContain('Create Quote')
    expect(clientInfoSrc).toContain('onOpenCreateQuote')
    const roadmap = clientInfoSrc.slice(clientInfoSrc.indexOf('coming with the next releases') - 200, clientInfoSrc.indexOf('coming with the next releases'))
    expect(roadmap).not.toContain('<button')
  })
})

describe('migration + schema', () => {
  it('additive nullable columns only, with validation', () => {
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS "conversation_id"')
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS "source"')
    expect(migrationSrc).not.toMatch(/\bDROP\b|\bDELETE\b|\bUPDATE\b/i)
    expect(migrationSrc).toContain("'inbox_ux42' AS migration")
  })

  it('Prisma model gained the columns (SQL-editor-managed)', () => {
    const schema = read('prisma/schema.prisma')
    const model = schema.slice(schema.indexOf('model Quote {'), schema.indexOf('@@map("quotes")'))
    expect(model).toContain('conversationId          Int?')
    expect(model).toContain('NEVER prisma db push')
  })
})
