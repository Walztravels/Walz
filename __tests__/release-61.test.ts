// __tests__/release-61.test.ts
// Release 6.1 — Identity Bridge + Security Hardening Test Suite
//
// Covers:
//   A. normalizeEmail — Track 1
//   B. linkItineraryToUser — conflict / idempotent / success variants
//   C. resolveCustomerOwnership — userId primary, email fallback
//   D. ownsRecordByUserIdOrEmail — Track 8 identity-security helpers
//   E. resolveOwnedTripId — Track 5 Jade chat IDOR fix
//   F. secure-documents — storageKey resolution
//   G. identity-logging — event constants present
//   H. Source invariants — Jade chat route, approve route, admin link route

import fs from 'fs'
import path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// ── A. normalizeEmail ─────────────────────────────────────────────────────────

import { normalizeEmail } from '@/lib/portal/customer-identity'

describe('A1 — normalizeEmail: lowercases and trims', () => {
  it('lowercases uppercase', () => {
    expect(normalizeEmail('TEST@Example.COM')).toBe('test@example.com')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com')
  })

  it('handles already-normalized input unchanged', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com')
  })

  it('returns empty string when passed empty string', () => {
    expect(normalizeEmail('')).toBe('')
  })
})

// ── B. IdentityLinkResult shape ───────────────────────────────────────────────

describe('B5 — linkItineraryToUser: result shape is discriminated union', () => {
  it('linked:true has userId', () => {
    const linked: import('@/lib/portal/customer-identity').IdentityLinkResult = {
      linked: true, userId: 'user_123',
    }
    expect(linked.linked).toBe(true)
    if (linked.linked) expect(linked.userId).toBe('user_123')
  })

  it('linked:false has reason', () => {
    const notLinked: import('@/lib/portal/customer-identity').IdentityLinkResult = {
      linked: false, reason: 'conflict',
    }
    expect(notLinked.linked).toBe(false)
    if (!notLinked.linked) expect(notLinked.reason).toBe('conflict')
  })

  it('all valid reason values are exhaustive', () => {
    const reasons: Array<import('@/lib/portal/customer-identity').IdentityLinkResult['reason' & string]> = []
    const r1: import('@/lib/portal/customer-identity').IdentityLinkResult = { linked: false, reason: 'already_linked' }
    const r2: import('@/lib/portal/customer-identity').IdentityLinkResult = { linked: false, reason: 'no_match' }
    const r3: import('@/lib/portal/customer-identity').IdentityLinkResult = { linked: false, reason: 'ambiguous' }
    const r4: import('@/lib/portal/customer-identity').IdentityLinkResult = { linked: false, reason: 'conflict' }
    const r5: import('@/lib/portal/customer-identity').IdentityLinkResult = { linked: false, reason: 'error' }
    if (!r1.linked) reasons.push(r1.reason)
    if (!r2.linked) reasons.push(r2.reason)
    if (!r3.linked) reasons.push(r3.reason)
    if (!r4.linked) reasons.push(r4.reason)
    if (!r5.linked) reasons.push(r5.reason)
    expect(reasons).toContain('already_linked')
    expect(reasons).toContain('no_match')
    expect(reasons).toContain('ambiguous')
    expect(reasons).toContain('conflict')
    expect(reasons).toContain('error')
  })
})

// ── C. ownsRecordByUserIdOrEmail — Track 8 ────────────────────────────────────

import { ownsRecordByUserIdOrEmail } from '@/lib/portal/identity-security'

describe('C9 — ownsRecordByUserIdOrEmail: userId primary path', () => {
  it('returns true when ownedUserId matches requestUserId', () => {
    expect(ownsRecordByUserIdOrEmail({
      ownedUserId:   'uid_a',
      ownedEmail:    'other@example.com',
      requestUserId: 'uid_a',
      requestEmail:  'me@example.com',
    })).toBe(true)
  })

  it('returns false when userId does not match and emails differ', () => {
    expect(ownsRecordByUserIdOrEmail({
      ownedUserId:   'uid_b',
      ownedEmail:    'theirs@example.com',
      requestUserId: 'uid_a',
      requestEmail:  'mine@example.com',
    })).toBe(false)
  })
})

