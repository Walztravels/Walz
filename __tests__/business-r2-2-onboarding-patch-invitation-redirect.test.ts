/**
 * Walz Business (Release 2.2) Slice B — Item B (server side): the
 * invitation-acceptance landing page's "Sign in to continue" link becomes
 * invitation-aware.
 *
 * app/business/invitations/[token]/page.tsx (a Server Component) now
 * resolves — server-side only, via a simple non-enumerating existence
 * check — whether a User row exists for the invitation's bound email, and
 * picks between the unchanged `/login?callbackUrl=...` link (user exists)
 * and `/login?signup=true&email=...&callbackUrl=...` (no user yet). This
 * must never change acceptOrganizationInvitation's own email-match
 * verification, and must never expose whether a user exists anywhere
 * except by choosing which URL is linked.
 */
const mockPrisma = {
  organizationInvitation: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import OrganizationInvitationPage from '@/app/business/invitations/[token]/page'
import { hashInvitationToken } from '@/lib/business/invitations'

const TOKEN = 'c'.repeat(64)
const TOKEN_HASH = hashInvitationToken(TOKEN)
const CALLBACK = `/business/invitations/${TOKEN}`

// The page returns a plain React element tree (never rendered to DOM here —
// this is a pure server-side routing decision, so we only need to find the
// anchor/Link element's resolved `href`).
function findHref(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const el = node as { props?: Record<string, unknown> }
  if (typeof el.props?.href === 'string') return el.props.href as string
  const children = el.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findHref(child)
      if (found) return found
    }
  } else if (children && typeof children === 'object') {
    return findHref(children)
  }
  return undefined
}

// A JSON.stringify-free structural signature of a React element tree, with
// `href` stripped out. Deliberately does NOT descend into `type` (a
// component reference, e.g. next/link's Link, can carry circular internal
// properties) — only its display name is captured, which is enough to prove
// the rest of the tree (text, other props) is byte-identical either way.
function signature(node: unknown): unknown {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(signature)
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if ('type' in el && 'props' in el) {
    const t = el.type
    const typeName =
      typeof t === 'string'
        ? t
        : (t as { displayName?: string; name?: string } | undefined)?.displayName ??
          (t as { name?: string } | undefined)?.name ??
          'Component'
    const props = { ...(el.props ?? {}) }
    delete (props as Record<string, unknown>).href
    return { type: typeName, props: signature(props) }
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'function') continue
    out[k] = signature(v)
  }
  return out
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue(null) // unauthenticated — the only branch Item B touches
})

describe('OrganizationInvitationPage — Item B: invitation-aware login redirect', () => {
  it('malformed token: no DB lookup, falls back to the unchanged callbackUrl-only link', async () => {
    const el = await OrganizationInvitationPage({ params: { token: 'not-a-valid-token' } })
    expect(mockPrisma.organizationInvitation.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    const href = findHref(el)
    expect(href).toContain('/login?callbackUrl=')
    expect(href).not.toContain('signup=true')
  })

  it('unknown invitation token: no email to resolve, falls back to the unchanged link', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(null)
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.organizationInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      select: { email: true },
    })
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    const href = findHref(el)
    expect(href).not.toContain('signup=true')
  })

  it('EXISTING USER: keeps the current /login?callbackUrl=... redirect unchanged', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1' })
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'jane@acme.com' }, select: { id: true } })
    const href = findHref(el)
    expect(href).toBe(`/login?callbackUrl=${encodeURIComponent(CALLBACK)}`)
    expect(href).not.toContain('signup')
    expect(href).not.toContain('email=')
  })

  it('NO USER: redirects to /login?signup=true&email=<invitation email>&callbackUrl=...', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const href = findHref(el)
    expect(href).toBe(
      `/login?signup=true&email=${encodeURIComponent('jane@acme.com')}&callbackUrl=${encodeURIComponent(CALLBACK)}`,
    )
  })

  it('non-enumeration: the only observable difference between "user exists" and "no user" is which URL is linked — never any other markup/text', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1' })
    const existingEl = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const existingHref = findHref(existingEl)
    const existingSignature = signature(existingEl)

    mockPrisma.user.findUnique.mockResolvedValue(null)
    const noUserEl = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const noUserHref = findHref(noUserEl)
    const noUserSignature = signature(noUserEl)

    expect(existingHref).not.toEqual(noUserHref)
    expect(existingSignature).toEqual(noUserSignature)
  })

  it('normalizes the invitation email (case) before the User lookup', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: '  Jane@ACME.com  ' })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'jane@acme.com' }, select: { id: true } })
  })

  it('never performs the lookup when the user is already signed in', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user_1', email: 'jane@acme.com' } })
    await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.organizationInvitation.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })
})
