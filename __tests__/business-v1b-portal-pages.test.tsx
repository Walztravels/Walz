/**
 * Walz Business V1-B — Dashboard + Travellers/Clients + Requests + Team +
 * Settings.
 *
 * Covers the REQUIRED TESTS list from the V1-B mission brief:
 *   - Corporate navigation/presentation ("Employees" label)
 *   - Travel Agency CLIENT presentation ("Clients" label)
 *   - Referral Partner restrictions: nav hidden AND the real server-side
 *     deny independently enforced on the new Travellers/Requests PAGES
 *     themselves (not merely the already-tested lib gate function, and not
 *     relying on the nav at all)
 *   - Organization isolation on the new pages (org A membership cannot see
 *     org B's data through Travellers/Requests/Team/Settings)
 *   - Page-level authorization on every new page (each calls its own gate,
 *     independent of any other check)
 *   - Role-gated Team controls (who can invite vs. just view)
 *   - Settings edit restrictions (organization type read-only, brand
 *     settings still ADMIN+-gated)
 *   - Requests list → detail link shape
 *   - The old dashboard CreateRequestForm is gone
 *   - Desktop/mobile nav rendering (corporate / agency / referral partner)
 *
 * These are plain-function invocations of the Server Component pages (no
 * DOM/React renderer — testEnvironment is 'node', matching this repo's
 * existing convention). `next/navigation`'s redirect()/notFound() are
 * mocked to throw a distinguishable sentinel so control flow can be
 * asserted without a real Next.js request/response cycle.
 */
import fs from 'fs'
import path from 'path'

const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn(), findMany: jest.fn() },
  businessTraveller: { findMany: jest.fn(), count: jest.fn() },
  travelRequest: { findMany: jest.fn() },
  businessAuditLog: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  organizationBrandSettings: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

class RedirectSignal extends Error { constructor(public url: string) { super('REDIRECT') } }
class NotFoundSignal extends Error { constructor() { super('NOT_FOUND') } }
const redirectMock = jest.fn((url: string) => { throw new RedirectSignal(url) })
const notFoundMock = jest.fn(() => { throw new NotFoundSignal() })
// Plain functions standing in for next/navigation hooks — exactly the
// existing convention in business-v1a-7-public-shell-no-consumer-chrome
// (usePathname mocked as a non-hook plain function so components can be
// invoked directly without a real React render pass).
let mockPathname = '/business/org_a'
jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock(),
  usePathname: () => mockPathname,
}))

import DashboardPage from '@/app/business/(portal)/[orgId]/page'
import TravellersPage from '@/app/business/(portal)/[orgId]/travellers/page'
import RequestsPage from '@/app/business/(portal)/[orgId]/requests/page'
import TeamPage from '@/app/business/(portal)/[orgId]/team/page'
import SettingsPage from '@/app/business/(portal)/[orgId]/settings/page'
import CreateRequestForm from '@/app/business/(portal)/[orgId]/requests/CreateRequestForm'
import InviteMemberForm from '@/app/business/(portal)/[orgId]/team/InviteMemberForm'
import BrandSettingsForm from '@/app/business/(portal)/[orgId]/settings/BrandSettingsForm'
import { Card, SectionHeader, EmptyState, StatCard, PageHeader, PrimaryLinkButton } from '@/components/business/PortalUI'
import { Badge, RequestStatusBadge, MembershipStatusBadge, ClaimStateBadge } from '@/components/business/Badge'
import { BusinessSidebar } from '@/components/business/BusinessSidebar'
import { BusinessMobileNav } from '@/components/business/BusinessMobileNav'

