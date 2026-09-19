/**
 * Client Profile Completeness (Client Action Centre — shared layer).
 *
 * Originated as a Request Payment fix (staff had no way to add a missing
 * name/email/phone when Paystack bank transfer rejected a client for
 * MISSING_CLIENT_CONTACT) but elevated into ONE shared layer
 * (lib/inbox/client-profile.ts + lib/action-centre/client-profile.ts) that
 * Request Payment, Create Quote, and Visa Form all now use, so a client's
 * PROFILE completeness ("do we have the data this action needs?") is never
 * conflated with their IDENTITY state ("who is this customer?" — VERIFIED/
 * LINKED/HEURISTIC/UNRESOLVED, unchanged and untouched by this file).
 *
 * Covers: canonical contact resolution + precedence, provider/action
 * requirement profiles, the shared mutation's identity gate + conflict
 * detection + Lead.whatsapp identity-key guard, the shared route's RBAC
 * and browser-id-immunity, and composition with createPaymentRequest.
 */

import fs from 'fs'
import path from 'path'

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  clientAccount: { findUnique: jest.fn(), update: jest.fn() },
  lead: { findUnique: jest.fn(), update: jest.fn() },
}
const mockResolve = jest.fn()
const mockDeriveChannel = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/inbox/client-context', () => ({
  resolveClientActionContext: (...a: unknown[]) => mockResolve(...a),
}))
jest.mock('@/lib/inbox/client-identity', () => ({
  deriveChannelIdentity: (...a: unknown[]) => mockDeriveChannel(...a),
}))

import {
  resolveCanonicalContact, evaluateProfileCompleteness,
  type CanonicalContactResult,
} from '@/lib/inbox/client-profile'
import { updateClientProfile } from '@/lib/action-centre/client-profile'
import { PAYMENT_PROVIDER_REQUIREMENTS, createPaymentRequest } from '@/lib/action-centre/payment-request'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const profileLib = read('lib/inbox/client-profile.ts')
const profileService = read('lib/action-centre/client-profile.ts')
const profileRoute = read('app/api/admin/inbox/conversations/[id]/client-profile/route.ts')

const SESSION = { email: 'staff@walztravels.com', role: 'staff', permissions: { inbox_view: true, inbox_assign: true } } as never

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue({ phone: null })
  mockPrisma.clientAccount.findUnique.mockResolvedValue({ phone: null })
  mockPrisma.lead.findUnique.mockResolvedValue({ whatsapp: null })
  mockPrisma.user.update.mockResolvedValue({})
  mockPrisma.clientAccount.update.mockResolvedValue({})
  mockPrisma.lead.update.mockResolvedValue({})
  mockDeriveChannel.mockResolvedValue({ sourceId: 'inbox-conv-318', whatsapp: null })
})

// ── Provider/action requirement profiles ────────────────────────────────────

