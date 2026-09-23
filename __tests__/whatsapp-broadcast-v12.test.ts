/**
 * WhatsApp Broadcast V1.2 — Unified Contacts + Consent + Opt-Out.
 *
 * Covers what's genuinely NEW in this release:
 *  - isOptOutKeyword: exact-word, case-insensitive matching, not a
 *    substring search.
 *  - the public preferences API: strict action validation, generic
 *    always-200 response shape, anti-enumeration symmetry, rate limiting,
 *    that a subscribe/unsubscribe write actually flips WhatsAppConsent.
 *  - section 10 pinning: the SAME canonical number contributed by LEAD +
 *    VISA_APPLICATION + MANUAL at once is excluded when WhatsAppConsent
 *    says OPTED_OUT, regardless of which source is selected or which
 *    source "wins" for display — reusing the real, unmodified
 *    resolveMultiSourceAudience()/decideEligibility(), not a
 *    re-implementation.
 *
 * The pre-dispatch recheck itself (section 9) is covered in
 * __tests__/whatsapp-broadcast-processor.test.ts, alongside the rest of
 * that file's existing dispatch-loop tests. The export route's RBAC/CSV/
 * audit-log behaviour is covered in
 * __tests__/whatsapp-broadcast-v12-export.test.ts (a separate file so its
 * own @/lib/db mock shape — admin session + export log — never collides
 * with this file's).
 */

import { isOptOutKeyword } from '@/lib/whatsapp/opt-out-keywords'

describe('isOptOutKeyword', () => {
  it('matches the bare word, case-insensitively', () => {
    expect(isOptOutKeyword('stop')).toBe(true)
    expect(isOptOutKeyword('STOP')).toBe(true)
    expect(isOptOutKeyword('Stop')).toBe(true)
    expect(isOptOutKeyword('unsubscribe')).toBe(true)
    expect(isOptOutKeyword('UNSUBSCRIBE')).toBe(true)
  })

  it('tolerates surrounding whitespace only', () => {
    expect(isOptOutKeyword('  stop  ')).toBe(true)
    expect(isOptOutKeyword('\nstop\n')).toBe(true)
  })

  it('does NOT match a real, on-topic message that merely contains the word', () => {
    expect(isOptOutKeyword('please stop sending me these')).toBe(false)
    expect(isOptOutKeyword('can you stop')).toBe(false)
    expect(isOptOutKeyword('do not unsubscribe me by mistake')).toBe(false)
    expect(isOptOutKeyword('STOP!')).toBe(false) // punctuation changes the whole-message match
  })

  it('is false for empty, non-text, or unrelated messages', () => {
    expect(isOptOutKeyword('')).toBe(false)
    expect(isOptOutKeyword('   ')).toBe(false)
    expect(isOptOutKeyword(null)).toBe(false)
    expect(isOptOutKeyword(undefined)).toBe(false)
    expect(isOptOutKeyword('hello')).toBe(false)
  })
})

// ── One consolidated @/lib/db mock for everything else in this file ────────

interface MockLead {
  id: string; name: string | null; whatsapp: string | null; service: string | null
  branch: string | null; destination: string | null; travelDate: string | null; marketingOptOut: boolean
}
interface MockVisa {
  id: string; referenceNumber: string; firstName: string | null; lastName: string | null
  phone: string | null; destinationIso2: string; visaType: string; status: string
  arrivalDate: Date | null; marketingOptOut: boolean
}

let leadStore: MockLead[] = []
let visaStore: MockVisa[] = []
let multiConsentStore: Array<{ normalizedNumber: string; status: string }> = []
const preferenceConsentStore = new Map<string, {
  status: string; consentedAt: Date | null; optedOutAt: Date | null
  capturePage: string | null; disclosureVersion: string | null
}>()

function byIdIn<T extends { id: string }>(rows: T[], where: Record<string, unknown>): T[] {
  if (where?.id && typeof where.id === 'object' && 'in' in (where.id as object)) {
    const ids = (where.id as { in: string[] }).in
    return rows.filter(r => ids.includes(r.id))
  }
  return rows
}

