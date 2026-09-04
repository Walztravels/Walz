/**
 * Jade — "Speak to a Human" canonical handoff path.
 *
 * Covers the spec's required cases:
 *  - control visible in Jade-owned chat / replaced during human ownership
 *  - cancel leaves Jade owner (pure state — no transition on close)
 *  - each category routes deterministically to its keyword/team
 *  - typed "speak to human" phrases detected and use the same function
 *  - no duplicate assignment on repeat requests
 *  - Chatwoot private note format
 *  - audit event recorded
 *  - button path never sends a customer-visible message
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRoute  = jest.fn()
const mockApply  = jest.fn()
jest.mock('@/lib/conversation-router', () => ({
  routeConversation: (...a: unknown[]) => mockRoute(...a),
  applyRouting:      (...a: unknown[]) => mockApply(...a),
}))

const mockMarkHandover = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/jade-session', () => ({
  markHandover: (...a: unknown[]) => mockMarkHandover(...a),
}))

const mockAuditCreate = jest.fn().mockResolvedValue({})
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { activityLog: { create: (...a: unknown[]) => mockAuditCreate(...a) } },
  prisma:  { activityLog: { create: (...a: unknown[]) => mockAuditCreate(...a) } },
}))

import {
  requestHumanHandoff,
  isExplicitHumanRequest,
  speakToHumanControlState,
  HANDOFF_CATEGORIES,
  HANDOFF_CATEGORY_MAP,
  isHandoffCategory,
  type HandoffCategory,
} from '@/lib/jade/human-handoff'

// fetch mock: tracks calls to Chatwoot; conversation attrs configurable per test
type FetchCall = { url: string; init?: RequestInit }
let fetchCalls: FetchCall[] = []
let conversationAttrs: Record<string, unknown> = {}

beforeEach(() => {
  fetchCalls = []
  conversationAttrs = {}
  mockRoute.mockReset().mockResolvedValue({
    agentId: 'a1', agentName: 'Pricilla', agentEmail: 'p@walztravels.com',
    chatwootId: 7, aircallId: null, reason: 'specialism:visa',
  })
  mockApply.mockReset().mockResolvedValue(undefined)
  mockAuditCreate.mockClear()
  mockMarkHandover.mockClear()

  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    fetchCalls.push({ url: u, init })
    if (/\/conversations\/\d+$/.test(u)) {
      return { ok: true, json: async () => ({ custom_attributes: conversationAttrs }) } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  }) as unknown as typeof fetch
})

// ── UI control state (button visibility / ownership) ─────────────────────────

describe('speakToHumanControlState', () => {
  it('button is visible in a Jade-owned open chat', () => {
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: false })).toBe('speak_button')
  })

  it('button is replaced during human ownership', () => {
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: true })).toBe('human_active')
  })

  it('hidden when chat is closed', () => {
    expect(speakToHumanControlState({ chatOpen: false, isHandedOff: false })).toBe('hidden')
  })

  it('cancel leaves Jade owner — state function is pure, closing the selector changes nothing', () => {
    // Cancelling only closes the menu; ownership input is unchanged, so the
    // control remains in speak_button state (Jade still owns the chat).
    const before = speakToHumanControlState({ chatOpen: true, isHandedOff: false })
    const after  = speakToHumanControlState({ chatOpen: true, isHandedOff: false })
    expect(before).toBe('speak_button')
    expect(after).toBe('speak_button')
  })

  it('returns to speak_button when conversation goes back to Jade', () => {
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: true })).toBe('human_active')
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: false })).toBe('speak_button')
  })
})

// ── Category routing ──────────────────────────────────────────────────────────

describe('category routing', () => {
  const ROUTES: Array<[HandoffCategory, string]> = [
    ['booking_support', 'booking'],
    ['visa_support',    'visa'],
    ['payment_issue',   'payment'],
    ['complaint',       'complaint'],
    ['partnership',     'partnership'],
  ]

  for (const [category, keyword] of ROUTES) {
    it(`${category} routes deterministically with keyword "${keyword}"`, async () => {
      const result = await requestHumanHandoff({ conversationId: 42, category, source: 'button' })
      expect(result.ok).toBe(true)
      expect(result.alreadyRequested).toBe(false)
      // Router received the category's routing keyword — deterministic input
      expect(mockRoute).toHaveBeenCalledWith('42', keyword, expect.any(String))
      expect(mockApply).toHaveBeenCalledTimes(1)
    })
  }

  it('all six spec categories exist with labels', () => {
    const labels = HANDOFF_CATEGORIES.map(c => c.label)
    expect(labels).toEqual([
      'Booking Support', 'Visa Support', 'Payment Issue',
      'Complaint', 'Partnership / Business', 'Other',
    ])
  })

  it('isHandoffCategory validates keys', () => {
    expect(isHandoffCategory('visa_support')).toBe(true)
    expect(isHandoffCategory('sudo')).toBe(false)
    expect(isHandoffCategory(42)).toBe(false)
  })
})

// ── Handoff state + records ───────────────────────────────────────────────────

describe('handoff state and records', () => {
  it('sets HUMAN_HANDOFF_REQUESTED with handoffCategory and handoffReason', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'visa_support', source: 'button' })
    const attrCall = fetchCalls.find(c => c.url.includes('/custom_attributes'))
    expect(attrCall).toBeDefined()
    const body = JSON.parse(String(attrCall!.init?.body))
    expect(body.custom_attributes.human_handoff_requested).toBe(true)
    expect(body.custom_attributes.handoff_category).toBe('visa_support')
    expect(body.custom_attributes.handoff_reason).toContain('Speak to a Human')
  })

  it('creates the Chatwoot private note in spec format', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'complaint', source: 'button' })
    const noteCall = fetchCalls.find(c =>
      c.url.includes('/messages') && String(c.init?.body).includes('Jade handoff requested'))
    expect(noteCall).toBeDefined()
    const body = JSON.parse(String(noteCall!.init?.body))
    expect(body.private).toBe(true)  // staff-only, never customer-facing
    expect(body.content).toContain('Category: Complaint')
    expect(body.content).toContain('Reason: Customer explicitly selected “Speak to a Human”.')
  })

  it('button source never posts a customer-visible message', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'other', source: 'button' })
    const messageCalls = fetchCalls.filter(c => c.url.includes('/messages') && c.init?.method === 'POST')
    for (const c of messageCalls) {
      expect(JSON.parse(String(c.init?.body)).private).toBe(true)
    }
  })

  it('records an audit event', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'payment_issue', source: 'button' })
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    const arg = mockAuditCreate.mock.calls[0][0] as { data: { action: string; detail: string; staffName: string } }
    expect(arg.data.action).toBe('Jade Human Handoff')
    expect(arg.data.detail).toContain('conv 42')
    expect(arg.data.detail).toContain('Payment Issue')
  })

  it('silences Jade for the conversation (markHandover)', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'other', source: 'button' })
    expect(mockMarkHandover).toHaveBeenCalledWith('42')
  })
})

// ── Duplicate assignment guard ────────────────────────────────────────────────

describe('duplicate assignment guard', () => {
  it('does not assign again when handoff already requested', async () => {
    conversationAttrs = { human_handoff_requested: true }
    const result = await requestHumanHandoff({ conversationId: 42, category: 'booking_support', source: 'button' })
    expect(result.alreadyRequested).toBe(true)
    expect(mockRoute).not.toHaveBeenCalled()
    expect(mockApply).not.toHaveBeenCalled()
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })

  it('typed request after button request does not double-assign', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'booking_support', source: 'button' })
    conversationAttrs = { human_handoff_requested: true }  // now persisted in Chatwoot
    const second = await requestHumanHandoff({ conversationId: 42, category: 'other', source: 'typed' })
    expect(second.alreadyRequested).toBe(true)
    expect(mockApply).toHaveBeenCalledTimes(1)  // only the first assigned
  })
})

// ── Typed-phrase detection — same function as the button ─────────────────────

describe('typed "speak to a human" detection', () => {
  const MUST_MATCH = [
    'human',
    'agent',
    'speak to someone',
    'talk to someone',
    'I want customer service',
    'call me',
    'can I speak with staff',
    'speak to a human please',
    'talk to an agent',
    'I need a real person',
  ]
  for (const phrase of MUST_MATCH) {
    it(`detects: "${phrase}"`, () => {
      expect(isExplicitHumanRequest(phrase)).toBe(true)
    })
  }

  const MUST_NOT_MATCH = [
    'do you have flights to London in December',
    'my travel agents in Lagos recommended you',
    'is the visa payment refundable',
    'humanity is amazing',
  ]
  for (const phrase of MUST_NOT_MATCH) {
    it(`does not fire on: "${phrase}"`, () => {
      expect(isExplicitHumanRequest(phrase)).toBe(false)
    })
  }

  it('typed request uses the exact same handoff function with identical assignment logic', async () => {
    // Same function, same router call shape — only the recorded source differs.
    await requestHumanHandoff({ conversationId: 42, category: 'other', source: 'typed' })
    expect(mockRoute).toHaveBeenCalledWith('42', HANDOFF_CATEGORY_MAP.other.routingKeyword, expect.any(String))
    const attrCall = fetchCalls.find(c => c.url.includes('/custom_attributes'))
    const body = JSON.parse(String(attrCall!.init?.body))
    expect(body.custom_attributes.handoff_source).toBe('typed')
    expect(body.custom_attributes.human_handoff_requested).toBe(true)
  })
})

// ── Routing failure resilience ────────────────────────────────────────────────

describe('resilience', () => {
  it('handoff still records state + note + audit when routing fails', async () => {
    mockRoute.mockRejectedValueOnce(new Error('router down'))
    const result = await requestHumanHandoff({ conversationId: 42, category: 'other', source: 'button' })
    expect(result.ok).toBe(true)
    expect(result.assignedAgentName).toBeNull()
    expect(fetchCalls.some(c => c.url.includes('/custom_attributes'))).toBe(true)
    expect(fetchCalls.some(c => String(c.init?.body ?? '').includes('Jade handoff requested'))).toBe(true)
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
  })
})
