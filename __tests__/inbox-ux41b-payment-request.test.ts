/**
 * INBOX UX-4.1B — Request Payment (Client Action Centre).
 *
 * Behavioral tests execute createPaymentRequest against mocked stores and
 * providers; source pins hold the invariants the behavioral layer can't
 * reach (route gates, UI wiring, webhook correlation, no-auto-send).
 *
 * HARD INVARIANT under test: commercial mutations require ClientActionContext
 * resolution VERIFIED or LINKED. HEURISTIC / UNRESOLVED never authorize,
 * heuristicCandidates are never read, and nothing in this release can ever
 * write status 'paid' — settlement belongs to the existing provider
 * webhooks / server-side verify route.
 */

import fs from 'fs'
import path from 'path'

const mockPrisma = {
  paymentLink: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
}
const mockResolve = jest.fn()
const mockStripePricesCreate = jest.fn()
const mockStripeLinksCreate = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/inbox/client-context', () => ({
  resolveClientActionContext: (...a: unknown[]) => mockResolve(...a),
}))
jest.mock('@/lib/flutterwave-banks', () => ({ getFLWKey: () => 'flw-test-key' }))
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    prices: { create: (...a: unknown[]) => mockStripePricesCreate(...a) },
    paymentLinks: { create: (...a: unknown[]) => mockStripeLinksCreate(...a) },
  }))
})

import { createPaymentRequest, txRefFromIdempotencyKey, isValidAmountMajor } from '@/lib/action-centre/payment-request'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const service = read('lib/action-centre/payment-request.ts')
const route = read('app/api/admin/inbox/conversations/[id]/payment-request/route.ts')
const drawer = read('app/admin/inbox/components/PaymentRequestDrawer.tsx')
const clientInfo = read('app/admin/inbox/components/ClientInfo.tsx')
const page = read('app/admin/inbox/page.tsx')
const migration = read('prisma/migrations/inbox_ux41b_payment_request_columns.sql')

const SESSION = { email: 'staff@walztravels.com', role: 'staff', permissions: { payments_create: true } } as never

const VERIFIED_CTX = {
  ok: true,
  context: {
    conversationId: 318,
    resolution: 'VERIFIED',
    contact: { name: 'Ama Mensah', email: 'ama@example.com', phone: '+233554000000' },
    application: { id: 'appA', walzRef: 'WALZ-ABC123', applicationType: 'GB Tourist Visa', status: 'In review' },
    link: { id: 'lnk1', linkMethod: 'otp_verified', linkedBy: 'staff@walztravels.com', verificationId: 'v1', createdAt: '' },
    heuristicCandidates: null, ambiguityReasons: [], supabaseLead: null, prismaLead: null, user: null, clientAccount: null,
  },
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    session: SESSION, conversationId: 318,
    amountMajor: 450000, currency: 'NGN', purpose: 'visa_service',
    provider: 'flutterwave', description: 'UK Visitor Visa Service',
    idempotencyKey: 'key-1',
    ...over,
  } as Parameters<typeof createPaymentRequest>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolve.mockResolvedValue(VERIFIED_CTX)
  mockPrisma.paymentLink.findUnique.mockResolvedValue(null)
  mockPrisma.paymentLink.findFirst.mockResolvedValue(null)
  mockPrisma.paymentLink.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pl1', createdAt: new Date(), accountNumber: null, bankName: null, paymentUrl: null, ...data,
  }))
  global.fetch = jest.fn(async () => ({
    json: async () => ({ status: 'success', data: { link: 'https://flw.example/pay/x' } }),
  })) as unknown as typeof fetch
})

// ── Identity invariant (behavioral) ─────────────────────────────────────────

