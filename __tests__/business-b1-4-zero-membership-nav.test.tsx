/**
 * Walz Business Track B1 — B1.4: Zero-membership navigation.
 *
 * BACKGROUND: BusinessSidebar.tsx/BusinessMobileNav.tsx's buildNavItems()
 * unconditionally included Dashboard/Requests/Travellers/Team/Settings
 * regardless of whether the signed-in user has ANY active
 * OrganizationMembership row. Presentation-only (every real destination
 * already independently fail-closes via assertOrgScopedAccess /
 * assertAgencyOrCorporateAccess — see business-v1b-portal-pages.test.tsx),
 * but misleading. Fix: a new `hasOrganizations` prop (sourced from the
 * EXISTING ACTIVE-membership query in app/business/(portal)/layout.tsx via
 * BusinessShell — no new query, no schema change) gates the whole
 * operational item list, defaulting to `true` so every other existing call
 * site/test is unaffected.
 */
import { BusinessSidebar } from '@/components/business/BusinessSidebar'
import { BusinessMobileNav } from '@/components/business/BusinessMobileNav'

jest.mock('next/navigation', () => ({ usePathname: () => '/business' }))

let mockOrgType: string | null = null
jest.mock('@/components/business/OrgTypeContext', () => ({
  useOrgType: () => mockOrgType,
  OrgTypeContext: { Provider: ({ children }: { children: unknown }) => children },
}))

// Same render-without-a-real-DOM helper used by business-v1b-portal-pages —
// walks the React element tree and collects rendered text / element types,
// which is enough to assert nav-item presence/absence without a full DOM.
function walk(node: unknown, texts: string[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
  if (Array.isArray(node)) { node.forEach(n => walk(n, texts)); return }
  if (typeof node !== 'object' || !('type' in (node as Record<string, unknown>))) return
  const props = (node as { props?: Record<string, unknown> }).props ?? {}
  if (props.children !== undefined) walk(props.children, texts)
}
function textOf(node: unknown): string {
  const texts: string[] = []
  walk(node, texts)
  return texts.join(' ')
}
function hrefsOf(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach(n => hrefsOf(n, out)); return out }
  const n = node as { props?: Record<string, unknown> }
  if (typeof n.props?.href === 'string') out.push(n.props.href as string)
  if (n.props?.children !== undefined) hrefsOf(n.props.children, out)
  return out
}

beforeEach(() => { mockOrgType = null })

describe('BusinessSidebar: zero-membership state', () => {
  it('hides ALL operational nav items (Dashboard/Requests/Travellers/Team/Settings) when hasOrganizations is false', () => {
    const text = textOf(BusinessSidebar({ orgId: null, hasOrganizations: false }))
    expect(text).not.toMatch(/Dashboard/)
    expect(text).not.toMatch(/Requests/)
    expect(text).not.toMatch(/Travellers|Employees|Clients/)
    expect(text).not.toMatch(/Team/)
    expect(text).not.toMatch(/Settings/)
  })

  it('no operational hrefs (/business/requests, /business/team, etc.) are present when hasOrganizations is false', () => {
    const hrefs = hrefsOf(BusinessSidebar({ orgId: null, hasOrganizations: false }))
    expect(hrefs.every(h => h === '/business')).toBe(true)
  })

  it('shows a minimal explanatory state that still allows sign-out and an invitation link', () => {
    const text = textOf(BusinessSidebar({ orgId: null, hasOrganizations: false }))
    expect(text).toMatch(/not a member of any organization/i)
    expect(text.toLowerCase()).toMatch(/sign out/)
    expect(text.toLowerCase()).toMatch(/invitation link/)
  })

  it('does NOT fake an application/verification-status concept (out of scope — Track B2)', () => {
    const text = textOf(BusinessSidebar({ orgId: null, hasOrganizations: false }))
    expect(text.toLowerCase()).not.toMatch(/pending verification|application status|company approval|under review/)
  })

  it('REGRESSION: hasOrganizations omitted (default true) behaves exactly as before — the org-picker page with orgId null still shows all items', () => {
    const text = textOf(BusinessSidebar({ orgId: null }))
    expect(text).toMatch(/Travellers/)
    expect(text).toMatch(/Requests/)
    expect(text).toMatch(/Dashboard/)
    expect(text).toMatch(/Team/)
    expect(text).toMatch(/Settings/)
  })

  it('REGRESSION: an ACTIVE member with a real org (hasOrganizations true, explicit) sees the full, unchanged nav', () => {
    mockOrgType = 'CORPORATE'
    const text = textOf(BusinessSidebar({ orgId: 'org_1', hasOrganizations: true }))
    expect(text).toMatch(/Dashboard/)
    expect(text).toMatch(/Requests/)
    expect(text).toMatch(/Employees/)
    expect(text).toMatch(/Team/)
    expect(text).toMatch(/Settings/)
  })

  it('REGRESSION: REFERRAL_PARTNER nav remains consistent with existing design (Requests/Travellers hidden, Team/Settings shown) when hasOrganizations is true', () => {
    mockOrgType = 'REFERRAL_PARTNER'
    const text = textOf(BusinessSidebar({ orgId: 'org_1', hasOrganizations: true }))
    expect(text).not.toMatch(/Requests/)
    expect(text).not.toMatch(/Travellers|Employees|Clients/)
    expect(text).toMatch(/Team/)
    expect(text).toMatch(/Settings/)
    expect(text).toMatch(/Dashboard/)
  })
})

