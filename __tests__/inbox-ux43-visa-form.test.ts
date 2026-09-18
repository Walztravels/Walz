/**
 * INBOX UX-4.3 — Visa Form (Client Action Centre).
 *
 * Reuses the existing visa infrastructure (VisaApplication,
 * VisaApplicationToken, generateVisaRef, DocumentRequest) end to end.
 * Deliberately bypasses the existing admin routes for token/send-form/
 * document-request creation because every one of them unconditionally
 * fires an email with no way to opt out — that would break the Client
 * Action Centre's Generate-never-sends discipline. This suite proves the
 * hard identity invariant (unchanged from every other Action Centre
 * action) plus the send-never-auto discipline in the new drawer.
 */

import fs from 'fs'
import path from 'path'

const mockPrisma = {
  visaApplication: { create: jest.fn(), findUnique: jest.fn() },
  visaApplicationToken: { create: jest.fn(), findMany: jest.fn() },
  documentRequest: { create: jest.fn(), findMany: jest.fn() },
  conversationClientLink: { findFirst: jest.fn() },
}
const mockResolve = jest.fn()
const mockUpsertLink = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/inbox/client-context', () => ({
  resolveClientActionContext: (...a: unknown[]) => mockResolve(...a),
}))
jest.mock('@/lib/inbox/client-link', () => ({
  upsertConversationClientLink: (...a: unknown[]) => mockUpsertLink(...a),
}))

import {
  createVisaCase, mintVisaFormLink, requestDocuments, listRecentVisaActions,
} from '@/lib/action-centre/visa-form'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const routeSrc = read('app/api/admin/inbox/conversations/[id]/visa/route.ts')
const serviceSrc = read('lib/action-centre/visa-form.ts')
const drawerSrc = read('app/admin/inbox/components/VisaFormDrawer.tsx')
const clientInfoSrc = read('app/admin/inbox/components/ClientInfo.tsx')
const pageSrc = read('app/admin/inbox/page.tsx')
const migrationSrc = read('prisma/migrations/inbox_ux43_visa_form_conversation_columns.sql')

const SESSION = { email: 'staff@walztravels.com', role: 'staff' } as never

const CTX_NO_CASE = {
  ok: true,
  context: {
    resolution: 'VERIFIED',
    contact: { name: 'Ama Mensah', email: 'ama@example.com', phone: '+233554000000' },
    application: null,
    user: null, clientAccount: null, prismaLead: null,
    link: { clientReference: 'WALZ-C-ABC123' },
  },
}
const CTX_WITH_CASE = {
  ok: true,
  context: {
    ...CTX_NO_CASE.context,
    application: { id: 'app1', walzRef: 'WALZ-XYZ789', applicationType: 'GB Tourist Visa', status: 'In review' },
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolve.mockResolvedValue(CTX_WITH_CASE)
  mockUpsertLink.mockResolvedValue({ ok: true, linkId: 'link1' })
  mockPrisma.visaApplication.findUnique.mockResolvedValue(null)
  mockPrisma.visaApplication.create.mockResolvedValue({
    id: 'app-new', referenceNumber: 'WALZ-NEW123', visaType: 'tourist', destinationIso2: 'GB', status: 'draft',
  })
  mockPrisma.visaApplicationToken.create.mockResolvedValue({ token: 'tok_abc123' })
  mockPrisma.visaApplicationToken.findMany.mockResolvedValue([])
  mockPrisma.documentRequest.create.mockResolvedValue({ id: 'docreq1', token: 'doc_tok_1' })
  mockPrisma.documentRequest.findMany.mockResolvedValue([])
  mockPrisma.conversationClientLink.findFirst.mockResolvedValue(null)
})

// ── Hard identity invariant — each function checked against ITS OWN valid
//    precondition (createVisaCase needs NO existing case; mintVisaFormLink/
//    requestDocuments need an EXISTING one) ──────────────────────────────────