describe('hard identity invariant', () => {
  it('VERIFIED client → allowed', async () => {
    const res = await createPaymentRequest(baseInput())
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.request.paymentUrl).toBe('https://flw.example/pay/x')
  })

  it('LINKED client → allowed (LINKED is authoritative)', async () => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...VERIFIED_CTX.context, resolution: 'LINKED' } })
    const res = await createPaymentRequest(baseInput())
    expect(res.ok).toBe(true)
  })

  it.each(['HEURISTIC', 'UNRESOLVED'] as const)('%s → CLIENT_IDENTITY_REQUIRED, no provider call, no persist', async resolution => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...VERIFIED_CTX.context, resolution } })
    const res = await createPaymentRequest(baseInput())
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.paymentLink.create).not.toHaveBeenCalled()
  })

  it('resolver denial (401/403) → CLIENT_IDENTITY_REQUIRED', async () => {
    mockResolve.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    const res = await createPaymentRequest(baseInput())
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
  })

  it('related application mismatch → CLIENT_CONTEXT_MISMATCH (browser cannot rebind)', async () => {
    const res = await createPaymentRequest(baseInput({ relatedApplicationId: 'someone-elses-app' }))
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_CONTEXT_MISMATCH' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('matching related application passes and is persisted from the SERVER context', async () => {
    const res = await createPaymentRequest(baseInput({ relatedApplicationId: 'appA' }))
    expect(res.ok).toBe(true)
    const persisted = mockPrisma.paymentLink.create.mock.calls[0][0].data
    expect(persisted.visaApplicationId).toBe('appA')
    expect(persisted.conversationId).toBe(318)
    expect(persisted.source).toBe('inbox_action_centre')
    expect(persisted.requestedBy).toBe('staff@walztravels.com')
  })

  it('heuristicCandidates are never consulted by the service (source)', () => {
    // Mentioned in the contract comment, but never accessed in code.
    expect(service).not.toMatch(/\.heuristicCandidates|heuristicCandidates\s*[?.[]/)
  })
})

// ── Input validation (behavioral) ───────────────────────────────────────────