describe('BusinessMobileNav: zero-membership state', () => {
  it('hides ALL operational nav items when hasOrganizations is false', () => {
    const text = textOf(BusinessMobileNav({ orgId: null, hasOrganizations: false }))
    expect(text).not.toMatch(/Home/)
    expect(text).not.toMatch(/Requests/)
    expect(text).not.toMatch(/Travellers|Employees|Clients/)
    expect(text).not.toMatch(/Team/)
    expect(text).not.toMatch(/Settings/)
    expect(text.toLowerCase()).toMatch(/sign out/)
    expect(text.toLowerCase()).toMatch(/invitation link/)
  })

  it('no operational hrefs are present when hasOrganizations is false', () => {
    const hrefs = hrefsOf(BusinessMobileNav({ orgId: null, hasOrganizations: false }))
    expect(hrefs.length).toBe(0)
  })

  it('REGRESSION: hasOrganizations omitted (default true) behaves exactly as before', () => {
    mockOrgType = 'CORPORATE'
    const text = textOf(BusinessMobileNav({ orgId: 'org_1' }))
    expect(text).toMatch(/Employees/)
    expect(text).toMatch(/Home/)
  })

  it('REGRESSION: REFERRAL_PARTNER nav remains consistent with existing design (3 items only) when hasOrganizations is true', () => {
    mockOrgType = 'REFERRAL_PARTNER'
    const text = textOf(BusinessMobileNav({ orgId: 'org_1', hasOrganizations: true }))
    expect(text).not.toMatch(/Requests/)
    expect(text).not.toMatch(/Travellers|Employees|Clients/)
    expect(text).toMatch(/Team/)
    expect(text).toMatch(/Settings/)
  })
})

// Finds every element of the given `type` anywhere in a React element tree
// and returns its props — without invoking/rendering anything (a plain
// React.createElement(...) call already stores `.props` on the returned
// element object, so no renderer is needed).
function findElementProps(node: unknown, type: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach(n => findElementProps(n, type, out)); return out }
  const n = node as { type?: unknown; props?: Record<string, unknown> }
  if (n.type === type) out.push(n.props ?? {})
  if (n.props?.children !== undefined) findElementProps(n.props.children, type, out)
  return out
}

describe('BusinessShell: wires hasOrganizations from the organizations list it already receives', () => {
  function setup(pathname: string) {
    jest.resetModules()
    jest.doMock('next/navigation', () => ({ usePathname: () => pathname }))
    jest.doMock('@/components/business/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
    jest.doMock('@/components/business/AccountMenu', () => ({ AccountMenu: () => null }))
    const { BusinessShell } = require('@/components/business/BusinessShell')
    const { BusinessSidebar } = require('@/components/business/BusinessSidebar')
    const { BusinessMobileNav } = require('@/components/business/BusinessMobileNav')
    return { BusinessShell, BusinessSidebar, BusinessMobileNav }
  }

  it('passes hasOrganizations=false through to both navs when organizations is empty (no new query)', () => {
    const { BusinessShell, BusinessSidebar, BusinessMobileNav } = setup('/business')
    const el = BusinessShell({ user: { name: 'A', email: 'a@a.com' }, organizations: [], children: null })

    expect(findElementProps(el, BusinessSidebar)[0].hasOrganizations).toBe(false)
    expect(findElementProps(el, BusinessMobileNav)[0].hasOrganizations).toBe(false)
  })

  it('passes hasOrganizations=true when organizations has 1+ entries', () => {
    const { BusinessShell, BusinessSidebar, BusinessMobileNav } = setup('/business/org_1')
    const el = BusinessShell({
      user: { name: 'A', email: 'a@a.com' },
      organizations: [{ id: 'org_1', name: 'Acme' }],
      children: null,
    })

    expect(findElementProps(el, BusinessSidebar)[0].hasOrganizations).toBe(true)
    expect(findElementProps(el, BusinessMobileNav)[0].hasOrganizations).toBe(true)
  })
})