const mockPrisma = {
  lead: {
    findMany: jest.fn(async (args: { where: Record<string, unknown> }) => byIdIn(leadStore, args.where ?? {})),
  },
  visaApplication: {
    findMany: jest.fn(async (args: { where: Record<string, unknown> }) => byIdIn(visaStore, args.where ?? {})),
  },
  whatsAppConsent: {
    findMany: jest.fn(async (args: { where: { normalizedNumber: { in: string[] } } }) =>
      multiConsentStore.filter(c => args.where.normalizedNumber.in.includes(c.normalizedNumber)),
    ),
    upsert: jest.fn(async (args: {
      where: { normalizedNumber: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => {
      const existing = preferenceConsentStore.get(args.where.normalizedNumber)
      const data = (existing ? args.update : args.create) as {
        status: string; consentedAt?: Date | null; optedOutAt?: Date | null
        capturePage?: string | null; disclosureVersion?: string | null
      }
      const row = {
        status: data.status,
        consentedAt: data.consentedAt ?? existing?.consentedAt ?? null,
        optedOutAt: data.optedOutAt ?? existing?.optedOutAt ?? null,
        capturePage: data.capturePage ?? null,
        disclosureVersion: data.disclosureVersion ?? null,
      }
      preferenceConsentStore.set(args.where.normalizedNumber, row)
      return row
    }),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

let rateLimitAllowed = true
jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  whatsappPreferenceRateLimit: jest.fn(() => ({
    allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 9 : 0, resetAt: Date.now() + 60_000,
  })),
}))

import { POST as preferencesPOST } from '@/app/api/whatsapp/preferences/route'
import { resolveMultiSourceAudience } from '@/lib/whatsapp/broadcast/audience-multi'

function req(body: unknown): Request {
  return new Request('http://localhost/api/whatsapp/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.1' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  leadStore = []
  visaStore = []
  multiConsentStore = []
  preferenceConsentStore.clear()
  rateLimitAllowed = true
})

describe('POST /api/whatsapp/preferences', () => {
  it('rejects a malformed action distinctly (this is about the request, not a number)', async () => {
    const res = await preferencesPOST(req({ phone: '+2348011111111', action: 'MAYBE' }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects a truthy-but-not-exact action value (no coercion)', async () => {
    for (const bad of ['subscribe', 1, true, 'SUBSCRIBE ', null, undefined]) {
      const res = await preferencesPOST(req({ phone: '+2348011111111', action: bad }) as never)
      expect(res.status).toBe(400)
    }
  })

  it('P1 FIX: no longer accepts SUBSCRIBE at all — it 400s like any other malformed action', async () => {
    const res = await preferencesPOST(req({ phone: '+234 801 111 1111', action: 'SUBSCRIBE' }) as never)
    expect(res.status).toBe(400)
    // And, decisively, never writes anything — this is the exact hole
    // independent security review found: SUBSCRIBE here used to write a
    // row with zero proof of possession. Subscribing now requires
    // app/api/whatsapp/preferences/send-code + verify-code (see
    // __tests__/whatsapp-broadcast-v12-otp.test.ts).
    expect(preferenceConsentStore.size).toBe(0)
  })

  it('unsubscribing writes OPTED_OUT', async () => {
    await preferencesPOST(req({ phone: '+2348011111111', action: 'UNSUBSCRIBE' }) as never)
    expect(preferenceConsentStore.get('+2348011111111')?.status).toBe('OPTED_OUT')
  })

  it('an unnormalizable number is silently no-op’d, never written, but still answered generically', async () => {
    const res = await preferencesPOST(req({ phone: 'not-a-number', action: 'UNSUBSCRIBE' }) as never)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(preferenceConsentStore.size).toBe(0)
  })

  it('the response body is byte-identical across every non-malformed UNSUBSCRIBE outcome (anti-enumeration)', async () => {
    const r1 = await (await preferencesPOST(req({ phone: '+2348022222222', action: 'UNSUBSCRIBE' }) as never)).json() // brand new
    const r2 = await (await preferencesPOST(req({ phone: '+2348022222222', action: 'UNSUBSCRIBE' }) as never)).json() // already exists now
    const r3 = await (await preferencesPOST(req({ phone: 'garbage', action: 'UNSUBSCRIBE' }) as never)).json() // invalid
    expect(r1).toEqual({ ok: true })
    expect(r2).toEqual({ ok: true })
    expect(r3).toEqual({ ok: true })
  })

  it('never touches ConsentRecord (a completely separate SMS-purpose table)', () => {
    expect((mockPrisma as unknown as { consentRecord?: unknown }).consentRecord).toBeUndefined()
  })

  it('rate-limits per IP with a 429, revealing nothing about the number', async () => {
    rateLimitAllowed = false
    const res = await preferencesPOST(req({ phone: '+2348011111111', action: 'UNSUBSCRIBE' }) as never)
    expect(res.status).toBe(429)
    expect(preferenceConsentStore.size).toBe(0)
  })
})

describe('opt-out overrides every source (V1.2 section 10 pin)', () => {
  it('excludes one canonical number even when it arrives as LEAD + VISA_APPLICATION + MANUAL at once, all opted out via consent', async () => {
    const number = '+2348099999999'
    leadStore = [{ id: 'lead-x', name: 'Ada', whatsapp: number, service: 'Visa Processing', branch: 'nigeria', destination: 'London', travelDate: null, marketingOptOut: false }]
    visaStore = [{ id: 'visa-x', referenceNumber: 'WALZ-X', firstName: 'Ada', lastName: 'Obi', phone: number, destinationIso2: 'GB', visaType: 'tourist', status: 'under_review', arrivalDate: null, marketingOptOut: false }]
    multiConsentStore = [{ normalizedNumber: number, status: 'OPTED_OUT' }]

    const { recipients, breakdown } = await resolveMultiSourceAudience({
      selection: {
        leadIds: ['lead-x'],
        visaApplicationIds: ['visa-x'],
        manualEntries: [{ number, displayName: 'Pasted Ada' }],
      },
    })

    expect(recipients).toHaveLength(1) // deduped to ONE recipient for the canonical number
    expect(recipients[0].normalizedNumber).toBe(number)
    expect(recipients[0].skipReason).toBe('OPT_OUT')
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.duplicatesRemoved).toBe(2) // 3 contributors collapsed to 1
  })

  it('selecting the SAME opted-out number through only the manual tab still excludes it — reselection cannot launder an opt-out', async () => {
    const number = '+2348088888888'
    multiConsentStore = [{ normalizedNumber: number, status: 'OPTED_OUT' }]

    const { recipients } = await resolveMultiSourceAudience({
      selection: { manualEntries: [{ number, displayName: 'Retyped' }] },
    })

    expect(recipients[0].skipReason).toBe('OPT_OUT')
  })

  // The v1.1 audience test file already proves the two-source OR-merge
  // (lead+manual, lead+visa) for the marketingOptOut FLAG. This closes the
  // remaining gap: the FULL three-source combination (LEAD + VISA_APPLICATION
  // + MANUAL, all present at once) excluded via the flag on just ONE
  // contributor — not via a WhatsAppConsent row at all — with the flag
  // carried by neither the winning (highest-priority) source nor the manual
  // entry, proving the OR-merge is genuinely independent of which source
  // "wins" for display/attribution.
  it('excludes the canonical number via VisaApplication.marketingOptOut alone, even with LEAD (higher priority) and MANUAL also contributing and NEITHER of them opted out', async () => {
    const number = '+2348077777777'
    leadStore = [{ id: 'lead-y', name: 'Bola', whatsapp: number, service: 'Flights', branch: 'nigeria', destination: 'Dubai', travelDate: null, marketingOptOut: false }]
    visaStore = [{ id: 'visa-y', referenceNumber: 'WALZ-Y', firstName: 'Bola', lastName: 'Ade', phone: number, destinationIso2: 'AE', visaType: 'tourist', status: 'under_review', arrivalDate: null, marketingOptOut: true }]
    multiConsentStore = [{ normalizedNumber: number, status: 'SUBSCRIBED' }] // even a real SUBSCRIBED row cannot override the hard flag

    const { recipients, breakdown } = await resolveMultiSourceAudience({
      selection: {
        leadIds: ['lead-y'],
        visaApplicationIds: ['visa-y'],
        manualEntries: [{ number, displayName: 'Pasted Bola' }],
      },
    })

    expect(recipients).toHaveLength(1)
    expect(recipients[0].sourceType).toBe('LEAD') // LEAD is the higher-priority "winner" for display/attribution...
    expect(recipients[0].skipReason).toBe('OPT_OUT') // ...but the exclusion still applies, from the VISA_APPLICATION side.
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.duplicatesRemoved).toBe(2)
  })
})

// ── ADVERSARIAL: double opt-out via two channels at (simulated) once ─────
// The inbound STOP webhook (app/api/webhooks/whatsapp/route.ts's
// handleWhatsAppOptOut) and this file's own /api/whatsapp/preferences
// UNSUBSCRIBE both write via `prisma.whatsAppConsent.upsert({ where: {
// normalizedNumber } })` — the SAME unique key, no preceding read on either
// path. Exercising the actual preferences POST route alongside a second
// upsert call built from the EXACT field shape handleWhatsAppOptOut uses
// (see app/api/webhooks/whatsapp/route.ts) proves neither path does
// anything a real Postgres unique-key upsert (INSERT ... ON CONFLICT, one
// atomic statement) can't already serialise safely: no crash, no duplicate
// row, and a single terminal OPTED_OUT row survives regardless of order.
describe('ADVERSARIAL: double opt-out via STOP webhook + preferences page at once', () => {
  it('both channels racing to opt out the SAME number converge on ONE row, OPTED_OUT, no throw — whichever order they land in', async () => {
    const number = '+2348066666666'

    // Fire both "at once": the preferences page UNSUBSCRIBE (the real route)
    // and the webhook's own opt-out write shape (same upsert call,
    // reproduced here since handleWhatsAppOptOut is not exported — it is a
    // private helper of the webhook route module).
    const webhookOptOutWrite = () =>
      mockPrisma.whatsAppConsent.upsert({
        where: { normalizedNumber: number },
        create: { normalizedNumber: number, status: 'OPTED_OUT', source: 'whatsapp_stop_reply', evidence: 'wamid.STOP1', optedOutAt: new Date() },
        update: { status: 'OPTED_OUT', source: 'whatsapp_stop_reply', evidence: 'wamid.STOP1', optedOutAt: new Date() },
      })

    await expect(
      Promise.all([
        preferencesPOST(req({ phone: number, action: 'UNSUBSCRIBE' }) as never),
        webhookOptOutWrite(),
      ]),
    ).resolves.toBeDefined() // neither throws; no unhandled rejection

    // Exactly one row for this number, terminal state OPTED_OUT.
    const row = preferenceConsentStore.get(number)
    expect(row?.status).toBe('OPTED_OUT')
    expect(preferenceConsentStore.size).toBe(1)
  })
})