describe('provider-specific requirements (evaluateProfileCompleteness)', () => {
  const EMPTY: CanonicalContactResult = { fields: { name: null, email: null, phone: null }, target: null, crossRecordConflicts: [] }
  const FULL: CanonicalContactResult = {
    fields: {
      name: { value: 'Ama Mensah', source: 'contact' },
      email: { value: 'ama@example.com', source: 'contact' },
      phone: { value: '+233554000000', source: 'contact' },
    },
    target: null, crossRecordConflicts: [],
  }

  it('stripe and flutterwave report ZERO missing fields regardless of contact completeness', () => {
    expect(evaluateProfileCompleteness(EMPTY, PAYMENT_PROVIDER_REQUIREMENTS.stripe).missingFields).toEqual([])
    expect(evaluateProfileCompleteness(EMPTY, PAYMENT_PROVIDER_REQUIREMENTS.flutterwave).missingFields).toEqual([])
    expect(evaluateProfileCompleteness(FULL, PAYMENT_PROVIDER_REQUIREMENTS.flutterwave).missingFields).toEqual([])
  })

  it('paystack_va + missing email only → missingFields exactly ["email"]', () => {
    const canonical = { ...FULL, fields: { ...FULL.fields, email: null } }
    const c = evaluateProfileCompleteness(canonical, PAYMENT_PROVIDER_REQUIREMENTS.paystack_va)
    expect(c.missingFields).toEqual(['email'])
  })

  it('paystack_va + missing phone only → missingFields exactly ["phone"]', () => {
    const canonical = { ...FULL, fields: { ...FULL.fields, phone: null } }
    const c = evaluateProfileCompleteness(canonical, PAYMENT_PROVIDER_REQUIREMENTS.paystack_va)
    expect(c.missingFields).toEqual(['phone'])
  })

  it('paystack_va + both missing (name present) → missingFields exactly ["email","phone"], in that order', () => {
    const canonical = { ...FULL, fields: { ...FULL.fields, email: null, phone: null } }
    const c = evaluateProfileCompleteness(canonical, PAYMENT_PROVIDER_REQUIREMENTS.paystack_va)
    expect(c.missingFields).toEqual(['email', 'phone'])
    expect(c.availableFields.name).toBe('Ama Mensah')
  })

  it('paystack_va + everything present → complete', () => {
    expect(evaluateProfileCompleteness(FULL, PAYMENT_PROVIDER_REQUIREMENTS.paystack_va).complete).toBe(true)
  })

  // QA gap fix: crossRecordConflicts threaded through evaluateProfileCompleteness.
  it('the common/empty case is byte-identical to before the fix — crossRecordConflicts is [] and nothing else changes', () => {
    const c = evaluateProfileCompleteness(FULL, PAYMENT_PROVIDER_REQUIREMENTS.paystack_va)
    expect(c).toEqual({
      complete: true,
      missingFields: [],
      availableFields: { name: 'Ama Mensah', email: 'ama@example.com', phone: '+233554000000' },
      crossRecordConflicts: [],
    })
  })

  it('a genuine cross-record conflict on the canonical contact is threaded straight through, unmodified', () => {
    const conflicted: CanonicalContactResult = {
      fields: { name: { value: 'Ama', source: 'user' }, email: null, phone: { value: '+233554000000', source: 'contact' } },
      target: { kind: 'user', id: 'u1' },
      crossRecordConflicts: [{ field: 'email', values: { user: 'user-a@example.com', clientAccount: 'account-b@example.com' } }],
    }
    const c = evaluateProfileCompleteness(conflicted, ['name', 'email'])
    expect(c.crossRecordConflicts).toEqual([
      { field: 'email', values: { user: 'user-a@example.com', clientAccount: 'account-b@example.com' } },
    ])
    // The conflicted field is correctly reported missing (never a guessed
    // winner) alongside the distinct conflict signal — both must be present.
    expect(c.missingFields).toEqual(['email'])
  })
})

// ── Canonical precedence + cross-record conflicts ───────────────────────────

describe('resolveCanonicalContact — precedence and conflicts', () => {
  it('an existing Chatwoot-derived phone is reflected as present when no linked record overrides it', async () => {
    const ctx = {
      contact: { name: null, email: null, phone: '+2348031234567' },
      user: null, clientAccount: null, prismaLead: null,
    } as never
    const canonical = await resolveCanonicalContact(ctx)
    expect(canonical.fields.phone).toEqual({ value: '+2348031234567', source: 'contact' })
    expect(canonical.target).toBeNull()
  })

  it('a linked record field outranks Chatwoot when both are present (user > contact)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+2348031234567' })
    const ctx = {
      contact: { name: 'Chatwoot Name', email: 'chatwoot@example.com', phone: '+15550001111' },
      user: { id: 'u1', name: 'Real Name', email: 'real@example.com' },
      clientAccount: null, prismaLead: null,
    } as never
    const canonical = await resolveCanonicalContact(ctx)
    expect(canonical.fields.name).toEqual({ value: 'Real Name', source: 'user' })
    expect(canonical.fields.email).toEqual({ value: 'real@example.com', source: 'user' })
    expect(canonical.fields.phone).toEqual({ value: '+2348031234567', source: 'user' })
    expect(canonical.target).toEqual({ kind: 'user', id: 'u1' })
  })

  it('user outranks clientAccount when both are (defensively) linked and they AGREE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phone: null })
    mockPrisma.clientAccount.findUnique.mockResolvedValue({ phone: '+2348031234567' })
    const ctx = {
      contact: null,
      user: { id: 'u1', name: 'Ama', email: 'ama@example.com' },
      clientAccount: { id: 'c1', name: 'Ama', email: 'ama@example.com' },
      prismaLead: null,
    } as never
    const canonical = await resolveCanonicalContact(ctx)
    expect(canonical.target).toEqual({ kind: 'user', id: 'u1' })
    expect(canonical.crossRecordConflicts).toEqual([])
  })

  it('a genuine cross-record DISAGREEMENT is surfaced, never silently resolved by picking a winner', async () => {
    const ctx = {
      contact: null,
      user: { id: 'u1', name: 'Ama', email: 'user-a@example.com' },
      clientAccount: { id: 'c1', name: 'Ama', email: 'account-b@example.com' },
      prismaLead: null,
    } as never
    const canonical = await resolveCanonicalContact(ctx)
    expect(canonical.fields.email).toBeNull()
    expect(canonical.crossRecordConflicts).toEqual([
      { field: 'email', values: { user: 'user-a@example.com', clientAccount: 'account-b@example.com' } },
    ])
  })

  it('no linked record at all (e.g. an OTP-verified visaApplicationId-only link) → target is null', async () => {
    const ctx = { contact: { name: null, email: null, phone: null }, user: null, clientAccount: null, prismaLead: null } as never
    const canonical = await resolveCanonicalContact(ctx)
    expect(canonical.target).toBeNull()
  })
})