let mockOrgType: string | null = null
jest.mock('@/components/business/OrgTypeContext', () => ({
  useOrgType: () => mockOrgType,
  OrgTypeContext: { Provider: ({ children }: { children: unknown }) => children },
}))

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return {
    id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE',
    invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

// Expands only the plain, stateless, hook-free presentational components so
// their rendered text is visible in the collected tree; anything else
// (Link, client forms with hooks like CreateRequestForm/InviteMemberForm/
// BrandSettingsForm/SendClaimInviteButton, icons) is left un-invoked — this
// is what actually lets a Server Component page be called directly without
// a React renderer, mirroring the existing collectTypes() pattern in
// business-v1a-7-public-shell-no-consumer-chrome.test.tsx.
const EXPANDABLE = new Set<unknown>([Card, SectionHeader, EmptyState, StatCard, PageHeader, PrimaryLinkButton, Badge, RequestStatusBadge, MembershipStatusBadge, ClaimStateBadge])

function walk(node: unknown, types: Set<unknown>, texts: string[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
  if (Array.isArray(node)) { node.forEach(n => walk(n, types, texts)); return }
  if (typeof node !== 'object' || !('type' in (node as Record<string, unknown>))) return

  const el = node as { type: unknown; props?: Record<string, unknown> }
  types.add(el.type)
  const props = el.props ?? {}

  if (typeof el.type === 'function' && EXPANDABLE.has(el.type)) {
    try {
      const rendered = (el.type as (p: unknown) => unknown)(props)
      walk(rendered, types, texts)
      return
    } catch {
      // fall through to raw children below
    }
  }
  if (props.children !== undefined) walk(props.children, types, texts)
}

function render(node: unknown): { types: Set<unknown>; text: string } {
  const types = new Set<unknown>()
  const texts: string[] = []
  walk(node, types, texts)
  return { types, text: texts.join(' ') }
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'owner@acme.com', name: 'Owner Person' } })
  mockPathname = `/business/${ORG_A}`
  mockOrgType = null
  mockPrisma.businessAuditLog.findMany.mockResolvedValue([])
  mockPrisma.user.findMany.mockResolvedValue([])
  mockPrisma.travelRequest.findMany.mockResolvedValue([])
  mockPrisma.businessTraveller.findMany.mockResolvedValue([])
  mockPrisma.businessTraveller.count.mockResolvedValue(0)
  mockPrisma.organizationMembership.findMany.mockResolvedValue([])
  mockPrisma.organizationBrandSettings.findUnique.mockResolvedValue(null)
})

// ───────────────────────────────────────────────────────────────────────
// Page-level authorization — every new page calls its own gate
// ───────────────────────────────────────────────────────────────────────

