/**
 * Jade — "Speak to Human" canonical one-click handoff path.
 *
 * Spec cases covered:
 *  - single click invokes requestHumanHandoff (no category selector step)
 *  - context category inferred when reliable; unknown context → general
 *  - control visible in Jade-owned chat / replaced during human ownership
 *  - cancel/close leaves Jade owner (pure state)
 *  - deterministic per-category routing keywords
 *  - typed phrases detected and use the same function
 *  - double-click / button-then-typed / webhook retry → 1 assignment, 1 email
 *  - assigned staff receives one email, only after successful assignment
 *  - assignment failure → no email; missing staff email → handoff still ok
 *    (HANDOFF_EMAIL_SKIPPED_NO_EMAIL); provider failure → handoff kept
 *    (HANDOFF_EMAIL_FAILED)
 *  - private note identifies the button source; Jade silenced (markHandover)
 *  - audit event recorded
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

const mockSendEmail = jest.fn()
jest.mock('@/lib/email-staff-notification', () => ({
  sendHandoffRequestEmail: (...a: unknown[]) => mockSendEmail(...a),
}))

import {
  requestHumanHandoff,
  isExplicitHumanRequest,
  inferHandoffCategory,
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

const AGENT = {
  agentId: 'a1', agentName: 'Pricilla', agentEmail: 'p@walztravels.com',
  chatwootId: 7, aircallId: null, reason: 'specialism:visa',
}

beforeEach(() => {
  fetchCalls = []
  conversationAttrs = {}
  mockRoute.mockReset().mockResolvedValue({ ...AGENT })
  mockApply.mockReset().mockResolvedValue(true)      // Chatwoot assignment succeeds
  mockSendEmail.mockReset().mockResolvedValue(true)  // email provider succeeds
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

// ── One-click handoff (no selector) ───────────────────────────────────────────

describe('one-click button handoff', () => {
  it('a single button call performs the full handoff — no category confirmation step', async () => {
    const result = await requestHumanHandoff({
      conversationId: 42, category: 'general', source: 'button',
      reason: 'Customer clicked “Speak to Human”',
    })
    expect(result.ok).toBe(true)
    expect(result.alreadyRequested).toBe(false)
    expect(mockRoute).toHaveBeenCalledTimes(1)
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockMarkHandover).toHaveBeenCalledWith('42')
  })

  it('button default reason is "Customer clicked “Speak to Human”"', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    const attrCall = fetchCalls.find(c => c.url.includes('/custom_attributes'))
    const body = JSON.parse(String(attrCall!.init?.body))
    expect(body.custom_attributes.handoff_reason).toBe('Customer clicked “Speak to Human”')
  })
})

// ── Context category inference ────────────────────────────────────────────────

describe('inferHandoffCategory', () => {
  const CASES: Array<[string, HandoffCategory]> = [
    ['I need help with my UK visa application',            'visa_support'],
    ['my flight booking to London for December',           'booking_support'],
    ['I paid but the payment failed and I need a refund',  'payment_issue'],
    ['we would like a corporate account partnership',      'partnership'],
    ['this is unacceptable, terrible service',             'complaint'],
    ['hello there',                                        'general'],
    ['',                                                   'general'],
  ]
  for (const [text, expected] of CASES) {
    it(`"${text || '(empty)'}" → ${expected}`, () => {
      expect(inferHandoffCategory(text)).toBe(expected)
    })
  }

  it('complaint outranks topic keywords', () => {
    expect(inferHandoffCategory('my flight booking is a disaster, this is unacceptable')).toBe('complaint')
  })
})

// ── UI control state ──────────────────────────────────────────────────────────

describe('speakToHumanControlState', () => {
  it('button visible in a Jade-owned open chat', () => {
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: false })).toBe('speak_button')
  })
  it('replaced during human ownership', () => {
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: true })).toBe('human_active')
  })
  it('hidden when chat is closed', () => {
    expect(speakToHumanControlState({ chatOpen: false, isHandedOff: false })).toBe('hidden')
  })
  it('returns to speak_button when conversation goes back to Jade', () => {
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: true })).toBe('human_active')
    expect(speakToHumanControlState({ chatOpen: true, isHandedOff: false })).toBe('speak_button')
  })
})

// ── Deterministic category routing ────────────────────────────────────────────

describe('category routing', () => {
  const ROUTES: Array<[HandoffCategory, string]> = [
    ['booking_support', 'booking'],
    ['visa_support',    'visa'],
    ['payment_issue',   'payment'],
    ['complaint',       'complaint'],
    ['partnership',     'partnership'],
    ['general',         'general support'],
  ]
  for (const [category, keyword] of ROUTES) {
    it(`${category} routes deterministically with keyword "${keyword}"`, async () => {
      await requestHumanHandoff({ conversationId: 42, category, source: 'button' })
      expect(mockRoute).toHaveBeenCalledWith('42', keyword, expect.any(String))
    })
  }

  it('category set includes general (no customer-facing selector required)', () => {
    expect(HANDOFF_CATEGORIES.map(c => c.key)).toContain('general')
    expect(isHandoffCategory('general')).toBe(true)
    expect(isHandoffCategory('other')).toBe(false)
  })
})

// ── Staff email notification ──────────────────────────────────────────────────

describe('assigned-staff email', () => {
  it('emails the assigned staff member after successful assignment', async () => {
    await requestHumanHandoff({
      conversationId: 42, category: 'visa_support', source: 'button',
      channel: 'WhatsApp', customerName: 'Rachel Martins',
    })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendEmail.mock.calls[0][0] as Record<string, unknown>
    expect(arg.agentEmail).toBe('p@walztravels.com')
    expect(arg.agentName).toBe('Pricilla')
    expect(arg.customerName).toBe('Rachel Martins')
    expect(arg.channel).toBe('WhatsApp')
    expect(arg.categoryLabel).toBe('Visa Support')
  })

  it('email is sent only AFTER assignment succeeds — failed assignment sends no email', async () => {
    mockApply.mockResolvedValueOnce(false)  // Chatwoot assignment failed
    const result = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(result.ok).toBe(true)            // handoff itself still succeeds
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result.emailStatus).toBe('not_assigned')
  })

  it('no routing decision (router down) sends no email and keeps handoff', async () => {
    mockRoute.mockResolvedValueOnce(null)
    const result = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(result.ok).toBe(true)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('missing staff email → handoff succeeds, HANDOFF_EMAIL_SKIPPED_NO_EMAIL recorded', async () => {
    mockRoute.mockResolvedValueOnce({ ...AGENT, agentEmail: null })
    const result = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(result.ok).toBe(true)
    expect(result.emailStatus).toBe('skipped_no_email')
    expect(mockSendEmail).not.toHaveBeenCalled()
    const audit = mockAuditCreate.mock.calls[0][0] as { data: { detail: string } }
    expect(audit.data.detail).toContain('HANDOFF_EMAIL_SKIPPED_NO_EMAIL')
  })

  it('email provider failure → handoff NOT rolled back, HANDOFF_EMAIL_FAILED recorded', async () => {
    mockSendEmail.mockResolvedValueOnce(false)
    const result = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(result.ok).toBe(true)
    expect(result.assignedAgentName).toBe('Pricilla')
    expect(result.emailStatus).toBe('failed')
    const audit = mockAuditCreate.mock.calls[0][0] as { data: { detail: string } }
    expect(audit.data.detail).toContain('HANDOFF_EMAIL_FAILED')
    // assignment record was never undone
    expect(mockApply).toHaveBeenCalledTimes(1)
  })

  it('router assignment email is suppressed — the handoff sends exactly one notification', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    const opts = mockApply.mock.calls[0][4] as { suppressAssignmentEmail?: boolean }
    expect(opts?.suppressAssignmentEmail).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})

// ── Deduplication: 1 assignment, 1 email ──────────────────────────────────────

describe('deduplication', () => {
  it('button double-click → 1 assignment, 1 email', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    conversationAttrs = { human_handoff_requested: true }  // persisted transition
    const second = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(second.alreadyRequested).toBe(true)
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('button then typed "human" → 1 assignment, 1 email', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'booking_support', source: 'button' })
    conversationAttrs = { human_handoff_requested: true }
    const typed = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'typed' })
    expect(typed.alreadyRequested).toBe(true)
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('webhook retry → 1 assignment, 1 email', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'typed' })
    conversationAttrs = { human_handoff_requested: true }
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'typed' })
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})

// ── Private note ──────────────────────────────────────────────────────────────

describe('private note', () => {
  it('button click note uses the spec format and identifies the button source', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'visa_support', source: 'button' })
    const noteCall = fetchCalls.find(c =>
      c.url.includes('/messages') && String(c.init?.body).includes('Jade → Human Handoff'))
    expect(noteCall).toBeDefined()
    const body = JSON.parse(String(noteCall!.init?.body))
    expect(body.private).toBe(true)  // staff-only, never customer-facing
    expect(body.content).toContain('Reason:\nCustomer clicked “Speak to Human”')
    expect(body.content).toContain('Category:\nVisa Support')
    expect(body.content).toContain('Assigned to:\nPricilla')
    // must NOT claim the customer selected a category
    expect(body.content).not.toContain('selected')
  })

  it('button path never posts a customer-visible message', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    const messageCalls = fetchCalls.filter(c => c.url.includes('/messages') && c.init?.method === 'POST')
    for (const c of messageCalls) {
      expect(JSON.parse(String(c.init?.body)).private).toBe(true)
    }
  })
})

// ── Typed requests — same canonical path ──────────────────────────────────────

describe('typed "speak to a human" detection', () => {
  const MUST_MATCH = [
    'human', 'agent', 'speak to someone', 'talk to someone',
    'I want customer service', 'call me', 'can I speak with staff',
    'speak to a human please', 'talk to an agent', 'I need a real person',
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

  it('typed request uses the same canonical function with identical assignment logic', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'typed' })
    expect(mockRoute).toHaveBeenCalledWith('42', HANDOFF_CATEGORY_MAP.general.routingKeyword, expect.any(String))
    const attrCall = fetchCalls.find(c => c.url.includes('/custom_attributes'))
    const body = JSON.parse(String(attrCall!.init?.body))
    expect(body.custom_attributes.handoff_source).toBe('typed')
    expect(body.custom_attributes.human_handoff_requested).toBe(true)
    // typed requests also email the assigned staff — same path, same rules
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})

// ── Jade silencing + audit ────────────────────────────────────────────────────

describe('post-handoff state', () => {
  it('Jade stops replying after assignment (markHandover called)', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(mockMarkHandover).toHaveBeenCalledWith('42')
  })

  it('records an audit event', async () => {
    await requestHumanHandoff({ conversationId: 42, category: 'payment_issue', source: 'button' })
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    const arg = mockAuditCreate.mock.calls[0][0] as { data: { action: string; detail: string } }
    expect(arg.data.action).toBe('Jade Human Handoff')
    expect(arg.data.detail).toContain('conv 42')
    expect(arg.data.detail).toContain('Payment Issue')
  })

  it('handoff still records state + note + audit when routing throws', async () => {
    mockRoute.mockRejectedValueOnce(new Error('router down'))
    const result = await requestHumanHandoff({ conversationId: 42, category: 'general', source: 'button' })
    expect(result.ok).toBe(true)
    expect(result.assignedAgentName).toBeNull()
    expect(fetchCalls.some(c => c.url.includes('/custom_attributes'))).toBe(true)
    expect(fetchCalls.some(c => String(c.init?.body ?? '').includes('Jade → Human Handoff'))).toBe(true)
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
