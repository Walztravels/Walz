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
const clientInfoSrc = read('app/admin/inbox/components/ClientInfo.tsx')
const pageSrc = read('app/admin/inbox/page.tsx')
const migrationSrc = read('prisma/migrations/inbox_ux42_quote_conversation_columns.sql')

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

  it('missing server-resolved email/name fails closed — NEVER falls back to the browser-supplied value', async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      context: { ...VERIFIED_CTX.context, contact: { name: null, email: null, phone: null } },
    })
    const res = await POST(req({
      conversationId: 318, clientName: 'FORGED', clientEmail: 'attacker@evil.com', title: 'Trip',
      items: [{ type: 'custom', title: 'Item', sellingPriceMinor: 1000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.code).toBe('CLIENT_IDENTITY_REQUIRED')
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
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function handleCreate'), drawerSrc.indexOf('async function handleFinalize'))
    expect(fn).toContain("fetch('/api/admin/quotes'")
    expect(fn).not.toContain('onSendMessage')
  })

  it('Finalize mints the real share token via PATCH send + suppressNotifications, still never sends', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function handleFinalize'), drawerSrc.indexOf('function buildQuoteMessage'))
    expect(fn).toContain("action: 'send', suppressNotifications: true")
    expect(fn).not.toContain('onSendMessage')
  })

  it('Insert into Reply uses insertDraft and never sends; explicit Send is the only path to onSendMessage', () => {
    const ins = drawerSrc.slice(drawerSrc.indexOf('function handleInsert'), drawerSrc.indexOf('async function handleSendToClient'))
    expect(ins).toContain('insertDraft')
    expect(ins).not.toContain('onSendMessage')
    expect(drawerSrc).toContain('await onSendMessage(buildQuoteMessage())')
  })

  it('a failed send never shows Sent (boolean contract from the existing path)', () => {
    expect(drawerSrc).toContain('if (ok) setSent(true)')
    expect(drawerSrc).toContain('The message could not be sent. Try again.')
  })

  it('one submission latch — a second click after success cannot re-POST', () => {
    expect(drawerSrc).toContain('if (submitting || created) return')
  })

  it('identity gate mirrors the server; drawer never shows a heuristic identity as usable', () => {
    expect(drawerSrc).toContain("ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'")
    expect(drawerSrc).toContain('Client identity required')
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
    expect(drawerSrc).toContain('loadSeqRef.current')
  })

  it('amount validation reuses the epsilon-safe helper, not a re-implemented exact check', () => {
    expect(drawerSrc).toContain("from '@/lib/action-centre/constants'")
    expect(drawerSrc).toContain('isValidAmountMajor')
  })

  it('client-facing message text carries only title/reference/link — no cost or markup fields', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('function buildQuoteMessage'), drawerSrc.indexOf('async function handleCopy'))
    expect(fn).not.toMatch(/costMinor|markupMinor|supplier/i)
  })

  it('manual item pattern matches the wizard convention: cost=selling, markup 0, metadata {}', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function handleCreate'), drawerSrc.indexOf('async function handleFinalize'))
    expect(fn).toContain("sourceType: 'manual'")
    expect(fn).toContain('markupMinor: 0')
    expect(fn).toContain('metadata: {}')
  })

  it('does not build a second live-search UI; Hotelbeds live search stays excluded (documented)', () => {
    expect(drawerSrc).toContain('Hotelbeds')
    expect(drawerSrc).toContain('excluded regardless')
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