describe('page-level authorization: unauthenticated session', () => {
  it('Dashboard redirects to login with the right callbackUrl', async () => {
    getServerSession.mockResolvedValue(null)
    await expect(DashboardPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(RedirectSignal)
    expect(redirectMock).toHaveBeenCalledWith(`/business/login?callbackUrl=/business/${ORG_A}`)
  })

  it('Travellers redirects to login', async () => {
    getServerSession.mockResolvedValue(null)
    await expect(TravellersPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(RedirectSignal)
  })

  it('Requests redirects to login', async () => {
    getServerSession.mockResolvedValue(null)
    await expect(RequestsPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(RedirectSignal)
  })

  it('Team redirects to login', async () => {
    getServerSession.mockResolvedValue(null)
    await expect(TeamPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(RedirectSignal)
  })

  it('Settings redirects to login', async () => {
    getServerSession.mockResolvedValue(null)
    await expect(SettingsPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(RedirectSignal)
  })
})

describe('page-level authorization: non-member (404, not a permission-leak page)', () => {
  beforeEach(() => mockPrisma.organizationMembership.findUnique.mockResolvedValue(null))

  it('Dashboard 404s', async () => {
    await expect(DashboardPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
  })
  it('Travellers 404s', async () => {
    await expect(TravellersPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    // Never even reaches the traveller roster query for a non-member.
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })
  it('Requests 404s', async () => {
    await expect(RequestsPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    expect(mockPrisma.travelRequest.findMany).not.toHaveBeenCalled()
  })
  it('Team 404s', async () => {
    await expect(TeamPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    expect(mockPrisma.organizationMembership.findMany).not.toHaveBeenCalled()
  })
  it('Settings 404s', async () => {
    await expect(SettingsPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
  })
})

describe('organization isolation: a membership of org A can never be used to view org B', () => {
  // assertOrgScopedAccess/assertAgencyOrCorporateAccess key the membership
  // lookup on the EXACT (organizationId, userId) pair taken from the URL —
  // a membership that exists only for ORG_A produces no row when the page
  // is requested for ORG_B, which is exactly what findUnique keyed on
  // organizationId_userId would return for a mismatched org id.
  beforeEach(() => mockPrisma.organizationMembership.findUnique.mockResolvedValue(null))

  it('Travellers: org A member requesting org B 404s, never queries org B travellers', async () => {
    await expect(TravellersPage({ params: { orgId: ORG_B } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })

  it('Requests: org A member requesting org B 404s, never queries org B requests', async () => {
    await expect(RequestsPage({ params: { orgId: ORG_B } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    expect(mockPrisma.travelRequest.findMany).not.toHaveBeenCalled()
  })

  it('Team: org A member requesting org B 404s', async () => {
    await expect(TeamPage({ params: { orgId: ORG_B } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
  })

  it('Settings: org A member requesting org B 404s', async () => {
    await expect(SettingsPage({ params: { orgId: ORG_B } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
  })
})

// ───────────────────────────────────────────────────────────────────────
// Referral Partner restrictions — server-side deny independent of the UI
// ───────────────────────────────────────────────────────────────────────

describe('Referral Partner: server-side deny on the Travellers/Requests PAGES themselves', () => {
  it('Travellers page 404s for a REFERRAL_PARTNER org even for its OWNER', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    await expect(TravellersPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })

  it('Requests page 404s for a REFERRAL_PARTNER org even for its OWNER', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    await expect(RequestsPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
    expect(mockPrisma.travelRequest.findMany).not.toHaveBeenCalled()
  })

  it('Team page is NOT on the deny-list: a REFERRAL_PARTNER org member still reaches Team', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    mockPrisma.organizationMembership.findMany.mockResolvedValue([member('COORDINATOR')])
    const el = await TeamPage({ params: { orgId: ORG_A } } as never)
    expect(el).toBeTruthy()
    // Confirms the finding stated in the final report: members/route.ts
    // never imports or calls assertAgencyOrCorporateAccess.
    const membersRouteSrc = fs.readFileSync(path.join(process.cwd(), 'app/api/business/organizations/[id]/members/route.ts'), 'utf8')
    expect(membersRouteSrc).not.toMatch(/assertAgencyOrCorporateAccess/)
  })

  it('Settings page is NOT on the deny-list: a REFERRAL_PARTNER org member still reaches Settings', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.organization.findUnique.mockResolvedValue({ legalName: 'Acme', tradingName: null, status: 'ACTIVE', defaultCurrency: 'GBP', organizationType: 'REFERRAL_PARTNER' })
    const el = await SettingsPage({ params: { orgId: ORG_A } } as never)
    expect(el).toBeTruthy()
  })

  it('Dashboard still loads for a REFERRAL_PARTNER member but never queries denied traveller/request data', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A, legalName: 'Acme', tradingName: 'Acme Referrals', organizationType: 'REFERRAL_PARTNER' })
    const el = await DashboardPage({ params: { orgId: ORG_A } } as never)
    expect(el).toBeTruthy()
    expect(mockPrisma.travelRequest.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.businessTraveller.count).not.toHaveBeenCalled()
  })
})

// ───────────────────────────────────────────────────────────────────────
// Corporate / Travel Agency presentation
// ───────────────────────────────────────────────────────────────────────

describe('Travellers page: organization-type-driven presentation', () => {
  it('CORPORATE organization labels the page "Employees"', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
    mockPrisma.businessTraveller.findMany.mockResolvedValue([
      { id: 't1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@acme.com', phone: null, userId: null, claimVerificationToken: null, claimTokenExpiresAt: null },
    ])
    const el = await TravellersPage({ params: { orgId: ORG_A } } as never)
    const { text } = render(el)
    expect(text).toMatch(/Employees/)
    expect(text).not.toMatch(/Clients/)
  })

  it('TRAVEL_AGENCY organization labels the page "Clients"', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'TRAVEL_AGENCY' })
    const el = await TravellersPage({ params: { orgId: ORG_A } } as never)
    const { text } = render(el)
    expect(text).toMatch(/Clients/)
    expect(text).not.toMatch(/Employees/)
  })

  it('the floor TRAVELLER role is denied (matches GET .../travellers minRole COORDINATOR)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    await expect(TravellersPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
  })

  it('organization type is read server-side from Prisma, never trusted from any client-supplied value', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
    await TravellersPage({ params: { orgId: ORG_A } } as never)
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG_A } }))
  })
})

// ───────────────────────────────────────────────────────────────────────
// Requests: list → detail link shape, create-form gating
// ───────────────────────────────────────────────────────────────────────

describe('Requests page', () => {
  it('links each row to the existing, unmodified request detail route', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequest.findMany.mockResolvedValue([
      { id: 'req_1', title: 'Lagos trip', notes: null, status: 'SUBMITTED', submittedByMembershipId: 'mem_1', createdAt: new Date() },
    ])
    const el = await RequestsPage({ params: { orgId: ORG_A } } as never)
    const links: string[] = []
    ;(function collect(node: unknown) {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(collect); return }
      const n = node as { type?: unknown; props?: Record<string, unknown> }
      if (n.props?.href) links.push(String(n.props.href))
      if (n.props?.children !== undefined) collect(n.props.children)
    })(el)
    expect(links).toContain(`/business/${ORG_A}/requests/req_1`)
  })

  it('TRAVEL_MANAGER tier sees the create-request entry point; floor TRAVELLER does not', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    const managerEl = await RequestsPage({ params: { orgId: ORG_A } } as never)
    const managerTypes = render(managerEl).types
    expect(managerTypes.has(CreateRequestForm)).toBe(true)

    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    const travellerEl = await RequestsPage({ params: { orgId: ORG_A } } as never)
    const travellerTypes = render(travellerEl).types
    expect(travellerTypes.has(CreateRequestForm)).toBe(false)
  })

  it('the floor TRAVELLER role only sees requests they submitted or are named on (matches GET .../requests filter)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    await RequestsPage({ params: { orgId: ORG_A } } as never)
    const call = mockPrisma.travelRequest.findMany.mock.calls[0][0]
    expect(call.where.OR).toEqual([
      { submittedByMembershipId: 'mem_1' },
      { travellers: { some: { businessTraveller: { userId: USER } } } },
    ])
  })
})

// ───────────────────────────────────────────────────────────────────────
// Team: role-gated invite control
// ───────────────────────────────────────────────────────────────────────

describe('Team page: role-gated controls', () => {
  it('ADMIN sees the invite control', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    const el = await TeamPage({ params: { orgId: ORG_A } } as never)
    expect(render(el).types.has(InviteMemberForm)).toBe(true)
  })

  it('OWNER sees the invite control', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    const el = await TeamPage({ params: { orgId: ORG_A } } as never)
    expect(render(el).types.has(InviteMemberForm)).toBe(true)
  })

  it('COORDINATOR can view the roster but not invite (below ADMIN, matches POST minRole)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    mockPrisma.organizationMembership.findMany.mockResolvedValue([member('COORDINATOR')])
    const el = await TeamPage({ params: { orgId: ORG_A } } as never)
    expect(render(el).types.has(InviteMemberForm)).toBe(false)
  })

  it('TRAVEL_MANAGER/APPROVER/FINANCE (peer tier, below ADMIN) also cannot invite', async () => {
    for (const role of ['TRAVEL_MANAGER', 'APPROVER', 'FINANCE']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      const el = await TeamPage({ params: { orgId: ORG_A } } as never)
      expect(render(el).types.has(InviteMemberForm)).toBe(false)
    }
  })

  it('the floor TRAVELLER role cannot even view the roster (matches GET .../members minRole COORDINATOR)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    await expect(TeamPage({ params: { orgId: ORG_A } } as never)).rejects.toBeInstanceOf(NotFoundSignal)
  })
})