describe.each([
  ['createVisaCase', CTX_NO_CASE, () => createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'GB', visaType: 'tourist' })],
  ['mintVisaFormLink', CTX_WITH_CASE, () => mintVisaFormLink({ session: SESSION, conversationId: 318 })],
  ['requestDocuments', CTX_WITH_CASE, () => requestDocuments({ session: SESSION, conversationId: 318, requestedDocs: ['Passport'] })],
] as const)('%s — hard identity invariant', (_name, baseCtx, call) => {
  beforeEach(() => {
    mockPrisma.visaApplication.findUnique.mockResolvedValue(
      baseCtx.context.application ? { id: baseCtx.context.application.id, destinationIso2: 'GB' } : null,
    )
  })

  it('VERIFIED → allowed', async () => {
    mockResolve.mockResolvedValue(baseCtx)
    const res = await call()
    expect(res.ok).toBe(true)
  })

  it('LINKED → allowed (LINKED is authoritative)', async () => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...baseCtx.context, resolution: 'LINKED' } })
    const res = await call()
    expect(res.ok).toBe(true)
  })

  it.each(['HEURISTIC', 'UNRESOLVED'] as const)('%s → rejected, nothing persisted', async resolution => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...baseCtx.context, resolution } })
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
    expect(mockPrisma.visaApplicationToken.create).not.toHaveBeenCalled()
    expect(mockPrisma.documentRequest.create).not.toHaveBeenCalled()
  })

  it('resolver denial (401/403) → rejected before any write', async () => {
    mockResolve.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
  })

  it('missing server-resolved email/name fails closed — never falls back to a browser value', async () => {
    mockResolve.mockResolvedValue({
      ok: true, context: { ...baseCtx.context, contact: { name: null, email: null, phone: null } },
    })
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
  })
})

// ── createVisaCase specifics ─────────────────────────────────────────────────

describe('createVisaCase', () => {
  it('rejects when a case already exists — points staff at Send/Resend instead', async () => {
    mockResolve.mockResolvedValue(CTX_WITH_CASE)   // already has ctx.application
    const res = await createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'GB', visaType: 'tourist' })
    expect(res).toMatchObject({ ok: false, code: 'CASE_ALREADY_EXISTS' })
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })

  it('creates the case using SERVER-resolved contact fields, never a browser-supplied name/email', async () => {
    mockResolve.mockResolvedValue(CTX_NO_CASE)
    await createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'gb', visaType: 'tourist' })
    const data = mockPrisma.visaApplication.create.mock.calls[0][0].data
    expect(data.email).toBe('ama@example.com')
    expect(data.firstName).toBe('Ama')
    expect(data.destinationIso2).toBe('GB')   // uppercased
  })

  it('rejects an invalid destination code without creating anything', async () => {
    mockResolve.mockResolvedValue(CTX_NO_CASE)
    const res = await createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'not-a-code', visaType: 'tourist' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid arrival date without creating anything', async () => {
    mockResolve.mockResolvedValue(CTX_NO_CASE)
    const res = await createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'GB', visaType: 'tourist', arrivalDate: 'not-a-date' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })

  it('security review MEDIUM fix: a case created moments ago for THIS conversation blocks a racing second create (VisaApplication has no conversationId column, so this closes the double-click/retry window at the link table)', async () => {
    mockResolve.mockResolvedValue(CTX_NO_CASE)
    mockPrisma.conversationClientLink.findFirst.mockResolvedValue({ visaApplicationId: 'app-just-created' })
    const res = await createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'GB', visaType: 'tourist' })
    expect(res).toMatchObject({ ok: false, code: 'CASE_ALREADY_EXISTS' })
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })

  it('extends the SAME conversation link (append-only), preserving prior identity FKs', async () => {
    mockResolve.mockResolvedValue({
      ok: true, context: { ...CTX_NO_CASE.context, prismaLead: { id: 'lead1', name: 'Ama', email: 'ama@example.com' } },
    })
    await createVisaCase({ session: SESSION, conversationId: 318, destinationIso2: 'GB', visaType: 'tourist' })
    const linkCall = mockUpsertLink.mock.calls[0][0]
    expect(linkCall.visaApplicationId).toBe('app-new')
    expect(linkCall.prismaLeadId).toBe('lead1')
  })

  it('uses the existing generateVisaRef algorithm — WALZ- prefixed reference', () => {
    expect(serviceSrc).toContain("from '@/lib/visa-config'")
    expect(serviceSrc).toContain('generateVisaRef()')
  })
})

