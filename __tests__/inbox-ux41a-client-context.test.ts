/**
 * INBOX UX-4.1A — Client Action Centre foundation.
 *
 * Covers:
 *  - identity normalization primitives (email, E.164, PSID detection)
 *  - resolver fail-closed order (authz → link table → heuristics; multiple
 *    candidates collapse to UNRESOLVED; no phone-tail matching anywhere)
 *  - client-context route: auth before resolution; POST re-verifies the
 *    verification server-side and ignores browser-supplied application ids
 *  - persist-on-verify is additive + failure-tolerant (verification never
 *    fails because a link write failed)
 *  - ClientInfo identity panel states + preserved UX-2 pins
 *  - migration SQL + Prisma model house conventions
 */

import fs from 'fs'
import path from 'path'

// Prisma is only needed by lib/inbox/client-link — an EMPTY mock proves the
// failure-tolerance contract (a missing/broken model must never throw).
jest.mock('@/lib/db', () => ({ __esModule: true, default: {} }))

import { normalizeEmail, normalizePhoneE164, isPsidLike } from '@/lib/identity/normalize'
import { persistLinkOnVerificationSuccess, upsertConversationClientLink } from '@/lib/inbox/client-link'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const resolver   = read('lib/inbox/client-context.ts')
const route      = read('app/api/admin/inbox/conversations/[id]/client-context/route.ts')
const service    = read('lib/secure-lookup/service.ts')
const clientLink = read('lib/inbox/client-link.ts')
const clientInfo = read('app/admin/inbox/components/ClientInfo.tsx')
const migration  = read('prisma/migrations/inbox_ux41a_conversation_client_link.sql')
const schema     = read('prisma/schema.prisma')