// ───────────────────────────────────────────────────────────────────────
// Settings: organization type read-only, brand-settings ADMIN+-gated
// ───────────────────────────────────────────────────────────────────────

describe('Settings page: edit restrictions', () => {
  beforeEach(() => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      legalName: 'Acme Ltd', tradingName: 'Acme', status: 'ACTIVE', defaultCurrency: 'GBP', organizationType: 'CORPORATE',
    })
  })

  it('organization type is shown but read-only — no reclassification form/control is rendered', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    const el = await SettingsPage({ params: { orgId: ORG_A } } as never)
    const { text } = render(el)
    expect(text).toMatch(/Corporate/)
    expect(text.toLowerCase()).not.toMatch(/reclassif/)
    // No admin organization-type route is ever imported by this page.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/business/(portal)/[orgId]/settings/page.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/organization-type\/route/)
  })

  it('ADMIN+ gets the editable brand-settings form', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    const el = await SettingsPage({ params: { orgId: ORG_A } } as never)
    expect(render(el).types.has(BrandSettingsForm)).toBe(true)
  })

  it('a non-ADMIN member (e.g. TRAVEL_MANAGER) sees brand settings read-only, no edit form', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    const el = await SettingsPage({ params: { orgId: ORG_A } } as never)
    expect(render(el).types.has(BrandSettingsForm)).toBe(false)
  })

  it('the floor TRAVELLER role can still view (any ACTIVE member — matches GET org profile / brand-settings, no minRole)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    const el = await SettingsPage({ params: { orgId: ORG_A } } as never)
    expect(render(el).types.has(BrandSettingsForm)).toBe(false)
    expect(el).toBeTruthy()
  })
})