// ── updateClientProfile — identity gate ─────────────────────────────────────

function ctxFor(over: Record<string, unknown>) {
  return {
    ok: true,
    context: {
      resolution: 'LINKED',
      contact: { name: null, email: null, phone: null },
      user: null, clientAccount: null, prismaLead: null,
      ...over,
    },
  }
}

describe('updateClientProfile — identity invariant', () => {
  it('UNRESOLVED → CLIENT_IDENTITY_REQUIRED, nothing written', async () => {
    mockResolve.mockResolvedValue(ctxFor({ resolution: 'UNRESOLVED', user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'ama@example.com' })
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('HEURISTIC → CLIENT_IDENTITY_REQUIRED, nothing written', async () => {
    mockResolve.mockResolvedValue(ctxFor({ resolution: 'HEURISTIC', user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'ama@example.com' })
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('resolver denial (401/403) → CLIENT_IDENTITY_REQUIRED', async () => {
    mockResolve.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'ama@example.com' })
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
  })

  it('VERIFIED with no linked User/ClientAccount/Lead (application-only OTP link) → NO_LINKED_RECORD', async () => {
    mockResolve.mockResolvedValue(ctxFor({ resolution: 'VERIFIED' }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+2348031234567' })
    expect(res).toMatchObject({ ok: false, code: 'NO_LINKED_RECORD' })
    expect(mockPrisma.lead.update).not.toHaveBeenCalled()
  })

  it('VERIFIED with a linked record → allowed (VERIFIED is authoritative, same as every other Action Centre feature)', async () => {
    mockResolve.mockResolvedValue(ctxFor({ resolution: 'VERIFIED', user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'ama@example.com' })
    expect(res.ok).toBe(true)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { email: 'ama@example.com' } })
  })

  it('First-time LINKED client (UX-4.1C create_new → Lead) → fills the missing field on the Lead', async () => {
    mockResolve.mockResolvedValue(ctxFor({ resolution: 'LINKED', prismaLead: { id: 'lead1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'ama@example.com' })
    expect(res).toMatchObject({ ok: true, fields: { email: 'ama@example.com' } })
    expect(mockPrisma.lead.update).toHaveBeenCalledWith({ where: { id: 'lead1' }, data: { email: 'ama@example.com' } })
  })

  it('Legacy LINKED client (UX-4.1C link_existing → User) → fills the missing field on the User', async () => {
    mockResolve.mockResolvedValue(ctxFor({ resolution: 'LINKED', user: { id: 'u9', name: 'Kojo', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'kojo@example.com' })
    expect(res).toMatchObject({ ok: true, fields: { email: 'kojo@example.com' } })
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'u9' }, data: { email: 'kojo@example.com' } })
  })
})

// ── updateClientProfile — validation, conflicts, identity-key guard ────────

describe('updateClientProfile — validation and conflicts', () => {
  it('malformed email is rejected server-side — nothing written', async () => {
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'not-an-email' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('malformed/incomplete phone is rejected server-side — nothing written', async () => {
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '123' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('a PSID-shaped "phone" is rejected, never accepted as a real number', async () => {
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+1234567890123456' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('a field that already has a DIFFERENT value → CONTACT_CONFLICT, nothing overwritten', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phone: null })
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: 'existing@example.com' } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'different@example.com' })
    expect(res).toMatchObject({
      ok: false, code: 'CONTACT_CONFLICT',
      conflicts: [{ field: 'email', existing: 'existing@example.com', attempted: 'different@example.com' }],
    })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('re-submitting the SAME value that is already on file is a no-op success, not a conflict', async () => {
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: 'same@example.com' } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, email: 'same@example.com' })
    expect(res).toMatchObject({ ok: true, fields: { email: 'same@example.com' } })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('security fix: a legacy-format existing phone matching the same real number submitted in E.164 is a no-op success, not CONTACT_CONFLICT', async () => {
    // lib/identity/normalize.ts's normalizePhoneE164: a leading international
    // '00' prefix (rather than '+') is converted to '+', and all punctuation
    // is stripped either way — so a DB value stored as '002348031234567'
    // (legacy format, no '+') and a staff-submitted '+2348031234567' (E.164)
    // both normalize to the exact same '+2348031234567'. Before the fix,
    // only the SUBMITTED side was normalized (existing.value !== normalizedPhone
    // compared the raw '002348031234567' against '+2348031234567' — always a
    // mismatch), so a real client resubmitting their own number in the
    // canonical format would be spuriously blocked as a CONTACT_CONFLICT.
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: 'ama@example.com' } }))
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '002348031234567' })
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+2348031234567' })
    expect(res).toMatchObject({ ok: true, fields: { phone: '002348031234567' } })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('a genuinely DIFFERENT phone number (not just a formatting difference) still correctly reports CONTACT_CONFLICT — the fix narrows false positives, it does not disable the guard', async () => {
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: 'ama@example.com' } }))
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+2348031234567' })
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+2349999999999' })
    expect(res).toMatchObject({
      ok: false, code: 'CONTACT_CONFLICT',
      conflicts: [{ field: 'phone', existing: '+2348031234567', attempted: '+2349999999999' }],
    })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('Lead.whatsapp identity-key guard: a staff-typed phone contradicting the conversation’s OWN channel phone → CONTACT_CONFLICT, nothing written', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ whatsapp: null })
    mockDeriveChannel.mockResolvedValue({ sourceId: '+2348030000000', whatsapp: '+2348030000000' })
    mockResolve.mockResolvedValue(ctxFor({ prismaLead: { id: 'lead1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+2349999999999' })
    expect(res).toMatchObject({
      ok: false, code: 'CONTACT_CONFLICT',
      conflicts: [{ field: 'phone', existing: '+2348030000000', attempted: '+2349999999999' }],
    })
    expect(mockPrisma.lead.update).not.toHaveBeenCalled()
  })

  it('Lead.whatsapp: a staff-typed phone that MATCHES the channel phone (or no channel phone exists) is written', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ whatsapp: null })
    mockDeriveChannel.mockResolvedValue({ sourceId: 'inbox-conv-318', whatsapp: null })
    mockResolve.mockResolvedValue(ctxFor({ prismaLead: { id: 'lead1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+2349999999999' })
    expect(res).toMatchObject({ ok: true, fields: { phone: '+2349999999999' } })
    expect(mockPrisma.lead.update).toHaveBeenCalledWith({ where: { id: 'lead1' }, data: { whatsapp: '+2349999999999' } })
  })

  it('no field supplied at all → INVALID_INPUT', async () => {
    mockResolve.mockResolvedValue(ctxFor({ user: { id: 'u1', name: 'Ama', email: null } }))
    const res = await updateClientProfile({ session: SESSION, conversationId: 318 })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
  })
})

// ── Composition: profile fix unblocks payment generation ───────────────────

describe('composition: updateClientProfile → createPaymentRequest', () => {
  it('after a successful contact update, a subsequent createPaymentRequest with the now-complete contact succeeds', async () => {
    // Step 1: paystack_va is missing phone only — fix it via the shared mutation.
    mockResolve.mockResolvedValue(ctxFor({
      resolution: 'VERIFIED',
      user: { id: 'u1', name: 'Ama Mensah', email: 'ama@example.com' },
    }))
    mockPrisma.user.findUnique.mockResolvedValue({ phone: null })
    const patch = await updateClientProfile({ session: SESSION, conversationId: 318, phone: '+2348031234567' })
    expect(patch.ok).toBe(true)

    // Step 2: re-resolution now reflects the completed profile (as it would
    // in production once the User row is actually updated) — createPaymentRequest
    // composes cleanly with it.
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+2348031234567' })
    mockResolve.mockResolvedValue(ctxFor({
      resolution: 'VERIFIED',
      user: { id: 'u1', name: 'Ama Mensah', email: 'ama@example.com' },
    }))
    global.fetch = jest.fn(async (url: string) => ({
      json: async () => String(url).includes('/dedicated_account')
        ? { status: true, data: { account_number: '0012345678', bank: { name: 'Wema Bank' } } }
        : { status: true, data: { customer_code: 'CUS_1', phone: '+2348031234567' } },
    })) as unknown as typeof fetch
    process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_ps_test'

    // createPaymentRequest itself needs a mocked prisma.paymentLink — build a
    // minimal one inline since this describe block's mockPrisma is scoped to
    // user/clientAccount/lead only.
    const originalPaymentLink = (mockPrisma as unknown as { paymentLink?: unknown }).paymentLink
    ;(mockPrisma as unknown as { paymentLink: Record<string, jest.Mock> }).paymentLink = {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'pl1', createdAt: new Date(), accountNumber: null, bankName: null, paymentUrl: null, ...data,
      })),
    }

    const res = await createPaymentRequest({
      session: SESSION as never, conversationId: 318,
      amountMajor: 450000, currency: 'NGN', purpose: 'visa_service', provider: 'paystack_va',
      idempotencyKey: 'composition-key-1',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.request.accountNumber).toBe('0012345678')
    }
    ;(mockPrisma as unknown as { paymentLink?: unknown }).paymentLink = originalPaymentLink
  })
})