// ── Normalization primitives ─────────────────────────────────────────────────

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo.Bar@GMAIL.com ')).toBe('foo.bar@gmail.com')
  })
  it('rejects empty and non-email shapes', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail('@nouser.com')).toBeNull()
    expect(normalizeEmail('user@')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('normalizePhoneE164', () => {
  it('normalizes formatted numbers to + digits', () => {
    expect(normalizePhoneE164('+234 803 123 4567')).toBe('+2348031234567')
  })
  it('converts a leading 00 international prefix', () => {
    expect(normalizePhoneE164('00447911123456')).toBe('+447911123456')
  })
  it('rejects national formats — a leading 0 cannot become valid E.164 without country context', () => {
    expect(normalizePhoneE164('0803 123 4567')).toBeNull()      // Nigerian national form
    expect(normalizePhoneE164('(0234) 803-123-4567')).toBeNull() // would mint bogus '+0…'
  })
  it('returns null for fewer than 8 digits; exactly 8 passes', () => {
    expect(normalizePhoneE164('1234567')).toBeNull()
    expect(normalizePhoneE164('')).toBeNull()
    expect(normalizePhoneE164(null)).toBeNull()
    expect(normalizePhoneE164('12345678')).toBe('+12345678')
  })
  it('accepts a 15-digit number behind a real country code', () => {
    expect(normalizePhoneE164('+234803123456789')).toBe('+234803123456789')
  })
  it('never returns a PSID-shaped value as a phone', () => {
    expect(normalizePhoneE164('+1234567890123456')).toBeNull()   // 16 digits
    expect(normalizePhoneE164('12345678901234567')).toBeNull()   // 17 digits
  })
})

describe('isPsidLike', () => {
  it("flags '+'-prefixed 16-digit values (Meta PSIDs stored in phone columns)", () => {
    expect(isPsidLike('+1234567890123456')).toBe(true)
    expect(isPsidLike('1234567890123456')).toBe(true)
  })
  it('flags 17-digit values', () => {
    expect(isPsidLike('+12345678901234567')).toBe(true)
  })
  it('flags 15-digit values with no plausible country code', () => {
    expect(isPsidLike('123456789012345')).toBe(true)     // '123' is not a country code
  })
  it('does NOT flag 15-digit values behind a real 3-digit country code', () => {
    expect(isPsidLike('+234803123456789')).toBe(false)   // 15 digits, NG country code
  })
  it('does not flag ordinary phone numbers or non-numeric strings', () => {
    expect(isPsidLike('+2348031234567')).toBe(false)
    expect(isPsidLike('+12317902336')).toBe(false)
    expect(isPsidLike('not a phone')).toBe(false)
    expect(isPsidLike(null)).toBe(false)
  })
})

// ── Resolver source invariants ───────────────────────────────────────────────

describe('resolver — fail-closed order', () => {
  it('checks authz BEFORE reading any identity data', () => {
    const authzIdx = resolver.indexOf('checkConversationAccess(session')
    const linkIdx  = resolver.indexOf('conversationClientLink.findFirst')
    const permIdx  = resolver.indexOf("checkInboxPermission(session, 'inbox_view')")
    expect(permIdx).toBeGreaterThan(-1)
    expect(authzIdx).toBeGreaterThan(-1)
    expect(linkIdx).toBeGreaterThan(-1)
    expect(permIdx).toBeLessThan(authzIdx)
    expect(authzIdx).toBeLessThan(linkIdx)
  })

  it('consults the link table BEFORE any heuristic', () => {
    const linkIdx      = resolver.indexOf('conversationClientLink.findFirst')
    const heuristicIdx = resolver.indexOf(".eq('chatwoot_conversation_id'")
    const emailIdx     = resolver.indexOf('user.findMany')
    expect(linkIdx).toBeLessThan(heuristicIdx)
    expect(linkIdx).toBeLessThan(emailIdx)
  })

  it('multiple candidate rows collapse to UNRESOLVED with reasons', () => {
    expect(resolver).toContain('multiple_supabase_leads_for_conversation')
    expect(resolver).toContain('multiple_users_for_email')
    expect(resolver).toContain('multiple_client_accounts_for_email')
    expect(resolver).toContain('multiple_prisma_leads_for_email')
    expect(resolver).toContain("context.resolution    = 'UNRESOLVED'")
  })

  it('errors resolve to UNRESOLVED — never a thrown identity guess', () => {
    expect(resolver).toContain("ambiguityReasons: ['resolver_error']")
    expect(resolver).toContain('Fail closed')
  })

  it('guards phone columns with isPsidLike and NEVER matches phone tails', () => {
    expect(resolver).toContain('isPsidLike')
    expect(resolver).not.toContain('endsWith')
    expect(resolver).not.toMatch(/slice\(-\d/)
    // no phone-based lookups exist at all — email + conversation id only
    expect(resolver).not.toMatch(/\.eq\('whatsapp/)
    expect(resolver).not.toMatch(/where:\s*\{\s*phone/)
  })

  it('email matching mirrors customer-identity: exactly one match or nothing', () => {
    expect(resolver).toContain('users.length === 1')
    expect(resolver).toContain('accounts.length === 1')
    expect(resolver).toContain('normalizeEmail')
  })
})

// ── Route invariants ─────────────────────────────────────────────────────────

describe('client-context route', () => {
  it('GET authenticates and authorizes BEFORE resolution (fail closed)', () => {
    const sessionIdx = route.indexOf('getAdminSession')
    const resolveIdx = route.indexOf('resolveClientActionContext')
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(sessionIdx).toBeLessThan(resolveIdx)
    expect(route).toContain("checkInboxPermission(session, 'inbox_view')")
    expect(route).toContain('checkConversationAccess(session, params.id)')
    expect(route).toContain("{ status: 401 }")
  })

  it('both GET and POST carry the full auth gate', () => {
    expect(route.split('getAdminSession()').length - 1).toBeGreaterThanOrEqual(2)
    expect(route.split('checkConversationAccess').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('POST re-verifies the verification server-side (all binding fields incl. channel)', () => {
    expect(route).toContain("v.status !== 'verified'")
    expect(route).toContain('v.verifiedUntil.getTime() < Date.now()')
    expect(route).toContain("v.channel !== 'STAFF_SUPPORT'")
    expect(route).toContain('(v.staffEmail ?? \'\').toLowerCase() !== session.email.toLowerCase()')
    expect(route).toContain('v.conversationId !== String(convId)')
  })

  it('POST is rate limited, and the unverified manual link requires inbox_assign (review M1)', () => {
    expect(route).toContain("rateLimit({ key: `client-link:")
    const manualBlock = route.slice(route.indexOf('} else {'), route.indexOf("linkMethod = 'admin_manual'"))
    expect(manualBlock).toContain("checkInboxPermission(session, 'inbox_assign')")
  })

  it('POST derives the application id from the verification row — the browser-supplied id is ignored', () => {
    expect(route).toContain('visaApplicationId = v.applicationId')
    expect(route).toContain('derived server-side; body id ignored')
    // bodyApplicationId is only consulted on the manual (no-verification) path
    const verifiedBlock = route.slice(route.indexOf('if (verificationId) {'), route.indexOf('} else {'))
    expect(verifiedBlock).not.toContain('bodyApplicationId')
  })

  it('response exposes only the context DTO', () => {
    expect(route).toContain('{ context: result.context }')
    expect(route).not.toContain('service_role')
  })
})

// ── Persist-on-verify ────────────────────────────────────────────────────────

describe('persist-on-verify', () => {
  it('runs in the shared verification success path, after the audit event', () => {
    const successIdx = service.indexOf("auditLookupEvent('VERIFICATION_SUCCESS'")
    const persistIdx = service.indexOf('await persistLinkOnVerificationSuccess')
    expect(successIdx).toBeGreaterThan(-1)
    expect(persistIdx).toBeGreaterThan(successIdx)
  })

  it('is failure-tolerant in source: warns with the [client-context] prefix, never fails verification', () => {
    expect(service).toContain("console.warn('[client-context] persist-on-verify failed:'")
    expect(clientLink).toContain('[client-context]')
    expect(clientLink).toContain('Never throws')
  })

  it('resolves without throwing even when the Prisma model is entirely missing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(persistLinkOnVerificationSuccess({
      id: 'ver_x', applicationId: 'app_x', staffEmail: 's@walztravels.com',
      conversationId: '318', method: 'EMAIL_OTP',
    })).resolves.toBeUndefined()
    const upsert = await upsertConversationClientLink({
      chatwootConversationId: 318, linkMethod: 'otp_verified',
    })
    expect(upsert.ok).toBe(false)
    warn.mockRestore()
  })

  it('skips non-numeric (non-Chatwoot) conversation bindings without touching the db', async () => {
    await expect(persistLinkOnVerificationSuccess({
      id: 'ver_y', applicationId: 'app_y', staffEmail: null,
      conversationId: 'call_1', method: 'FALLBACK',
    })).resolves.toBeUndefined()
  })

  it('upsert is race-safe by construction: create, catch unique violation, converge', () => {
    expect(clientLink).toContain('isUniqueViolation')
    expect(clientLink).toContain('P2002')
    expect(clientLink).toContain('applyOverExisting')
  })

  it('append-only: replacing a link deactivates the old row and inserts a new one ATOMICALLY', () => {
    expect(clientLink).toContain('data:  { active: false }')
    expect(clientLink).toContain('replacedLinkId')
    // review M3: swap runs in one transaction; conflicts get one bounded retry
    expect(clientLink).toContain('prisma.$transaction([')
    expect(clientLink).toContain('LINK_WRITE_CONFLICT')
  })

  it('a manual re-link never downgrades a verified link (method precedence)', () => {
    expect(clientLink).toContain('existing.verificationId && !data.verificationId')
  })
})

// ── Security review H1: the lookup route validates the conversation binding ──

describe('lookup route conversation binding (review H1)', () => {
  const lookup = read('app/api/admin/applications/lookup/route.ts')

  it('a browser-supplied conversationId must be numeric AND pass checkConversationAccess BEFORE any verification is created', () => {
    expect(lookup).toContain("/^\\d+$/.test(conversationId)")
    const accessIdx = lookup.indexOf('checkConversationAccess(session, conversationId)')
    const createIdx = lookup.indexOf('await createApplicationVerification(')
    expect(accessIdx).toBeGreaterThan(-1)
    expect(accessIdx).toBeLessThan(createIdx)
  })

  it('the original lookup gates are untouched (pinned elsewhere too)', () => {
    expect(lookup).toContain('getAdminSession')
    expect(lookup).toContain('getStaffPermissionsByEmail')
    expect(lookup).toContain('rateLimit')
  })
})

// ── Security review L2: heuristics never populate primary identity fields ────

describe('heuristic candidate hygiene (review L2)', () => {
  it('HEURISTIC moves derivations into heuristicCandidates and nulls the primary fields', () => {
    expect(resolver).toContain('heuristicCandidates')
    const heuristicBlock = resolver.slice(
      resolver.indexOf("context.resolution = 'HEURISTIC'"),
      resolver.indexOf("} else {\n      context.resolution = 'UNRESOLVED'"),
    )
    expect(heuristicBlock).toContain('context.heuristicCandidates = {')
    expect(heuristicBlock).toContain('context.user          = null')
  })

  it('the VERIFIED contract is documented as identity-establishment, not a live viewing window', () => {
    expect(resolver).toContain('deliberately does NOT')
    expect(resolver).toContain('verifiedUntil')
  })
})

// ── ClientInfo identity panel ────────────────────────────────────────────────

describe('ClientInfo identity panel', () => {
  it('fetches the client-context on conversation change (shared by rail + overlay)', () => {
    expect(clientInfo).toContain('/client-context')
    expect(clientInfo).toContain('conversationId={conv.id}')
    // UX-4.1C: extended with identityRefreshToken so a Find/Create link
    // (mutated in a page-level drawer) forces this panel to refetch too.
    expect(clientInfo).toContain('[conversationId, reloadKey, identityRefreshToken]')
  })

  it('renders the three states: skeleton (motion-safe), failure + Retry, resolution chip', () => {
    expect(clientInfo).toContain('motion-safe:animate-pulse')
    expect(clientInfo).toContain('Could not load client context.')
    expect(clientInfo).toContain('Retry')
    expect(clientInfo).toContain('Verified')
    expect(clientInfo).toContain('Linked')
    expect(clientInfo).toContain('Client identity required')
  })

  it('identity-required opens the EXISTING lookup flow and never fabricates identity', () => {
    expect(clientInfo).toContain('onOpenLookup={onOpenLookup}')
    expect(clientInfo).toContain('Never fabricates identity')
  })

  it('44px touch targets, walz tokens, no hex colours', () => {
    expect(clientInfo).toContain('min-h-[44px]')
    expect(clientInfo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('keeps the UX-2 session-only linkedApp display intact (pinned strings survive)', () => {
    expect(clientInfo).toContain('No application linked')
    expect(clientInfo).toContain('Link Application')
    expect(clientInfo).toContain('Open Application')
    expect(clientInfo).toContain('linkedApp')
  })
})

// ── Migration + schema conventions ───────────────────────────────────────────

describe('migration + schema', () => {
  it('creates ConversationClientLink with the constrained linkMethod set', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ConversationClientLink"')
    expect(migration).toContain("'otp_verified', 'fallback_verified', 'admin_manual', 'webhook_backfill'")
    expect(migration).toContain('"chatwootConversationId" integer     NOT NULL')
  })

  it('append-only: uniqueness is enforced on the ACTIVE row only', () => {
    expect(migration).toContain('uq_conversation_client_link_active')
    expect(migration).toContain('WHERE "active"')
  })

  it('RLS service-role-only with explicit REVOKEs (webhook_events posture)', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL ON TABLE "ConversationClientLink" FROM anon, authenticated')
    expect(migration).toContain('service_all_conversation_client_link')
    expect(migration).toContain('TO service_role')
  })

  it('validation section distinguishes a zero result from a failure', () => {
    expect(migration).toContain("'inbox_ux41a' AS migration")
    expect(migration).toContain('-- Expect:')
  })

  it('Prisma model exists and is marked SQL-editor-managed', () => {
    expect(schema).toContain('model ConversationClientLink')
    const modelDoc = schema.slice(
      schema.indexOf('// ConversationClientLink'),
      schema.indexOf('model ConversationClientLink'),
    )
    expect(modelDoc).toContain('NEVER prisma db push')
  })
})