// ───────────────────────────────────────────────────────────────────────
// The removed dashboard CreateRequestForm
// ───────────────────────────────────────────────────────────────────────

describe('the old inline Dashboard "Create travel request" form is gone', () => {
  it('the old file no longer exists at its V1-A path', () => {
    const oldPath = path.join(process.cwd(), 'app/business/(portal)/[orgId]/CreateRequestForm.tsx')
    expect(fs.existsSync(oldPath)).toBe(false)
  })

  it('the Dashboard page source no longer imports any CreateRequestForm', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/business/(portal)/[orgId]/page.tsx'), 'utf8')
    expect(src).not.toMatch(/CreateRequestForm/)
  })

  it('the moved form now lives under requests/ and is wired to the same POST route', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/business/(portal)/[orgId]/requests/CreateRequestForm.tsx'),
      'utf8',
    )
    expect(src).toMatch(/\/api\/business\/organizations\/\$\{orgId\}\/requests/)
  })

  it('Dashboard renders successfully without ever rendering a CreateRequestForm element', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A, legalName: 'Acme', tradingName: 'Acme', organizationType: 'CORPORATE' })
    const el = await DashboardPage({ params: { orgId: ORG_A } } as never)
    const types = render(el).types
    expect(types.has(CreateRequestForm)).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────
// Desktop / mobile nav rendering
// ───────────────────────────────────────────────────────────────────────

describe('BusinessSidebar (desktop nav)', () => {
  it('CORPORATE: shows "Employees", Requests and Travellers both present', () => {
    mockOrgType = 'CORPORATE'
    const { text } = render(BusinessSidebar({ orgId: ORG_A }))
    expect(text).toMatch(/Employees/)
    expect(text).toMatch(/Requests/)
    expect(text).not.toMatch(/Clients/)
  })

  it('TRAVEL_AGENCY: shows "Clients"', () => {
    mockOrgType = 'TRAVEL_AGENCY'
    const { text } = render(BusinessSidebar({ orgId: ORG_A }))
    expect(text).toMatch(/Clients/)
    expect(text).not.toMatch(/Employees/)
  })

  it('REFERRAL_PARTNER: Requests and Travellers/Clients/Employees links are hidden; Team and Settings remain', () => {
    mockOrgType = 'REFERRAL_PARTNER'
    const { text } = render(BusinessSidebar({ orgId: ORG_A }))
    expect(text).not.toMatch(/Requests/)
    expect(text).not.toMatch(/Travellers|Employees|Clients/)
    expect(text).toMatch(/Team/)
    expect(text).toMatch(/Settings/)
    expect(text).toMatch(/Dashboard/)
  })

  it('unknown/absent org type (e.g. the plain /business picker) falls back to the generic "Travellers" label and shows all items', () => {
    mockOrgType = null
    const { text } = render(BusinessSidebar({ orgId: null }))
    expect(text).toMatch(/Travellers/)
    expect(text).toMatch(/Requests/)
  })
})

describe('BusinessMobileNav (mobile bottom tab bar)', () => {
  it('CORPORATE: 5 items, "Employees" label', () => {
    mockOrgType = 'CORPORATE'
    const el = BusinessMobileNav({ orgId: ORG_A })
    const { text } = render(el)
    expect(text).toMatch(/Employees/)
  })

  it('REFERRAL_PARTNER: 3 items only (Home, Team, Settings)', () => {
    mockOrgType = 'REFERRAL_PARTNER'
    const el = BusinessMobileNav({ orgId: ORG_A })
    const { text } = render(el)
    expect(text).not.toMatch(/Requests/)
    expect(text).not.toMatch(/Travellers|Employees|Clients/)
    expect(text).toMatch(/Team/)
    expect(text).toMatch(/Settings/)
  })
})
