/**
 * @jest-environment jsdom
 *
 * Walz Business V1-A — item 2 of the required test list:
 * "New invitee → Business registration (same, with signup path)."
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

const TOKEN = 'e'.repeat(64)
const TOKEN_HASH = hashInvitationToken(TOKEN)
const CALLBACK = `/business/invitations/${TOKEN}`
const INVITED_EMAIL = 'new.person@acme.com'

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

describe('Item 2: New invitee -> Business registration', () => {
  it('Step A: unauthenticated invitation page for a NOT-yet-registered email links to /business/register?email=...&callbackUrl=...', async () => {
    getServerSession.mockResolvedValue(null)
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue({ email: INVITED_EMAIL })
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const el = await OrganizationInvitationPage({ params: { token: TOKEN } })
    expect(mockPrisma.organizationInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      select: { email: true },
    })
    const href = findLinkHref(el)
    expect(href).toBe(`/business/register?email=${encodeURIComponent(INVITED_EMAIL)}&callbackUrl=${encodeURIComponent(CALLBACK)}`)
  })

  it('Step B: BusinessRegisterForm, loaded with that exact URL, submits to /api/auth/signup with the bound email and threads the callbackUrl', async () => {
    const mockParams = new URLSearchParams({ email: INVITED_EMAIL, callbackUrl: CALLBACK })
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: jest.fn() }),
      useSearchParams: () => mockParams,
    }))

    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    global.fetch = mockFetch as any

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const BusinessRegisterForm = require('@/app/business/register/BusinessRegisterForm').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(React.createElement(BusinessRegisterForm)))

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    expect(emailInput.value).toBe(INVITED_EMAIL)
    expect(emailInput.disabled).toBe(true)
    expect(emailInput.readOnly).toBe(true)

    const passwordInputs = Array.from(container.querySelectorAll('input[type="password"]')) as HTMLInputElement[]
    const [passwordInput, confirmInput] = passwordInputs
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeInputValueSetter.call(confirmInput, 'correct-horse-battery-staple')
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({ method: 'POST' }))
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.email).toBe(INVITED_EMAIL) // bound email submitted unchanged
    expect(sentBody.callbackUrl).toBe(CALLBACK) // threaded through for verify-email

    act(() => root.unmount())
    container.remove()
  })
})