// ── mintVisaFormLink specifics ───────────────────────────────────────────────

describe('mintVisaFormLink', () => {
  it('no case linked → NO_CASE_LINKED, no token minted', async () => {
    mockResolve.mockResolvedValue(CTX_NO_CASE)
    const res = await mintVisaFormLink({ session: SESSION, conversationId: 318 })
    expect(res).toMatchObject({ ok: false, code: 'NO_CASE_LINKED' })
    expect(mockPrisma.visaApplicationToken.create).not.toHaveBeenCalled()
  })

  it('a browser-supplied applicationId that differs from the server-resolved one is rejected', async () => {
    mockPrisma.visaApplication.findUnique.mockResolvedValue({ id: 'app1', destinationIso2: 'GB' })
    const res = await mintVisaFormLink({ session: SESSION, conversationId: 318, applicationId: 'someone-elses-app' })
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_CONTEXT_MISMATCH' })
    expect(mockPrisma.visaApplicationToken.create).not.toHaveBeenCalled()
  })

  it('mints a token scoped to the conversation, with the client-facing email/name from the SERVER context', async () => {
    mockPrisma.visaApplication.findUnique.mockResolvedValue({ id: 'app1', destinationIso2: 'GB' })
    await mintVisaFormLink({ session: SESSION, conversationId: 318 })
    const data = mockPrisma.visaApplicationToken.create.mock.calls[0][0].data
    expect(data.clientEmail).toBe('ama@example.com')
    expect(data.conversationId).toBe(318)
    expect(data.source).toBe('inbox_action_centre')
  })

  it('the service NEVER calls the existing email-sending token route — it writes the token row directly', () => {
    // (the file's own header comment explains WHY those routes are avoided
    // and legitimately names them — check for an actual fetch/call, not text)
    expect(serviceSrc).not.toContain('sendApplicationFormLink')
    expect(serviceSrc).not.toMatch(/fetch\(['"`].*visa-applications/)
  })
})

// ── requestDocuments specifics ───────────────────────────────────────────────

describe('requestDocuments', () => {
  it('empty document list is rejected', async () => {
    const res = await requestDocuments({ session: SESSION, conversationId: 318, requestedDocs: ['   ', ''] })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.documentRequest.create).not.toHaveBeenCalled()
  })

  it('no case linked → NO_CASE_LINKED', async () => {
    mockResolve.mockResolvedValue(CTX_NO_CASE)
    const res = await requestDocuments({ session: SESSION, conversationId: 318, requestedDocs: ['Passport'] })
    expect(res).toMatchObject({ ok: false, code: 'NO_CASE_LINKED' })
  })

  it('a browser-supplied applicationId that differs from the server-resolved one is rejected', async () => {
    const res = await requestDocuments({ session: SESSION, conversationId: 318, requestedDocs: ['Passport'], applicationId: 'someone-elses-app' })
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_CONTEXT_MISMATCH' })
    expect(mockPrisma.documentRequest.create).not.toHaveBeenCalled()
  })

  it('security review HIGH fix: persists requestedDocs as {name,required} objects, JSON-stringified — the exact shape app/upload/[token] and the admin case page require', async () => {
    await requestDocuments({ session: SESSION, conversationId: 318, requestedDocs: ['Passport', 'Bank statement'] })
    const data = mockPrisma.documentRequest.create.mock.calls[0][0].data
    expect(typeof data.requestedDocs).toBe('string')   // JSON.stringify'd, matching document-requests/route.ts
    const parsed = JSON.parse(data.requestedDocs)
    expect(parsed).toEqual([
      { name: 'Passport', required: true },
      { name: 'Bank statement', required: true },
    ])
    expect(data.totalRequired).toBe(2)
  })

  it('the service does NOT call the existing document-requests route’s own email side effect', () => {
    const fn = serviceSrc.slice(serviceSrc.indexOf('export async function requestDocuments'), serviceSrc.indexOf('// ── Recent visa actions'))
    expect(fn).not.toContain('Resend')
    expect(fn).not.toContain('emailSentAt:')
  })
})

// ── listRecentVisaActions ────────────────────────────────────────────────────

describe('listRecentVisaActions', () => {
  it('never throws on a store failure — degrades to an empty list', async () => {
    mockPrisma.visaApplicationToken.findMany.mockRejectedValue(new Error('db down'))
    const actions = await listRecentVisaActions(318)
    expect(actions).toEqual([])
  })

  it('QA review: merges tokens and document requests, sorted newest-first, mapped correctly', async () => {
    const older = new Date('2026-09-18T10:00:00Z')
    const newer = new Date('2026-09-18T12:00:00Z')
    mockPrisma.visaApplicationToken.findMany.mockResolvedValue([
      { id: 'tok1', used: true, expiresAt: new Date('2026-09-25T00:00:00Z'), createdAt: older },
    ])
    mockPrisma.documentRequest.findMany.mockResolvedValue([
      { id: 'doc1', status: 'pending', expiresAt: new Date('2026-10-02T00:00:00Z'), createdAt: newer },
    ])
    const actions = await listRecentVisaActions(318)
    // newest (the document request) sorts first
    expect(actions).toEqual([
      { kind: 'document_request', id: 'doc1', createdAt: newer.toISOString(), expiresAt: new Date('2026-10-02T00:00:00Z').toISOString(), status: 'pending' },
      { kind: 'form_link', id: 'tok1', createdAt: older.toISOString(), expiresAt: new Date('2026-09-25T00:00:00Z').toISOString(), used: true },
    ])
  })
})

// ── Route: action dispatch, authz, IDOR (source pins) ───────────────────────

describe('visa route — action dispatch (source pins)', () => {
  it('full auth chain before any action runs: session -> inbox_view -> conversation access -> inbox_assign -> rate limit', () => {
    const sIdx = routeSrc.indexOf('getAdminSession()')
    const vIdx = routeSrc.indexOf("checkInboxPermission(session, 'inbox_view')")
    const aIdx = routeSrc.indexOf('checkConversationAccess(session, params.id)')
    const assignIdx = routeSrc.indexOf("checkInboxPermission(session, 'inbox_assign')")
    const rlIdx = routeSrc.indexOf('rateLimit({ key: `visa-form:')
    const dispatchIdx = routeSrc.indexOf("action === 'create_case'")
    expect(sIdx).toBeGreaterThan(-1)
    expect(sIdx).toBeLessThan(vIdx)
    expect(vIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(assignIdx)
    expect(assignIdx).toBeLessThan(rlIdx)
    expect(rlIdx).toBeLessThan(dispatchIdx)
  })

  it('an unknown action is rejected with 400, never silently ignored', () => {
    expect(routeSrc).toContain("action must be 'create_case', 'mint_link', or 'request_documents'")
  })

  it('error codes map to sensible HTTP statuses', () => {
    expect(routeSrc).toContain("result.code === 'CLIENT_IDENTITY_REQUIRED' || result.code === 'CLIENT_CONTEXT_MISMATCH' ? 403")
    expect(routeSrc).toContain("result.code === 'CASE_ALREADY_EXISTS' ? 409")
  })
})

// ── Protected systems — hard boundary ────────────────────────────────────────

describe('protected systems: Letter Generator and Dummy Ticket are never touched', () => {
  it('no reference to either generator anywhere in the new files', () => {
    const all = serviceSrc + routeSrc + drawerSrc
    expect(all).not.toMatch(/generate-letter|letter-generator|ticket-generator|dummy-ticket/i)
  })
})

// ── Drawer: send-never-auto, a11y, identity gate (source pins) ──────────────

describe('VisaFormDrawer — discipline and a11y (source pins)', () => {
  it('Create case and Request Documents creation never call onSendMessage', () => {
    const create = drawerSrc.slice(drawerSrc.indexOf('async function handleCreateCase'), drawerSrc.indexOf('async function handleMintLink'))
    const docs = drawerSrc.slice(drawerSrc.indexOf('async function handleRequestDocuments'), drawerSrc.indexOf('function buildFormLinkMessage'))
    expect(create).not.toContain('onSendMessage')
    expect(docs).not.toContain('onSendMessage')
  })

  it('Insert into reply uses insertDraft and never sends; explicit Send is the only path to onSendMessage', () => {
    expect(drawerSrc).toContain('insertDraft(text)')
    const ins = drawerSrc.slice(drawerSrc.indexOf('function handleInsert'), drawerSrc.indexOf('async function handleSendToClient'))
    expect(ins).not.toContain('onSendMessage')
    expect(drawerSrc).toContain('await onSendMessage(text)')
  })

  it('a failed send never shows Sent (boolean contract from the existing path)', () => {
    expect(drawerSrc).toContain('if (ok) setSent(true)')
    expect(drawerSrc).toContain('The message could not be sent. Try again.')
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

  it('identity gate mirrors the server; drawer never shows a heuristic identity as usable', () => {
    expect(drawerSrc).toContain("ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'")
    expect(drawerSrc).toContain('Client identity required')
  })

  it('all interactive elements meet the 44px touch-target convention', () => {
    expect(drawerSrc).not.toMatch(/min-h-\[(?:2\d|3\d)px\]/)
  })

  it('status is rendered as text, never conveyed by color alone', () => {
    expect(drawerSrc).toContain('ctx.application?.status')
  })
})

// ── Wiring: force-close on conversation/screen change, both ClientInfo sites ─

describe('page wiring: visa form drawer force-closed on conversation change and screen change', () => {
  it('applyConvSelection closes the visa form drawer', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('function applyConvSelection'), pageSrc.indexOf('function doSelectConv'))
    expect(fn).toContain('setVisaFormOpen(false)')
  })

  it('the screen-change effect closes it alongside payment/quote/identity/copilot', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('prevScreenRef.current'), pageSrc.indexOf('}, [screens.screen])'))
    expect(fn).toContain('setVisaFormOpen(false)')
  })

  it('both rail and overlay ClientInfo wire onOpenVisaForm', () => {
    expect(pageSrc.match(/onOpenVisaForm=/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ClientInfo Quick Actions: Visa Form gated identically to Request Payment/Create Quote', () => {
  it('a third live button exists, disabled below VERIFIED/LINKED; the roadmap line now only lists Itinerary', () => {
    expect(clientInfoSrc).toContain('Visa Form')
    expect(clientInfoSrc).toContain('onOpenVisaForm')
    expect(clientInfoSrc).toContain('Itinerary — coming with the next release')
    expect(clientInfoSrc).not.toContain('Visa Form · Itinerary')
  })
})

// ── Migration + schema ────────────────────────────────────────────────────────

describe('migration + schema', () => {
  it('additive nullable columns only, on the EXISTING visa tables — no new persistence system', () => {
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS "conversationId"')
    expect(migrationSrc).toContain('ALTER TABLE "VisaApplicationToken"')
    expect(migrationSrc).toContain('ALTER TABLE "DocumentRequest"')
    expect(migrationSrc).not.toMatch(/CREATE TABLE|\bDROP\b|\bDELETE\b|\bUPDATE\b/i)
    expect(migrationSrc).toContain("'inbox_ux43' AS migration")
  })

  it('Prisma models gained the columns (SQL-editor-managed)', () => {
    const schema = read('prisma/schema.prisma')
    const tokenModel = schema.slice(schema.indexOf('model VisaApplicationToken'), schema.indexOf('model VisaApplicationMessage'))
    expect(tokenModel).toContain('conversationId Int?')
    expect(tokenModel).toContain('NEVER prisma db push')
  })
})
