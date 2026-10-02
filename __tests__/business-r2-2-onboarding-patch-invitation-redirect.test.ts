/**
 * Walz Business (Release 2.2) Slice B — Item B (server side), updated by
 * Walz Business V1-A: the invitation-acceptance landing page's CTA link
 * becomes both invitation-aware AND Business-branded.
 *
 * app/business/invitations/[token]/page.tsx (a Server Component) resolves —
 * server-side only, via a simple non-enumerating existence check — whether
 * a User row exists for the invitation's bound email, and picks between:
 *   - existing user: /business/login?callbackUrl=...   (text: "Sign in to Walz Business")
 *   - no user yet:   /business/register?email=...&callbackUrl=...  (text: "Create your Walz Business account")
 *
 * This must never change acceptOrganizationInvitation's own email-match
 * verification, and must never expose whether a user exists anywhere
 * except by choosing which URL (and which label) is linked.
 *
 * V1-A CHANGE TO THIS TEST FILE (item 3 of the V1-A test list): the original
 * version of this file asserted STRUCTURAL EQUALITY (via a `signature()`
 * helper that stripped out only `href`) between the existing-user and
 * no-user branches. That assertion forced the rendered link TEXT to be
 * identical in both branches — which is exactly the bug that shipped
 * (a user being sent to register saw a "sign in" label pointing at a
 * registration URL). This file now explicitly asserts the opposite: the
 * label must track the destination, and asserts non-enumeration a
 * different way — by checking that everything EXCEPT the href and the
 * link's own text differs, not that everything including the text is the
 * same.
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

function findLinkElement(node: unknown): { props?: Record<string, unknown> } | undefined {
  if (!node || typeof node !== 'object') return undefined
  const el = node as { props?: Record<string, unknown> }
  if (typeof el.props?.href === 'string') return el
  const children = el.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findLinkElement(child)
      if (found) return found
    }
  } else if (children && typeof children === 'object') {
    return findLinkElement(children)
  }
  return undefined
}

function linkHref(node: unknown): string | undefined {
  return findLinkElement(node)?.props?.href as string | undefined
}

function linkText(node: unknown): string | undefined {
  const text = findLinkElement(node)?.props?.children
  return typeof text === 'string' ? text : undefined
}

// A structural signature of a React element tree with BOTH `href` and the
// anchor's own text children stripped out — i.e. "is everything else about
// this tree (headings, intro copy, wrapper structure) identical". This is
// the non-enumeration guarantee this test now actually proves: the *rest*
// of the page never changes shape based on whether a user exists, only the
// href AND its paired label do (together, so they can never disagree).
function signature(node: unknown, isLinkChild = false): unknown {
  if (node === null || node === undefined || typeof node !== 'object') {
    return isLinkChild ? '<link-text>' : node
  }
  if (Array.isArray(node)) return node.map(n => signature(n, isLinkChild))
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if ('type' in el && 'props' in el) {
    const t = el.type
    const typeName =
      typeof t === 'string'
        ? t
        : (t as { displayName?: string; name?: string } | undefined)?.displayName ??
          (t as { name?: string } | undefined)?.name ??
          'Component'
    const isLink = typeof el.props?.href === 'string'
    const props = { ...(el.props ?? {}) }
    delete (props as Record<string, unknown>).href
    if (isLink) {
      // Normalize away the text itself — this file checks label/href
      // agreement separately (and explicitly) below.
      return { type: typeName, props: { ...signature(props, false), children: '<link-text>' } }
    }
    return { type: typeName, props: signature(props, isLinkChild) }
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'function') continue
    out[k] = k === 'children' && isLinkChild ? '<link-text>' : signature(v, isLinkChild)
  }
  return out
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue(null) // unauthenticated — the only branch this item touches
})

describe('OrganizationInvitationPage — Business V1-A: invitation-aware, Business-branded CTA', () => {
  it('malformed token: no DB lookup, falls back to the unchanged /business/login callbackUrl-only link', async () => {
    const el = await OrganizationInvitationPage({ params: { token: 'not-a-valid-token' } })
    expect(mockPrisma.organizationInvitation.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(linkHref(el)).toContain('/business/login?callbackUrl=')
    expect(linkHref(el)).not.toContain('/business/register')
    expect(linkText(el)).toBe('Sign in to Walz Business')
  })

  it('unknown invitation token: no email to resolve, falls back to the unchanged link and label', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(null)
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.organizationInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      select: { email: true },
    })
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(linkHref(el)).not.toContain('/business/register')
    expect(linkText(el)).toBe('Sign in to Walz Business')
  })

  it('EXISTING USER: /business/login?callbackUrl=... with "Sign in to Walz Business"', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1' })
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'jane@acme.com' }, select: { id: true } })
    expect(linkHref(el)).toBe(`/business/login?callbackUrl=${encodeURIComponent(CALLBACK)}`)
    expect(linkHref(el)).not.toContain('/business/register')
    expect(linkText(el)).toBe('Sign in to Walz Business')
  })

  it('NO USER: /business/register?email=<invitation email>&callbackUrl=... with "Create your Walz Business account"', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(linkHref(el)).toBe(
      `/business/register?email=${encodeURIComponent('jane@acme.com')}&callbackUrl=${encodeURIComponent(CALLBACK)}`,
    )
    expect(linkText(el)).toBe('Create your Walz Business account')
  })

  // ── Item 3: label/href agreement, replacing the old label-equality bug ──
  it('the rendered label ALWAYS matches its own href destination — register URL never carries the sign-in label and vice versa', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1' })
    const existingEl = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const existingHref = linkHref(existingEl)!
    const existingText = linkText(existingEl)!

    mockPrisma.user.findUnique.mockResolvedValue(null)
    const noUserEl = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const noUserHref = linkHref(noUserEl)!
    const noUserText = linkText(noUserEl)!

    // The two branches must disagree on BOTH href and text...
    expect(existingHref).not.toEqual(noUserHref)
    expect(existingText).not.toEqual(noUserText)

    // ...and each branch's own text must be the one that matches its own
    // href — this is the exact assertion whose absence let the original
    // bug ship (a stale "sign in" label was allowed to sit next to a
    // register-branch href because no test ever checked the pairing).
    expect(existingHref.startsWith('/business/login')).toBe(true)
    expect(existingText).toBe('Sign in to Walz Business')
    expect(noUserHref.startsWith('/business/register')).toBe(true)
    expect(noUserText).toBe('Create your Walz Business account')
  })

  it('non-enumeration: apart from the (always paired) href+label, the rest of the page is byte-identical whether or not a user exists', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'jane@acme.com' })

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_1' })
    const existingEl = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const existingSignature = signature(existingEl)

    mockPrisma.user.findUnique.mockResolvedValue(null)
    const noUserEl = await OrganizationInvitationPage({ params: { token: TOKEN } })
    const noUserSignature = signature(noUserEl)

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
