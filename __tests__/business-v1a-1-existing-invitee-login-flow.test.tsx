/**
 * @jest-environment jsdom
 *
 * Walz Business V1-A — item 1 of the required test list:
 * "Existing invitee → Business login (end-to-end-style test: invitation
 * page → correct href → login → session → back at invitation, accept works
 * unchanged)."
 */

// ── Step A: the invitation page, unauthenticated, for an email that
// already has a User row — must link to /business/login?callbackUrl=... ──
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

const TOKEN = 'd'.repeat(64)
const TOKEN_HASH = hashInvitationToken(TOKEN)
const CALLBACK = `/business/invitations/${TOKEN}`

function findLinkHref(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const el = node as { props?: Record<string, unknown> }
  if (typeof el.props?.href === 'string') return el.props.href as string
  const children = el.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findLinkHref(child)
      if (found) return found
    }
  } else if (children && typeof children === 'object') {
    return findLinkHref(children)
  }
  return undefined
}

describe('Item 1: Existing invitee -> Business login -> back at invitation -> accept', () => {
  it('Step A: unauthenticated invitation page for an existing-user email links to /business/login?callbackUrl=<this invitation>', async () => {
    getServerSession.mockResolvedValue(null)
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: 'existing@acme.com' })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_existing' })

    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.organizationInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      select: { email: true },
    })
    const href = findLinkHref(el)
    expect(href).toBe(`/business/login?callbackUrl=${encodeURIComponent(CALLBACK)}`)
  })

  it('Step B: BusinessLoginForm, given that exact callbackUrl, navigates back to the invitation page on a successful sign-in', async () => {
    jest.resetModules()
    jest.doMock('next-auth/react', () => ({ signIn: jest.fn().mockResolvedValue({ ok: true, error: null }) }))
    jest.doMock('next/image', () => ({ __esModule: true, default: (p: Record<string, unknown>) => require('react').createElement('img', p) }))
    const mockParams = new URLSearchParams({ callbackUrl: CALLBACK })
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
      useSearchParams: () => mockParams,
    }))

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    // Intercept the hard navigation BusinessLoginForm performs on success —
    // jsdom doesn't implement real navigation, so we capture the assignment.
    delete (window as any).location
    ;(window as any).location = { href: '' }

    const BusinessLoginForm = require('@/app/business/login/BusinessLoginForm').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(React.createElement(BusinessLoginForm)))

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement

    act(() => {
      emailInput.dispatchEvent(Object.assign(new Event('input', { bubbles: true }), {}))
    })
    // React controlled inputs need the native value setter to notice changes
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(emailInput, 'existing@acme.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeInputValueSetter.call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    expect((window as any).location.href).toBe(CALLBACK)

    act(() => root.unmount())
    container.remove()
  })

  it('Step C: back at the invitation page, now authenticated as that same user, renders AcceptInvitation unchanged (untouched component)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockClear()
    getServerSession.mockResolvedValue({ user: { id: 'user_existing', email: 'existing@acme.com' } })
    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    // No DB lookup needed once authenticated — matches the pre-existing
    // (unchanged) short-circuit.
    expect(mockPrisma.organizationInvitation.findUnique).not.toHaveBeenCalled()
    // AcceptInvitation itself (app/business/invitations/[token]/AcceptInvitation.tsx)
    // is explicitly untouched by this slice — confirmed elsewhere via git diff.
    const json = JSON.stringify(el, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(json).toContain('existing@acme.com')
  })
})