// ── No commercial action is ever triggered by a profile update ─────────────

describe('a profile update never performs a commercial action', () => {
  it('the service imports no messaging/send/webhook/provider module', () => {
    expect(profileService).not.toMatch(/from ['"].*(webhooks|stripe|flutterwave|paystack|composer|send-message)/i)
    expect(profileService).not.toContain('fetch(')
  })
  it('the route imports no messaging/provider module either', () => {
    expect(profileRoute).not.toMatch(/from ['"].*(webhooks|stripe|flutterwave|paystack)/i)
  })
  it('the shared canonical-resolution module is pure identity/profile logic only — no fetch, no provider calls', () => {
    expect(profileLib).not.toContain('fetch(')
  })
})

// ── Route: RBAC chain + browser-id immunity ─────────────────────────────────

describe('client-profile route', () => {
  it('full auth chain: session → inbox_view → conversation access → inbox_assign → rate limit', () => {
    const sessionIdx = profileRoute.indexOf('getAdminSession')
    const invIdx = profileRoute.indexOf("checkInboxPermission(session, 'inbox_view')")
    const accessIdx = profileRoute.indexOf('checkConversationAccess(session, params.id)')
    const assignIdx = profileRoute.indexOf("checkInboxPermission(session, 'inbox_assign')")
    const rlIdx = profileRoute.indexOf('rateLimit({ key: `client-profile:')
    const svcIdx = profileRoute.indexOf('await updateClientProfile(')
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(sessionIdx).toBeLessThan(invIdx)
    expect(invIdx).toBeLessThan(accessIdx)
    expect(accessIdx).toBeLessThan(assignIdx)
    expect(assignIdx).toBeLessThan(rlIdx)
    expect(rlIdx).toBeLessThan(svcIdx)
  })

  it('the body destructuring accepts ONLY name/email/phone — no id field of any kind', () => {
    const bodyBlock = profileRoute.slice(profileRoute.indexOf('let body:'), profileRoute.indexOf('const result ='))
    expect(bodyBlock).toContain("body.name")
    expect(bodyBlock).toContain("body.email")
    expect(bodyBlock).toContain("body.phone")
    expect(bodyBlock).not.toMatch(/body\.(userId|clientAccountId|leadId|applicationId|id)\b/)
  })

  it('status mapping: identity 403, conflict/no-linked-record 409, persist failure 500, else 400', () => {
    expect(profileRoute).toContain("result.code === 'CLIENT_IDENTITY_REQUIRED' ? 403")
    expect(profileRoute).toContain("result.code === 'CONTACT_CONFLICT' ? 409")
    expect(profileRoute).toContain("result.code === 'NO_LINKED_RECORD' ? 409")
    expect(profileRoute).toContain("result.code === 'PERSIST_FAILED' ? 500")
  })

  it('conversationId comes from the URL path only (params.id), never the body', () => {
    expect(profileRoute).toContain('parseConversationId(params.id)')
    expect(profileRoute).not.toMatch(/body\.conversationId/)
  })
})

describe('updateClientProfile input type accepts no identity field (source pin)', () => {
  it('UpdateClientProfileInput carries only session/conversationId/name/email/phone', () => {
    const iface = profileService.slice(
      profileService.indexOf('export interface UpdateClientProfileInput'),
      profileService.indexOf('export async function updateClientProfile'),
    )
    expect(iface).not.toMatch(/\b(userId|clientAccountId|leadId|prismaLeadId|applicationId)\s*[?:]/)
  })
})