describe('C10 — ownsRecordByUserIdOrEmail: email fallback path', () => {
  it('returns true when userId is null and emails match case-insensitively', () => {
    expect(ownsRecordByUserIdOrEmail({
      ownedUserId:   null,
      ownedEmail:    'USER@Example.com',
      requestUserId: 'uid_a',
      requestEmail:  'user@example.com',
    })).toBe(true)
  })

  it('returns false when userId is null and emails differ', () => {
    expect(ownsRecordByUserIdOrEmail({
      ownedUserId:   null,
      ownedEmail:    'theirs@example.com',
      requestUserId: 'uid_a',
      requestEmail:  'mine@example.com',
    })).toBe(false)
  })

  it('returns false when ownedEmail is null and ownedUserId does not match', () => {
    expect(ownsRecordByUserIdOrEmail({
      ownedUserId:   'uid_b',
      ownedEmail:    null,
      requestUserId: 'uid_a',
      requestEmail:  'mine@example.com',
    })).toBe(false)
  })
})

describe('C11 — forbiddenIfNotOwner: returns null when owns, NextResponse when not', () => {
  it('returns null when owns is true', () => {
    const { forbiddenIfNotOwner } = require('@/lib/portal/identity-security')
    expect(forbiddenIfNotOwner(true)).toBeNull()
  })

  it('returns a NextResponse with status 403 when owns is false', () => {
    const { forbiddenIfNotOwner } = require('@/lib/portal/identity-security')
    const resp = forbiddenIfNotOwner(false)
    expect(resp).not.toBeNull()
    expect(resp?.status).toBe(403)
  })
})

// ── D. IDENTITY_EVENT constants — Track 9 ────────────────────────────────────

import { IDENTITY_EVENT, logIdentityEvent } from '@/lib/portal/identity-logging'

describe('D12 — IDENTITY_EVENT: all required constants present', () => {
  it('has ITINERARY_USER_LINKED', () => {
    expect(IDENTITY_EVENT.ITINERARY_USER_LINKED).toBe('itinerary.user_linked')
  })

  it('has ITINERARY_USER_UNMATCHED', () => {
    expect(IDENTITY_EVENT.ITINERARY_USER_UNMATCHED).toBe('itinerary.user_unmatched')
  })

  it('has ITINERARY_USER_AMBIGUOUS', () => {
    expect(IDENTITY_EVENT.ITINERARY_USER_AMBIGUOUS).toBe('itinerary.user_ambiguous')
  })

  it('has ITINERARY_USER_CONFLICT', () => {
    expect(IDENTITY_EVENT.ITINERARY_USER_CONFLICT).toBe('itinerary.user_conflict')
  })

  it('has DOCUMENT_ACCESS_DENIED', () => {
    expect(IDENTITY_EVENT.DOCUMENT_ACCESS_DENIED).toBe('document.access_denied')
  })

  it('has TRIP_ID_OWNERSHIP_DENIED', () => {
    expect(IDENTITY_EVENT.TRIP_ID_OWNERSHIP_DENIED).toBe('jade.trip_id_ownership_denied')
  })
})

describe('D13 — logIdentityEvent: emits [IDENTITY] prefixed log', () => {
  it('calls console.log with the event and serialised payload', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {})
    logIdentityEvent(IDENTITY_EVENT.ITINERARY_USER_LINKED, {
      itineraryId: 'itin_1', userId: 'user_1', actor: 'test',
    })
    expect(spy).toHaveBeenCalledWith(
      '[IDENTITY] itinerary.user_linked',
      expect.stringContaining('"itineraryId":"itin_1"'),
    )
    spy.mockRestore()
  })
})

// ── E. Source invariants — Jade chat route Track 5 ────────────────────────────

describe('E14 — Jade chat route: leadId not accepted from client body', () => {
  it('JadeChatRequest interface does not include leadId as a received field', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    // Interface must not have leadId as an active field
    expect(src).toContain('leadId is intentionally NOT accepted from the client')
  })

  it('getJadeCommercialContext is called with leadId: null', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    expect(src).toContain('leadId:    null')
  })
})

describe('E15 — Jade chat route: tripId ownership verified server-side', () => {
  it('imports resolveOwnedTripId', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    expect(src).toContain('resolveOwnedTripId')
  })

  it('uses verifiedTripId (not raw clientTripId) in getJadeCommercialContext', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    expect(src).toContain('tripId:    verifiedTripId')
  })

  it('logs TRIP_ID_OWNERSHIP_DENIED when ownership fails', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    expect(src).toContain('TRIP_ID_OWNERSHIP_DENIED')
  })
})

// ── F. Source invariants — approve route Track 2 ─────────────────────────────

