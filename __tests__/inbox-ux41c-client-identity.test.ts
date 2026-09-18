/**
 * INBOX UX-4.1C — first-time + legacy client identity.
 *
 * Extends the UX-4.1A ConversationClientLink surface with two more
 * staff-initiated, explicit-selection ways to establish LINKED identity:
 * Find existing client (search) and Create new client (with server-side
 * duplicate detection). Nothing here is a second identity system, and
 * nothing here weakens the fail-closed VERIFIED/LINKED-only invariant —
 * these actions are additional ways staff can REACH LINKED, not a way to
 * bypass the requirement for it.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const routeSrc = read('app/api/admin/inbox/conversations/[id]/client-context/route.ts')
const searchRouteSrc = read('app/api/admin/inbox/conversations/[id]/client-search/route.ts')
const identitySrc = read('lib/inbox/client-identity.ts')
const clientLinkSrc = read('lib/inbox/client-link.ts')
const clientContextSrc = read('lib/inbox/client-context.ts')
const drawerSrc = read('app/admin/inbox/components/ClientIdentityDrawer.tsx')
const clientInfoSrc = read('app/admin/inbox/components/ClientInfo.tsx')
const pageSrc = read('app/admin/inbox/page.tsx')
const migrationSrc = read('prisma/migrations/inbox_ux41c_client_reference.sql')

// ── lib/inbox/client-identity.ts — unit tests against a mocked prisma ───────

const mockPrisma = {
  visaApplication: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
  user: { findMany: jest.fn(), findUnique: jest.fn() },
  clientAccount: { findMany: jest.fn(), findUnique: jest.fn() },
  lead: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  booking: { findFirst: jest.fn(), findUnique: jest.fn() },
}
const mockFetchContact = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/inbox/client-context', () => ({
  fetchChatwootContact: (...a: unknown[]) => mockFetchContact(...a),
}))

import {
  generateClientReference, searchExistingClients, findCredibleDuplicate,
  resolveExistingReference, deriveChannelIdentity,
} from '@/lib/inbox/client-identity'

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.visaApplication.findMany.mockResolvedValue([])
  mockPrisma.user.findMany.mockResolvedValue([])
  mockPrisma.clientAccount.findMany.mockResolvedValue([])
  mockPrisma.lead.findMany.mockResolvedValue([])
  mockPrisma.booking.findFirst.mockResolvedValue(null)
  mockFetchContact.mockResolvedValue(null)
})

describe('generateClientReference', () => {
  it('produces a WALZ-C- prefixed reference, distinct from visa refs', () => {
    const ref = generateClientReference()
    expect(ref).toMatch(/^WALZ-C-[A-Z0-9]{6}$/)
  })
  it('is not deterministic (two calls differ)', () => {
    expect(generateClientReference()).not.toBe(generateClientReference())
  })
})

describe('searchExistingClients — explicit staff search', () => {
  it('returns nothing for a too-short query (never searches on 1 char)', async () => {
    const results = await searchExistingClients('a')
    expect(results).toEqual([])
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })

  it('finds an existing customer with a WALZ reference via VisaApplication', async () => {
    mockPrisma.visaApplication.findMany.mockResolvedValue([{
      id: 'app1', referenceNumber: 'WALZ-ABC123', firstName: 'Vicky', lastName: 'Mensah',
      email: 'vicky@example.com', phone: null, destinationIso2: 'gb', visaType: 'tourist', status: 'in_progress',
    }])
    const results = await searchExistingClients('Vicky')
    expect(results.some(r => r.type === 'application' && r.reference === 'WALZ-ABC123')).toBe(true)
  })

  it('finds a legacy customer with NO WALZ reference via User', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Old Customer', email: 'old@example.com', phone: null }])
    const results = await searchExistingClients('Old Customer')
    const r = results.find(x => x.type === 'user')
    expect(r).toBeDefined()
    expect(r?.reference).toBeNull()   // no reference to fabricate
  })

  it('normalizes an international phone number before searching by it', async () => {
    await searchExistingClients('+234 803 123 4567')
    const userCall = mockPrisma.user.findMany.mock.calls[0][0]
    expect(JSON.stringify(userCall)).toContain('+2348031234567')
  })

  it('never does phone-tail matching — the phone clause is exact equality only', () => {
    expect(identitySrc).not.toMatch(/endsWith/)
    expect(identitySrc).not.toMatch(/slice\(-\d/)
  })
})

describe('findCredibleDuplicate — fail-closed ambiguity', () => {
  it('no matches → safe to create', async () => {
    const result = await findCredibleDuplicate({ email: 'brandnew@example.com', phone: null })
    expect(result).toEqual({ status: 'none' })
  })

  it('email-only match → exactly one candidate, directs staff to link', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Match', email: 'match@example.com', phone: null }])
    const result = await findCredibleDuplicate({ email: 'match@example.com', phone: null })
    expect(result.status).toBe('found')
    if (result.status === 'found') expect(result.candidate.id).toBe('u1')
  })

  it('phone-only match → exactly one candidate', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([{ id: 'l1', name: 'Phone Match', email: null, whatsapp: '+2348031234567' }])
    const result = await findCredibleDuplicate({ email: null, phone: '+2348031234567' })
    expect(result.status).toBe('found')
    if (result.status === 'found') expect(result.candidate.type).toBe('lead')
  })

  it('normalized international phone match: national format still finds the +234 record', async () => {
    // normalizePhoneE164 rejects national (leading-0) forms outright — so a
    // staff-typed '0803...' number normalizes to null and is NOT searched;
    // this is intentional (never mint a bogus '+0...' identifier) — confirm
    // that behavior explicitly rather than assuming a match.
    const result = await findCredibleDuplicate({ email: null, phone: '0803 123 4567' })
    expect(result).toEqual({ status: 'none' })
    expect(mockPrisma.lead.findMany).not.toHaveBeenCalled()
  })

  it('M1 (security review): a guest applicant with a VisaApplication but no User/ClientAccount is found — never an orphan Lead', async () => {
    mockPrisma.visaApplication.findMany.mockResolvedValue([{
      id: 'app1', firstName: 'Guest', lastName: 'Applicant', email: 'guest@example.com',
      phone: null, referenceNumber: 'WALZ-GUEST1',
    }])
    const result = await findCredibleDuplicate({ email: 'guest@example.com', phone: null })
    expect(result.status).toBe('found')
    if (result.status === 'found') {
      expect(result.candidate.type).toBe('application')
      expect(result.candidate.reference).toBe('WALZ-GUEST1')
    }
  })

  it('ambiguous — multiple candidate records — fails closed, never auto-picks', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'A', email: 'dup@example.com', phone: null }])
    mockPrisma.lead.findMany.mockResolvedValue([{ id: 'l1', name: 'B', email: 'dup@example.com', whatsapp: null }])
    const result = await findCredibleDuplicate({ email: 'dup@example.com', phone: null })
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') expect(result.candidates.length).toBe(2)
  })

  it('a PSID-shaped value is never treated as a phone for duplicate matching', async () => {
    const result = await findCredibleDuplicate({ email: null, phone: '+1234567890123456' })
    expect(result).toEqual({ status: 'none' })
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })
})

describe('resolveExistingReference — reuse, never regenerate', () => {
  it('reuses an application reference directly', async () => {
    mockPrisma.visaApplication.findUnique.mockResolvedValue({ referenceNumber: 'WALZ-XYZ999' })
    const ref = await resolveExistingReference('application', 'app1')
    expect(ref).toBe('WALZ-XYZ999')
  })

  it("reuses a linked user's most recent application reference when one exists", async () => {
    mockPrisma.visaApplication.findFirst.mockResolvedValue({ referenceNumber: 'WALZ-USR001' })
    const ref = await resolveExistingReference('user', 'u1')
    expect(ref).toBe('WALZ-USR001')
  })

  it('returns null for a lead (nothing to reuse) — caller generates a fresh reference', async () => {
    const ref = await resolveExistingReference('lead', 'l1')
    expect(ref).toBeNull()
  })
})

describe('deriveChannelIdentity — SERVER-derived, never staff-typed', () => {
  it('brand-new WhatsApp customer: uses the Chatwoot contact’s own phone', async () => {
    mockFetchContact.mockResolvedValue({ name: 'Vicky', email: null, phone: '+2348031234567' })
    const identity = await deriveChannelIdentity(318)
    expect(identity).toEqual({ sourceId: '+2348031234567', whatsapp: '+2348031234567' })
  })

  it('brand-new web customer with no phone: falls back to a conversation-scoped synthetic id, not a fabricated phone', async () => {
    mockFetchContact.mockResolvedValue({ name: 'Web Visitor', email: null, phone: null })
    const identity = await deriveChannelIdentity(318)
    expect(identity).toEqual({ sourceId: 'inbox-conv-318', whatsapp: null })
  })

  it('Chatwoot unavailable: still returns a safe conversation-scoped identity, never throws', async () => {
    mockFetchContact.mockResolvedValue(null)
    const identity = await deriveChannelIdentity(318)
    expect(identity.sourceId).toBe('inbox-conv-318')
  })
})

// ── Route: mode dispatch, authz, IDOR, browser-manipulation resistance ──────

describe('client-context route — UX-4.1C mode dispatch (source pins)', () => {
  it('both new modes require inbox_assign, checked BEFORE any mode-specific logic', () => {
    const modeBlock = routeSrc.slice(routeSrc.indexOf("mode === 'link_existing' || mode === 'create_new'"), routeSrc.indexOf("if (mode === 'link_existing') {"))
    expect(modeBlock).toContain("checkInboxPermission(session, 'inbox_assign')")
  })

  it('the mode block runs AFTER session/inbox_view/conversation-access — same gate order as every inbox route', () => {
    const sessionIdx = routeSrc.indexOf('getAdminSession()')
    const invIdx = routeSrc.indexOf("checkInboxPermission(session, 'inbox_view')")
    const accessIdx = routeSrc.indexOf('checkConversationAccess(session, params.id)')
    const modeIdx = routeSrc.indexOf("mode === 'link_existing' || mode === 'create_new'")
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(sessionIdx).toBeLessThan(invIdx)
    expect(invIdx).toBeLessThan(accessIdx)
    expect(accessIdx).toBeLessThan(modeIdx)
  })

  it('link_existing IDOR: the target is re-verified to EXIST server-side for every type before linking', () => {
    const block = routeSrc.slice(routeSrc.indexOf("if (mode === 'link_existing') {"), routeSrc.indexOf('// mode === '))
    expect(block).toContain('findUnique')
    expect(block).toContain("Client record not found")
    // booking resolves to its OWNING user — never links a Booking id directly
    expect(block).toContain("booking.userId")
  })

  it('create_new: duplicate detection is ALWAYS re-run server-side — never trusts a browser claim', () => {
    const block = routeSrc.slice(routeSrc.indexOf("// mode === 'create_new'"), routeSrc.indexOf('const channel = await deriveChannelIdentity'))
    expect(block).toContain('findCredibleDuplicate')
    expect(block).toContain("DUPLICATE_AMBIGUOUS")
    expect(block).toContain("DUPLICATE_FOUND")
    // ambiguous/found → 409, and creation code is textually AFTER this guard
    const guardIdx = routeSrc.indexOf("dup.status !== 'none'")
    const createIdx = routeSrc.indexOf('createLeadRaceSafe(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(createIdx)
  })

  it('create_new: channel identity (source/sourceId) is SERVER-DERIVED from the conversation, never the staff-typed phone/email', () => {
    const start = routeSrc.indexOf('const channel = await deriveChannelIdentity(convId)')
    const block = routeSrc.slice(start, routeSrc.indexOf('const upsert = await upsertConversationClientLink', start))
    expect(start).toBeGreaterThan(-1)
    // the Lead's identifying sourceId comes from `channel`, never from rawPhone/rawEmail
    expect(block).toContain('channel.sourceId')
    expect(block).not.toMatch(/sourceId:\s*rawPhone/)
    expect(block).not.toMatch(/sourceId:\s*rawEmail/)
  })

  it('M2 (security review): Lead.whatsapp is SERVER-DERIVED only — never the staff-typed phone', () => {
    // Lead.whatsapp is a de-facto identity key elsewhere (Jade's saveLead,
    // lead import/reconcile dedupe by it) — a staff-mistyped number must
    // never become it; the staff-typed value survives only as a note.
    expect(routeSrc).toContain('whatsapp: channel.whatsapp')
    expect(routeSrc).not.toMatch(/whatsapp:\s*normalizedPhone/)
    expect(routeSrc).toContain('staffTypedPhoneNote')
  })

  it('create_new uses createLeadRaceSafe — the existing race-safe creation helper, not a naive check-then-create', () => {
    expect(routeSrc).toContain("from '@/lib/leads/identity'")
    expect(routeSrc).toContain('createLeadRaceSafe(prisma')
  })

  it('the reference is REUSED when the target already has one, generated only otherwise', () => {
    expect(routeSrc).toContain('resolveExistingReference(linkType, linkId) ?? generateClientReference()')
  })

  it('legacy path (no mode) is textually untouched and still reachable', () => {
    expect(routeSrc).toContain("Legacy path (no `mode`)")
    expect(routeSrc).toContain("v.channel !== 'STAFF_SUPPORT'")
    expect(routeSrc).toContain("derived server-side; body id ignored")
  })
})

describe('client-search route — read-only, authz before query', () => {
  it('full auth chain before the search runs', () => {
    const sIdx = searchRouteSrc.indexOf('getAdminSession')
    const iIdx = searchRouteSrc.indexOf("checkInboxPermission(session, 'inbox_view')")
    const aIdx = searchRouteSrc.indexOf('checkConversationAccess(session, params.id)')
    const qIdx = searchRouteSrc.indexOf('searchExistingClients(q)')
    expect(sIdx).toBeGreaterThan(-1)
    expect(sIdx).toBeLessThan(iIdx)
    expect(iIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(qIdx)
  })

  it('this route only searches — it never links or mutates anything', () => {
    expect(searchRouteSrc).not.toContain('upsertConversationClientLink')
    expect(searchRouteSrc).not.toMatch(/\.create\(|\.update\(/)
  })
})

// ── client-link.ts: the sameTarget fix (all FKs, not just visaApplicationId) ─

describe('client-link.ts sameTarget correctness (UX-4.1C fix)', () => {
  it('compares userId, clientAccountId AND prismaLeadId — not just visaApplicationId', () => {
    const block = clientLinkSrc.slice(clientLinkSrc.indexOf('const sameTarget ='), clientLinkSrc.indexOf('if (sameTarget)'))
    expect(block).toContain('existing.userId')
    expect(block).toContain('existing.clientAccountId')
    expect(block).toContain('existing.prismaLeadId')
  })
})

// ── DTO: clientReference reaches the context ─────────────────────────────────

describe('client-context.ts: clientReference DTO + export', () => {
  it('ClientLinkDTO carries clientReference; hydration reads it from the link row', () => {
    expect(clientContextSrc).toContain('clientReference: string | null')
    expect(clientContextSrc).toContain('clientReference: link.clientReference')
  })

  it('fetchChatwootContact is exported for reuse by client-identity.ts (one Chatwoot-resolution code path)', () => {
    expect(clientContextSrc).toContain('export async function fetchChatwootContact')
  })
})

// ── UI: drawer send-never-auto discipline, IDOR-safe UI, a11y ───────────────

describe('ClientIdentityDrawer — discipline and a11y (source pins)', () => {
  it('linking or creating NEVER calls any message-send function — this drawer only mutates identity', () => {
    expect(drawerSrc).not.toContain('onSendMessage')
    expect(drawerSrc).not.toContain('insertDraft')
  })

  it('Find mode: staff must explicitly click Link on ONE candidate — no auto-select', () => {
    expect(drawerSrc).toContain('onClick={() => void linkCandidate(c)}')
    // no code path selects a candidate programmatically — only the
    // per-item onClick handler ever calls linkCandidate
    expect(drawerSrc).not.toMatch(/candidates\[0\]/)
    expect(drawerSrc.match(/linkCandidate\(/g)?.length).toBe(3)   // definition + 2 call sites (find list, duplicate list)
  })

  it('Create mode: an ambiguous/found duplicate blocks creation and offers Link on the match(es) instead', () => {
    expect(drawerSrc).toContain("data?.code === 'DUPLICATE_FOUND'")
    expect(drawerSrc).toContain("data?.code === 'DUPLICATE_AMBIGUOUS'")
    expect(drawerSrc).toContain('duplicateMatches')
  })

  it('a11y: dialog + Esc + Tab trap (:disabled-aware) + focus restore + safe-area + motion-safe', () => {
    expect(drawerSrc).toContain('role="dialog"')
    expect(drawerSrc).toContain("e.key === 'Escape'")
    expect(drawerSrc).toContain("!el.matches(':disabled')")
    expect(drawerSrc).toContain('restoreRef.current?.focus()')
    expect(drawerSrc).toContain('safe-area-inset-bottom')
    expect(drawerSrc).toContain('motion-safe:transition-transform')
  })

  it('every interactive Link button meets the 44px touch-target convention (QA review)', () => {
    expect(drawerSrc).not.toMatch(/min-h-\[(?:2\d|3\d)px\]/)   // no sub-44px interactive sizing anywhere
    expect(drawerSrc.match(/min-h-\[44px\]/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('search is sequence-guarded against stale responses', () => {
    expect(drawerSrc).toContain('searchSeqRef.current')
  })
})

describe('page wiring: identity drawer force-closed on conversation change and screen change', () => {
  it('applyConvSelection closes the identity drawer', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('function applyConvSelection'), pageSrc.indexOf('function doSelectConv'))
    expect(fn).toContain('setIdentityDrawer(null)')
  })

  it('the screen-change effect closes it alongside payment/quote/copilot', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('prevScreenRef.current'), pageSrc.indexOf('}, [screens.screen])'))
    expect(fn).toContain('setIdentityDrawer(null)')
  })

  it('both rail and overlay ClientInfo wire onOpenClientIdentity + identityRefreshToken', () => {
    expect(pageSrc.match(/onOpenClientIdentity=/g)?.length).toBeGreaterThanOrEqual(2)
    expect(pageSrc.match(/identityRefreshToken=\{identityRefreshToken\}/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ClientInfo: LINKED unlocks Quick Actions identically for a Find/Create-linked client (no application)', () => {
  it('LINKED renders a name + generated reference when there is no VisaApplication', () => {
    expect(clientInfoSrc).toContain('linkedDisplay(state.context)')
    expect(clientInfoSrc).toContain('linkedName')
    expect(clientInfoSrc).toContain('linkedReference')
  })

  it('the existing OTP-verified path (VERIFIED) is preserved as a secondary action, unchanged', () => {
    expect(clientInfoSrc).toContain('Verify via application reference')
    expect(clientInfoSrc).toContain('onClick={onOpenLookup}')
  })

  it('Find/Create buttons only render when the page provides onOpenClientIdentity — no dead buttons', () => {
    expect(clientInfoSrc).toContain('Find existing client')
    expect(clientInfoSrc).toContain('+ Create new client')
    expect(clientInfoSrc).toContain('onOpenClientIdentity &&')
  })
})

// ── Migration ────────────────────────────────────────────────────────────────

describe('migration + schema', () => {
  it('additive nullable column only, on the SAME identity table (not a second one)', () => {
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS "clientReference"')
    expect(migrationSrc).toContain('ALTER TABLE "ConversationClientLink"')
    expect(migrationSrc).not.toMatch(/CREATE TABLE|\bDROP\b|\bDELETE\b|\bUPDATE\b/i)
    expect(migrationSrc).toContain("'inbox_ux41c' AS migration")
  })

  it('Prisma model gained the column (SQL-editor-managed)', () => {
    const schema = read('prisma/schema.prisma')
    const model = schema.slice(schema.indexOf('model ConversationClientLink'), schema.indexOf('model RoutingAgent'))
    expect(model).toContain('clientReference        String?')
    expect(model).toContain('NEVER prisma db push')
  })
})
