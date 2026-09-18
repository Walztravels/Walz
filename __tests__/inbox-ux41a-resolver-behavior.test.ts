/**
 * INBOX UX-4.1A — resolveClientActionContext BEHAVIORAL tests.
 *
 * The pin suite (inbox-ux41a-client-context) proves source invariants by
 * string inspection; this suite EXECUTES the resolver against mocked
 * stores so the fail-closed contract is enforced behaviorally:
 *  - no session → 401 with zero data reads
 *  - ambiguous identity (two users, one email) → UNRESOLVED with every
 *    identity field nulled
 *  - link-table failure → degrades to heuristics, never throws/500s
 *  - active verified link → VERIFIED with the application DTO
 *  - heuristic derivations land in heuristicCandidates, never in the
 *    primary identity fields (security review L2)
 */

const mockPrisma = {
  conversationClientLink: { findFirst: jest.fn() },
  applicationVerification: { findUnique: jest.fn() },
  visaApplication: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  clientAccount: { findMany: jest.fn() },
  lead: { findMany: jest.fn() },
}
let supabaseLeadRows: Record<string, unknown>[] = []

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: async () => ({ data: supabaseLeadRows, error: null }),
        maybeSingle: async () => ({ data: supabaseLeadRows[0] ?? null, error: null }),
      }
      return chain
    },
  }),
}))
jest.mock('@/lib/chatwoot/config', () => ({ adminChatwootOrNull: () => null }))
jest.mock('@/lib/inbox/authz', () => ({
  checkInboxPermission: () => ({ allowed: true }),
  checkConversationAccess: async () => ({ allowed: true }),
}))
jest.mock('@/lib/secure-lookup/masking', () => ({ safeStatusLabel: (s: string) => s }))

import { resolveClientActionContext } from '@/lib/inbox/client-context'

const SESSION = { email: 'staff@walztravels.com' } as never

beforeEach(() => {
  jest.clearAllMocks()
  supabaseLeadRows = []
  mockPrisma.conversationClientLink.findFirst.mockResolvedValue(null)
  mockPrisma.applicationVerification.findUnique.mockResolvedValue(null)
  mockPrisma.visaApplication.findUnique.mockResolvedValue(null)
  mockPrisma.user.findMany.mockResolvedValue([])
  mockPrisma.clientAccount.findMany.mockResolvedValue([])
  mockPrisma.lead.findMany.mockResolvedValue([])
})

it('no session → 401 and NO identity data is read', async () => {
  const res = await resolveClientActionContext(318, null as never)
  expect(res).toEqual({ ok: false, status: 401, error: 'Unauthorized' })
  expect(mockPrisma.conversationClientLink.findFirst).not.toHaveBeenCalled()
  expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
})

it('two users for one email → UNRESOLVED with EVERY identity field nulled', async () => {
  supabaseLeadRows = [{ id: 'lead-1', name: 'Amaka', email: 'dup@example.com', whatsapp_number: '+2348031234567' }]
  mockPrisma.user.findMany.mockResolvedValue([
    { id: 'u1', name: 'A', email: 'dup@example.com' },
    { id: 'u2', name: 'B', email: 'dup@example.com' },
  ])
  const res = await resolveClientActionContext(318, SESSION)
  if (!res.ok) throw new Error('expected ok')
  expect(res.context.resolution).toBe('UNRESOLVED')
  expect(res.context.user).toBeNull()
  expect(res.context.clientAccount).toBeNull()
  expect(res.context.prismaLead).toBeNull()
  expect(res.context.supabaseLead).toBeNull()
  expect(res.context.heuristicCandidates).toBeNull()
  expect(res.context.ambiguityReasons).toContain('multiple_users_for_email')
})

it('link-table read failure degrades to UNRESOLVED — never a throw', async () => {
  mockPrisma.conversationClientLink.findFirst.mockRejectedValue(new Error('relation does not exist'))
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const res = await resolveClientActionContext(318, SESSION)
  warn.mockRestore()
  if (!res.ok) throw new Error('expected ok')
  expect(res.context.resolution).toBe('UNRESOLVED')
  expect(res.context.ambiguityReasons).toContain('link_table_unavailable')
})

it('active link with a verified verification → VERIFIED with the application DTO', async () => {
  mockPrisma.conversationClientLink.findFirst.mockResolvedValue({
    id: 'lnk1', linkMethod: 'otp_verified', linkedBy: 'staff@walztravels.com',
    verificationId: 'ver1', visaApplicationId: 'appA',
    supabaseLeadId: null, prismaLeadId: null, userId: null, clientAccountId: null,
    createdAt: new Date('2026-09-18T12:00:00Z'),
  })
  mockPrisma.applicationVerification.findUnique.mockResolvedValue({ status: 'verified' })
  mockPrisma.visaApplication.findUnique.mockResolvedValue({
    id: 'appA', referenceNumber: 'WALZ-ABC123', destinationIso2: 'gb',
    visaType: 'tourist', status: 'under_review',
  })
  const res = await resolveClientActionContext(318, SESSION)
  if (!res.ok) throw new Error('expected ok')
  expect(res.context.resolution).toBe('VERIFIED')
  expect(res.context.application?.walzRef).toBe('WALZ-ABC123')
  expect(res.context.link?.linkMethod).toBe('otp_verified')
  // link path never runs heuristics
  expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
})

it('clean heuristic derivations populate heuristicCandidates ONLY (primary fields stay null)', async () => {
  supabaseLeadRows = [{ id: 'lead-9', name: 'Kojo', email: 'kojo@example.com', whatsapp_number: '+233554000000' }]
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'u9', name: 'Kojo', email: 'kojo@example.com' }])
  const res = await resolveClientActionContext(318, SESSION)
  if (!res.ok) throw new Error('expected ok')
  expect(res.context.resolution).toBe('HEURISTIC')
  expect(res.context.user).toBeNull()
  expect(res.context.supabaseLead).toBeNull()
  expect(res.context.heuristicCandidates?.user?.id).toBe('u9')
  expect(res.context.heuristicCandidates?.supabaseLead?.id).toBe('lead-9')
  expect(res.context.ambiguityReasons).toContain('user_matched_by_exact_normalized_email')
})