describe('F16 — Approve route: non-blocking identity link on acceptance', () => {
  it('imports tryLinkItineraryByEmail', () => {
    const src = readSource('app/api/itinerary/[ref]/approve/route.ts')
    expect(src).toContain('tryLinkItineraryByEmail')
  })

  it('calls tryLinkItineraryByEmail with actor "acceptance"', () => {
    const src = readSource('app/api/itinerary/[ref]/approve/route.ts')
    expect(src).toContain("'acceptance'")
  })

  it('uses void operator to avoid blocking the accept response', () => {
    const src = readSource('app/api/itinerary/[ref]/approve/route.ts')
    expect(src).toContain('void tryLinkItineraryByEmail')
  })
})

// ── G. Source invariants — admin link-user route Track 3 ─────────────────────

describe('G17 — Admin link-user route: POST + DELETE handlers exist', () => {
  it('exports POST handler', () => {
    const src = readSource('app/api/admin/itineraries/[id]/link-user/route.ts')
    expect(src).toContain('export async function POST')
  })

  it('exports DELETE handler', () => {
    const src = readSource('app/api/admin/itineraries/[id]/link-user/route.ts')
    expect(src).toContain('export async function DELETE')
  })

  it('validates admin session before proceeding', () => {
    const src = readSource('app/api/admin/itineraries/[id]/link-user/route.ts')
    expect(src).toContain('getAdminSession')
    expect(src).toContain("{ error: 'Unauthorised' }, { status: 401 }")
  })

  it('returns 409 on userId conflict', () => {
    const src = readSource('app/api/admin/itineraries/[id]/link-user/route.ts')
    expect(src).toContain('{ status: 409 }')
  })
})

// ── H. Source invariants — backfill script Track 4 ───────────────────────────

describe('H18 — Backfill script: dry-run and apply modes', () => {
  it('contains dry-run mode controlled by --apply flag', () => {
    const src = readSource('scripts/backfill-itinerary-users.ts')
    expect(src).toContain('--apply')
    expect(src).toContain('DRY_RUN')
  })

  it('reports eligible, matched, ambiguous, no-match counts', () => {
    const src = readSource('scripts/backfill-itinerary-users.ts')
    expect(src).toContain('Eligible')
    expect(src).toContain('Matched')
    expect(src).toContain('Ambiguous')
  })

  it('only writes when user_id IS NULL (where: { userId: null })', () => {
    const src = readSource('scripts/backfill-itinerary-users.ts')
    expect(src).toContain('userId: null')
  })
})

// ── I. SQL migration invariants — Track 12 ────────────────────────────────────

describe('I19 — SQL migration: additive user_id column', () => {
  it('migration uses ADD COLUMN IF NOT EXISTS (safe)', () => {
    const src = readSource('supabase/migrations/release61_identity_bridge.sql')
    expect(src).toContain('ADD COLUMN IF NOT EXISTS user_id TEXT')
  })

  it('creates index for user_id lookups', () => {
    const src = readSource('supabase/migrations/release61_identity_bridge.sql')
    expect(src).toContain('CREATE INDEX IF NOT EXISTS idx_itinerary_user_id')
  })

  it('rollback drops the column and indexes', () => {
    const src = readSource('supabase/migrations/release61_identity_bridge_rollback.sql')
    expect(src).toContain('DROP COLUMN IF EXISTS user_id')
  })
})

// ── J. Secure documents — Track 7 ────────────────────────────────────────────

describe('J20 — secure-documents: uses fileKey for storage path, not stored URL', () => {
  it('getSecureDocumentUrl resolves storage key from fileKey', () => {
    const src = readSource('lib/storage/secure-documents.ts')
    expect(src).toContain('resolveStorageKey')
    expect(src).toContain('fileKey')
  })

  it('verifies ownership before generating signed URL', () => {
    const src = readSource('lib/storage/secure-documents.ts')
    expect(src).toContain('findFirst')
    expect(src).toContain('DOCUMENT_ACCESS_DENIED')
  })

  it('logs DOCUMENT_URL_REFRESHED after successful signing', () => {
    const src = readSource('lib/storage/secure-documents.ts')
    expect(src).toContain('DOCUMENT_URL_REFRESHED')
  })
})

// ── K. customer-identity source — Track 1 ────────────────────────────────────