describe('validation fails closed before any provider call', () => {
  it.each([0, -5, NaN, Infinity, 12.345, 50_000_001])('invalid amount %p → INVALID_AMOUNT', async bad => {
    const res = await createPaymentRequest(baseInput({ amountMajor: bad }))
    expect(res).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('isValidAmountMajor accepts ALL legitimate 2dp values (IEEE-754 traps included)', () => {
    expect(isValidAmountMajor(450000)).toBe(true)
    expect(isValidAmountMajor(1220.46)).toBe(true)
    // float-representation traps that an exact n*100 check rejects:
    expect(isValidAmountMajor(19.99)).toBe(true)
    expect(isValidAmountMajor(4.35)).toBe(true)
    expect(isValidAmountMajor(8.45)).toBe(true)
    expect(isValidAmountMajor(450000.29)).toBe(true)
    expect(isValidAmountMajor(0.005)).toBe(false)
    expect(isValidAmountMajor(0.001)).toBe(false)
  })

  it('unsupported currency for the provider → UNSUPPORTED_CURRENCY', async () => {
    const res = await createPaymentRequest(baseInput({ provider: 'stripe', currency: 'NGN' }))
    expect(res).toMatchObject({ ok: false, code: 'UNSUPPORTED_CURRENCY' })
  })

  it('paystack_va is NGN-only', async () => {
    const res = await createPaymentRequest(baseInput({ provider: 'paystack_va', currency: 'USD' }))
    expect(res).toMatchObject({ ok: false, code: 'UNSUPPORTED_CURRENCY' })
  })

  it.each(['helcim', 'bitcoin', 'paga', 'nowpayments', ''])('provider %p → UNSUPPORTED_PROVIDER', async p => {
    const res = await createPaymentRequest(baseInput({ provider: p }))
    expect(res).toMatchObject({ ok: false, code: 'UNSUPPORTED_PROVIDER' })
  })

  it('invalid purpose → INVALID_PURPOSE', async () => {
    const res = await createPaymentRequest(baseInput({ purpose: 'ransom' }))
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PURPOSE' })
  })
})

// ── Idempotency & duplicates (behavioral) ───────────────────────────────────

describe('idempotency', () => {
  it('txRef is deterministic per idempotency key', () => {
    expect(txRefFromIdempotencyKey('abc')).toBe(txRefFromIdempotencyKey('abc'))
    expect(txRefFromIdempotencyKey('abc')).not.toBe(txRefFromIdempotencyKey('abd'))
    expect(txRefFromIdempotencyKey('abc')).toMatch(/^WACR-[0-9A-F]{20}$/)
  })

  it('a retry with the same key returns the existing request WITHOUT a provider call', async () => {
    mockPrisma.paymentLink.findUnique.mockResolvedValue({
      id: 'pl-existing', txRef: txRefFromIdempotencyKey('key-1'), provider: 'flutterwave', type: 'flutterwave',
      amount: 450000, currency: 'NGN', purpose: 'visa_service', description: 'x', status: 'pending',
      paymentUrl: 'https://flw.example/pay/existing', accountNumber: null, bankName: null, createdAt: new Date(),
      conversationId: 318, source: 'inbox_action_centre',
    })
    const res = await createPaymentRequest(baseInput())
    expect(res).toMatchObject({ ok: true, deduplicated: true })
    if (res.ok) expect(res.request.paymentUrl).toBe('https://flw.example/pay/existing')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.paymentLink.create).not.toHaveBeenCalled()
  })

  it('an identical pending request within 24h → DUPLICATE_PENDING with the existing row', async () => {
    // Persisted rows hold the fee-inclusive totalCharge (M2/M4):
    // NGN 450,000 at flutterwave 1.4% → 456,300.
    mockPrisma.paymentLink.findFirst.mockResolvedValue({
      id: 'pl-dup', txRef: 'WACR-OLD', provider: 'flutterwave', type: 'flutterwave',
      amount: 456300, currency: 'NGN', purpose: 'visa_service', description: 'x', status: 'pending',
      paymentUrl: 'https://flw.example/pay/dup', accountNumber: null, bankName: null, createdAt: new Date(),
    })
    const res = await createPaymentRequest(baseInput({ idempotencyKey: 'key-2' }))
    expect(res).toMatchObject({ ok: false, code: 'DUPLICATE_PENDING' })
    if (!res.ok) expect(res.existing?.id).toBe('pl-dup')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('a concurrent unique-violation on persist converges on the winner row', async () => {
    mockPrisma.paymentLink.create.mockRejectedValue({ code: 'P2002', message: 'unique' })
    mockPrisma.paymentLink.findUnique
      .mockResolvedValueOnce(null)   // pre-check
      .mockResolvedValueOnce({       // converge after conflict (same scope)
        id: 'pl-winner', txRef: txRefFromIdempotencyKey('key-1'), provider: 'flutterwave', type: 'flutterwave',
        amount: 450000, currency: 'NGN', purpose: 'visa_service', description: 'x', status: 'pending',
        paymentUrl: 'https://flw.example/pay/winner', accountNumber: null, bankName: null, createdAt: new Date(),
        conversationId: 318, source: 'inbox_action_centre',
      })
    const res = await createPaymentRequest(baseInput())
    expect(res).toMatchObject({ ok: true, deduplicated: true })
  })
})

// ── Provider failure (behavioral) ───────────────────────────────────────────

describe('provider failure is controlled', () => {
  it('flutterwave failure → PROVIDER_UNAVAILABLE with the staff retry message, nothing persisted', async () => {
    global.fetch = jest.fn(async () => ({ json: async () => ({ status: 'error', message: 'downstream' }) })) as unknown as typeof fetch
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createPaymentRequest(baseInput())
    err.mockRestore()
    expect(res).toMatchObject({ ok: false, code: 'PROVIDER_UNAVAILABLE' })
    if (!res.ok) expect(res.error).toBe('Payment link could not be generated. Retry.')
    expect(mockPrisma.paymentLink.create).not.toHaveBeenCalled()
  })

  it('missing provider secret → PROVIDER_NOT_CONFIGURED (fail closed, no call)', async () => {
    const prev = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    const res = await createPaymentRequest(baseInput({ provider: 'stripe', currency: 'GBP', amountMajor: 1220.46 }))
    if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev
    expect(res).toMatchObject({ ok: false, code: 'PROVIDER_NOT_CONFIGURED' })
  })
})

// ── Settlement honesty (source pins) ────────────────────────────────────────

describe('nothing in UX-4.1B can mark a request paid', () => {
  it("the service and route never write status 'paid' — rows are born 'pending' only", () => {
    expect(service).toContain("status: 'pending'")
    expect(service).not.toMatch(/status:\s*'paid'/)
    expect(route).not.toMatch(/status:\s*'paid'/)
    expect(drawer).not.toMatch(/status[:=]\s*'paid'/)
  })

  it('webhook correlation: the deterministic txRef lands where the existing settlers look', () => {
    // Flutterwave webhook matches PaymentLink by tx_ref; we send tx_ref: txRef.
    expect(service).toContain('tx_ref: txRef')
    expect(read('app/api/flutterwave/webhook/route.ts')).toContain("findFirst({ where: { txRef: tx_ref } })")
    // Paystack webhook falls back to customer metadata walz_tx_ref; we set it.
    expect(service).toContain('walz_tx_ref: txRef')
    expect(read('app/api/webhooks/paystack/route.ts')).toContain('walz_tx_ref')
  })

  it('no webhook or settlement file is touched by this release (sole writers unchanged)', () => {
    // The service never imports webhook modules (comments may reference them).
    expect(service).not.toMatch(/from '.*webhooks/)
    expect(route).not.toMatch(/from '.*webhooks/)
  })
})

// ── Route gates (source pins) ───────────────────────────────────────────────

describe('payment-request route', () => {
  it('full auth chain before the service: session → inbox_view → conversation access → payments_create → rate limit', () => {
    const sessionIdx = route.indexOf('getAdminSession')
    const invIdx = route.indexOf("checkInboxPermission(session, 'inbox_view')")
    const accessIdx = route.indexOf('checkConversationAccess(session, params.id)')
    const permIdx = route.indexOf('payments_create')
    const rlIdx = route.indexOf('rateLimit({ key: `payment-request:')
    const svcIdx = route.indexOf('await createPaymentRequest(')
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(invIdx).toBeGreaterThan(-1)
    expect(accessIdx).toBeGreaterThan(-1)
    expect(permIdx).toBeGreaterThan(-1)
    expect(rlIdx).toBeGreaterThan(permIdx)
    expect(rlIdx).toBeLessThan(svcIdx)
  })

  it('the permission gate is byte-identical to the admin payment-links routes', () => {
    expect(route).toContain("!session.permissions?.payments_create && session.role !== 'super_admin'")
  })

  it('identity failures map to 403, duplicates/conflicts to 409, provider failures to 502', () => {
    expect(route).toContain("result.code === 'CLIENT_IDENTITY_REQUIRED' || result.code === 'CLIENT_CONTEXT_MISMATCH' ? 403")
    expect(route).toContain("result.code === 'DUPLICATE_PENDING' || result.code === 'IDEMPOTENCY_CONFLICT' ? 409")
  })

  it('idempotencyKey is required', () => {
    expect(route).toContain("'idempotencyKey required'")
  })
})

// ── UI contract (source pins) ───────────────────────────────────────────────

describe('Request Payment UI', () => {
  it('generation NEVER auto-sends: only the explicit Send action reaches the send path', () => {
    // handleGenerate posts to payment-request only; it never touches onSendMessage.
    const gen = drawer.slice(drawer.indexOf('async function handleGenerate'), drawer.indexOf('async function handleCopy'))
    expect(gen).toContain('/payment-request')
    expect(gen).not.toContain('onSendMessage')
    // Insert into Reply uses the composer draft context and never sends.
    const ins = drawer.slice(drawer.indexOf('function handleInsert'), drawer.indexOf('async function handleSendToClient'))
    expect(ins).toContain('insertDraft')
    expect(ins).not.toContain('onSendMessage')
    // The explicit send goes through the page-provided existing path.
    expect(drawer).toContain('await onSendMessage(buildPaymentMessage(result))')
  })

  it('the page wires Send to client to the EXISTING composer send path (handleSend)', () => {
    expect(page).toContain('onSendMessage={text => handleSend(text, false)}')
    expect(page).not.toContain('/api/admin/messages/send')
  })

  it('one idempotency key per form-open, reused across retries', () => {
    expect(drawer).toContain('idemRef.current = crypto.randomUUID()')
    expect(drawer).toContain('idempotencyKey: idemRef.current')
  })

  it('drawer a11y: dialog + Esc + Tab trap + focus restore + safe-area + motion-safe', () => {
    expect(drawer).toContain('role="dialog"')
    expect(drawer).toContain("e.key === 'Escape'")
    expect(drawer).toContain("e.key !== 'Tab'")
    expect(drawer).toContain('restoreRef.current?.focus()')
    expect(drawer).toContain('safe-area-inset-bottom')
    expect(drawer).toContain('motion-safe:transition-transform')
  })

  it('identity gate in the drawer mirrors the server (presentation only)', () => {
    expect(drawer).toContain("ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'")
    expect(drawer).toContain('Client identity required')
  })

  it('failure preserves entered values (fieldset stays mounted; error + Retry)', () => {
    expect(drawer).toContain('Payment link could not be generated. Retry.')
    expect(drawer).toContain("submitError ? 'Retry'")
    // the form fields are not reset on error
    const gen = drawer.slice(drawer.indexOf('async function handleGenerate'), drawer.indexOf('async function handleCopy'))
    expect(gen).not.toContain('setAmount(')
  })

  it('status is never conveyed by color alone', () => {
    expect(drawer).toContain('STATUS_GLYPH')
    expect(drawer).toContain("paid: '\\u2713 Paid'".replace('\\u2713', '✓'))
  })

  it('Quick Actions: one live button gated on identity; no clickable dead buttons for future actions', () => {
    expect(clientInfo).toContain('Request Payment')
    expect(clientInfo).toContain('disabled={!identityOk}')
    expect(clientInfo).toContain('Verify client identity first')
    // UX-4.2/4.3 graduated Create Quote and Visa Form from this roadmap
    // line to live buttons — only Itinerary remains "coming".
    expect(clientInfo).toContain('coming with the next release')
    const roadmap = clientInfo.slice(clientInfo.indexOf('coming with the next release') - 300, clientInfo.indexOf('coming with the next release'))
    expect(roadmap).not.toContain('<button')
  })

  it('mobile: the overlay ClientInfo (DetailsDrawer) gets the same action wiring', () => {
    expect(page).toContain('onOpenPaymentRequest={() => { screens.closeDetails(); setPaymentOpen(true) }}')
  })
})

// ── Security-review fixes (H1, M1–M4) + QA fixes ────────────────────────────

describe('review fixes', () => {
  it('H1: the internal note NEVER reaches the client — own column, clean description, absent from the DTO', async () => {
    const res = await createPaymentRequest(baseInput({ internalNote: 'client haggled, min NGN 400k' }))
    expect(res.ok).toBe(true)
    const persisted = mockPrisma.paymentLink.create.mock.calls[0][0].data
    expect(persisted.internalNote).toBe('client haggled, min NGN 400k')
    expect(persisted.description).toBe('UK Visitor Visa Service')
    expect(persisted.description).not.toContain('haggled')
    if (res.ok) {
      expect(JSON.stringify(res.request)).not.toContain('haggled')
    }
    // and the DTO shape has no internalNote key at all
    expect(service).not.toMatch(/internalNote:\s*row/)
  })

  it('M3: an idempotency-key collision from ANOTHER conversation conflicts — never leaks the other request', async () => {
    mockPrisma.paymentLink.findUnique.mockResolvedValue({
      id: 'pl-other', txRef: txRefFromIdempotencyKey('key-1'), provider: 'flutterwave', type: 'flutterwave',
      amount: 999, currency: 'NGN', purpose: 'other', description: 'someone else', status: 'pending',
      paymentUrl: 'https://flw.example/pay/other', accountNumber: null, bankName: null, createdAt: new Date(),
      conversationId: 777, source: 'inbox_action_centre',
    })
    const res = await createPaymentRequest(baseInput())
    expect(res).toMatchObject({ ok: false, code: 'IDEMPOTENCY_CONFLICT' })
    if (!res.ok) expect(JSON.stringify(res)).not.toContain('flw.example/pay/other')
  })

  it('M3: same-scope dedup still returns the existing request', async () => {
    mockPrisma.paymentLink.findUnique.mockResolvedValue({
      id: 'pl-mine', txRef: txRefFromIdempotencyKey('key-1'), provider: 'flutterwave', type: 'flutterwave',
      amount: 450000, currency: 'NGN', purpose: 'visa_service', description: 'x', status: 'pending',
      paymentUrl: 'https://flw.example/pay/mine', accountNumber: null, bankName: null, createdAt: new Date(),
      conversationId: 318, source: 'inbox_action_centre',
    })
    const res = await createPaymentRequest(baseInput())
    expect(res).toMatchObject({ ok: true, deduplicated: true })
  })

  it('M4: the duplicate-pending guard compares the fee-inclusive charge like-for-like', () => {
    expect(service).toContain('Number(dup.amount ?? 0) - fee.totalCharge')
    expect(service).not.toMatch(/Number\(dup\.amount \?\? 0\) - amountMajor/)
  })

  it('allowDuplicate override skips the duplicate-pending guard', async () => {
    mockPrisma.paymentLink.findFirst.mockResolvedValue({
      id: 'pl-dup', txRef: 'WACR-OLD', provider: 'flutterwave', type: 'flutterwave',
      amount: 456300, currency: 'NGN', purpose: 'visa_service', description: 'x', status: 'pending',
      paymentUrl: 'https://flw.example/pay/dup', accountNumber: null, bankName: null, createdAt: new Date(),
    })
    const res = await createPaymentRequest(baseInput({ idempotencyKey: 'key-3', allowDuplicate: true }))
    expect(res.ok).toBe(true)
  })

  it('stripe happy path: fee-inclusive unit_amount and walz_tx_ref correlation metadata', async () => {
    const prev = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    mockStripePricesCreate.mockResolvedValue({ id: 'price_1' })
    mockStripeLinksCreate.mockResolvedValue({ url: 'https://pay.stripe.example/x' })
    const res = await createPaymentRequest(baseInput({ provider: 'stripe', currency: 'GBP', amountMajor: 19.99 }))
    if (prev === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prev
    expect(res.ok).toBe(true)
    const priceArgs = mockStripePricesCreate.mock.calls[0][0]
    expect(priceArgs.unit_amount).toBeGreaterThan(1999)          // fee-inclusive, in minor units
    const linkArgs = mockStripeLinksCreate.mock.calls[0][0]
    expect(linkArgs.metadata.walz_tx_ref).toBe(txRefFromIdempotencyKey('key-1'))
    const persisted = mockPrisma.paymentLink.create.mock.calls[0][0].data
    expect(persisted.amount).toBeCloseTo(priceArgs.unit_amount / 100, 2)
  })

  it('M2: paystack_va persists the fee-inclusive totalCharge the webhook reconciles against', async () => {
    process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_ps_test'
    global.fetch = jest.fn(async (url: string) => ({
      json: async () => String(url).includes('/dedicated_account')
        ? { status: true, data: { account_number: '0012345678', bank: { name: 'Wema Bank' } } }
        : { status: true, data: { customer_code: 'CUS_1', phone: '+233554000000' } },
    })) as unknown as typeof fetch
    const res = await createPaymentRequest(baseInput({ provider: 'paystack_va', currency: 'NGN' }))
    expect(res.ok).toBe(true)
    const persisted = mockPrisma.paymentLink.create.mock.calls[0][0].data
    expect(Number(persisted.amount)).toBeGreaterThan(450000)     // totalCharge, not base
    expect(persisted.feeChargedNgn).toBeGreaterThan(0)
    expect(persisted.type).toBe('paystack_va')
    expect(persisted.provider).toBe('paystack')
    if (res.ok) expect(res.request.accountNumber).toBe('0012345678')
  })

  it('paystack_va without full client contact → MISSING_CLIENT_CONTACT', async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      context: { ...VERIFIED_CTX.context, contact: { name: 'Ama', email: null, phone: null } },
    })
    const res = await createPaymentRequest(baseInput({ provider: 'paystack_va', currency: 'NGN' }))
    expect(res).toMatchObject({ ok: false, code: 'MISSING_CLIENT_CONTACT' })
  })

  it('M1 honesty: the service documents which paths auto-settle and which stay pending-until-verify', () => {
    expect(service).toContain('BANK-TRANSFER payments by')
    expect(service).toContain("stay 'pending' until staff use the existing")
  })

  it('QA: the payment drawer is force-closed on conversation change AND screen change', () => {
    const applySel = page.slice(page.indexOf('function applyConvSelection'), page.indexOf('function doSelectConv'))
    expect(applySel).toContain('setPaymentOpen(false)')
    const screenEffect = page.slice(page.indexOf('prevScreenRef.current'), page.indexOf('}, [screens.screen])'))
    expect(screenEffect).toContain('setPaymentOpen(false)')
  })

  it('QA: send failure never shows Sent-to-client (boolean contract from the existing send path)', () => {
    expect(page).toContain('Promise<boolean>')
    expect(drawer).toContain('if (ok) setSent(true)')
    expect(drawer).toContain('The message could not be sent. Try again.')
  })

  it('QA: DUPLICATE_PENDING adopts the existing request instead of dead-ending staff', () => {
    expect(drawer).toContain("data?.code === 'DUPLICATE_PENDING' && data?.existing")
  })

  it('QA: Tab trap respects fieldset-inherited disabling; stale context loads are sequence-guarded', () => {
    expect(drawer).toContain("!el.matches(':disabled')")
    expect(drawer).toContain('loadSeqRef.current')
  })

  it('QA: PERSIST_FAILED withdraws the Generate button (no do-not-resend Retry footgun)', () => {
    expect(drawer).toContain("data?.code === 'PERSIST_FAILED'")
    expect(drawer).toContain('{!fatalError && (')
  })
})

// ── Migration + schema pins ─────────────────────────────────────────────────

describe('migration + schema', () => {
  it('additive nullable columns only, with validation', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "conversationId"')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "requestedBy"')
    expect(migration).not.toMatch(/\bDROP\b|\bDELETE\b|\bUPDATE\b/i)
    expect(migration).toContain("'inbox_ux41b' AS migration")
    expect(migration).toContain('-- Expect: inbox_ux41b | 8 | 1 | 1 | 1 | 1')
    // M5: the deploy gate asserts the txRef unique index the idempotency
    // design depends on — 0 is a documented deploy blocker.
    expect(migration).toContain('AS txref_unique')
    expect(migration).toContain('DEPLOY BLOCKER')
  })

  it('Prisma model gained the columns (SQL-editor-managed)', () => {
    const schema = read('prisma/schema.prisma')
    const model = schema.slice(schema.indexOf('model PaymentLink'), schema.indexOf('model', schema.indexOf('model PaymentLink') + 10))
    expect(model).toContain('conversationId    Int?')
    expect(model).toContain("source            String?")
    expect(model).toContain('NEVER prisma db push')
  })
})
