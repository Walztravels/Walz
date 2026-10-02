/**
 * Walz Business V1-A — item 7 of the required test list:
 * "/business/** routes render with zero consumer Navbar/Footer/cart/
 * retail-nav markup (source or snapshot assertion)."
 *
 * components/common/PublicShell.tsx is rendered ONCE at the root
 * (app/layout.tsx) and branches internally on usePathname(). This test
 * calls it directly (it is a plain function component with no hooks other
 * than the mocked usePathname) and inspects the returned React element
 * tree's component types — no Navbar, Footer, CurrencyConverter or
 * ExitIntentPopup type may appear anywhere in the tree for a /business/**
 * pathname, exactly like the pre-existing /admin behaviour this mirrors.
 */
let mockPathname = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }))

import { PublicShell } from '@/components/common/PublicShell'
import { Navbar } from '@/components/common/Navbar'
import { Footer } from '@/components/common/Footer'
import { ExitIntentPopup } from '@/components/common/ExitIntentPopup'

function collectTypes(node: unknown, out: Set<unknown> = new Set()): Set<unknown> {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach(n => collectTypes(n, out))
    return out
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if ('type' in el) {
    out.add(el.type)
    const children = el.props?.children
    if (children !== undefined) collectTypes(children, out)
  }
  return out
}

describe('PublicShell — Business V1-A: zero consumer chrome on /business/**', () => {
  it('a /business root path renders bare children — no Navbar/Footer/CurrencyConverter/ExitIntentPopup', () => {
    mockPathname = '/business'
    const el = PublicShell({ children: 'business-content' as unknown as React.ReactNode })
    const types = collectTypes(el)
    expect(types.has(Navbar)).toBe(false)
    expect(types.has(Footer)).toBe(false)
    expect(types.has(ExitIntentPopup)).toBe(false)
  })

  it('a nested /business/<orgId> path also renders bare children', () => {
    mockPathname = '/business/org_123'
    const el = PublicShell({ children: 'business-org-content' as unknown as React.ReactNode })
    const types = collectTypes(el)
    expect(types.has(Navbar)).toBe(false)
    expect(types.has(Footer)).toBe(false)
  })

  it('/business/login and /business/register are also covered (prefix match, not exact)', () => {
    for (const pathname of ['/business/login', '/business/register', '/business/invitations/abc123']) {
      mockPathname = pathname
      const el = PublicShell({ children: 'x' as unknown as React.ReactNode })
      const types = collectTypes(el)
      expect(types.has(Navbar)).toBe(false)
      expect(types.has(Footer)).toBe(false)
    }
  })

  it('a path that merely contains "business" elsewhere is NOT treated as a /business/** route (prefix, not substring)', () => {
    mockPathname = '/our-business-story'
    const el = PublicShell({ children: 'x' as unknown as React.ReactNode })
    const types = collectTypes(el)
    expect(types.has(Navbar)).toBe(true)
    expect(types.has(Footer)).toBe(true)
  })

  it('regression: /admin still renders bare children (unchanged pre-existing behaviour)', () => {
    mockPathname = '/admin/clients'
    const el = PublicShell({ children: 'x' as unknown as React.ReactNode })
    const types = collectTypes(el)
    expect(types.has(Navbar)).toBe(false)
    expect(types.has(Footer)).toBe(false)
  })

  it('regression: an ordinary consumer route still gets the full shell', () => {
    mockPathname = '/flights'
    const el = PublicShell({ children: 'x' as unknown as React.ReactNode })
    const types = collectTypes(el)
    expect(types.has(Navbar)).toBe(true)
    expect(types.has(Footer)).toBe(true)
  })
})