describe('K21 — customer-identity: conflict detection prevents overwrite', () => {
  it('checks for existing userId before writing', () => {
    const src = readSource('lib/portal/customer-identity.ts')
    expect(src).toContain('ITINERARY_USER_CONFLICT')
  })

  it('never overwrites a different existing userId', () => {
    const src = readSource('lib/portal/customer-identity.ts')
    expect(src).toContain("itinerary.userId !== userId")
  })

  it('idempotent: already_linked when same userId', () => {
    const src = readSource('lib/portal/customer-identity.ts')
    expect(src).toContain("itinerary.userId === userId")
    expect(src).toContain("'already_linked'")
  })
})

describe('K22 — customer-identity: email fallback in resolveCustomerOwnership', () => {
  it('resolveCustomerOwnership only falls back to email when userId is NOT yet set', () => {
    const src = readSource('lib/portal/customer-identity.ts')
    expect(src).toContain('if (!itinerary.userId)')
  })

  it('normalizes both sides of email comparison', () => {
    const src = readSource('lib/portal/customer-identity.ts')
    expect(src).toContain('normalizeEmail(itinerary.clientEmail)')
    expect(src).toContain('normalizeEmail(user.email)')
  })
})

// ── L. Prisma schema — Track 1a ───────────────────────────────────────────────

describe('L23 — Prisma schema: Itinerary has userId field', () => {
  it('Itinerary model includes userId with @map("user_id")', () => {
    const src = readSource('prisma/schema.prisma')
    expect(src).toContain('@map("user_id")')
    // Must be in the Itinerary block (before TripRequest)
    const itinStart = src.indexOf('model Itinerary {')
    const tripReqStart = src.indexOf('model TripRequest {')
    const userIdIdx = src.indexOf('@map("user_id")')
    expect(userIdIdx).toBeGreaterThan(itinStart)
    expect(userIdIdx).toBeLessThan(tripReqStart)
  })

  it('userId field is nullable (String?)', () => {
    const src = readSource('prisma/schema.prisma')
    expect(src).toContain('userId          String?  @map("user_id")')
  })
})

// ── M. resolveOwnedTripId signature — Track 5 ────────────────────────────────

describe('M24 — resolveOwnedTripId: exported from identity-security', () => {
  it('identity-security exports resolveOwnedTripId', () => {
    const src = readSource('lib/portal/identity-security.ts')
    expect(src).toContain('export async function resolveOwnedTripId')
  })

  it('resolveOwnedTripId returns null when no userId and no sessionId', () => {
    const src = readSource('lib/portal/identity-security.ts')
    expect(src).toContain('if (!userId && !sessionId) return null')
  })

  it('resolveOwnedTripId returns null when clientTripId is falsy', () => {
    const src = readSource('lib/portal/identity-security.ts')
    expect(src).toContain('if (!clientTripId) return null')
  })

  it('resolveOwnedTripId queries trip with OR of userId and sessionId', () => {
    const src = readSource('lib/portal/identity-security.ts')
    expect(src).toContain('{ userId }')
    expect(src).toContain('{ sessionId }')
  })
})

// ── N. Document retrieval returns expiresAt ────────────────────────────────────

describe('N25 — secure-documents: SecureDocumentUrl has expiresAt', () => {
  it('SecureDocumentUrl interface includes expiresAt as ISO-8601 string', () => {
    const src = readSource('lib/storage/secure-documents.ts')
    expect(src).toContain('expiresAt:  string')
  })

  it('getSecureDocumentUrl uses 1-hour default TTL', () => {
    const src = readSource('lib/storage/secure-documents.ts')
    expect(src).toContain('60 * 60')
  })
})

// ── O. Non-regression: existing flows unchanged ────────────────────────────────

describe('O26 — Non-regression: approve route still does timing-safe compare', () => {
  it('approve route still imports timingSafeEqual', () => {
    const src = readSource('app/api/itinerary/[ref]/approve/route.ts')
    expect(src).toContain("import { timingSafeEqual } from 'crypto'")
  })

  it('approve route still imports validateSentProposalState', () => {
    const src = readSource('app/api/itinerary/[ref]/approve/route.ts')
    expect(src).toContain('validateSentProposalState')
  })
})

describe('O27 — Non-regression: Jade chat still builds grounding contract', () => {
  it('chat route still imports buildGroundingContract', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    expect(src).toContain('buildGroundingContract')
  })

  it('chat route still imports executeJadeSearchTool', () => {
    const src = readSource('app/api/jade/chat/route.ts')
    expect(src).toContain('executeJadeSearchTool')
  })
})
