/**
 * @jest-environment jsdom
 *
 * Walz Business Track B1 — B1.1: Business forgot-password context.
 *
 * BACKGROUND: app/business/login/BusinessLoginForm.tsx's "Forgot password?"
 * link carried no Business context at all, so the shared
 * app/forgot-password + app/reset-password pages always hardcoded a
 * consumer /login "Back to sign in" destination — even for a visitor who
 * arrived from /business/login. The fix threads a `callbackUrl` query param
 * (the SAME param name/contract already used throughout this domain — see
 * lib/safe-redirect.ts's safeBusinessCallback, already used by
 * app/api/auth/signup/route.ts and app/api/auth/verify-email/route.ts)
 * through: BusinessLoginForm -> /forgot-password -> POST
 * /api/auth/forgot-password -> emailed reset link -> /reset-password ->
 * post-reset redirect, reusing safeBusinessCallback/safeLocalRedirect at
 * every hop rather than reimplementing validation or forking a parallel
 * Business-only copy of the shared pages.
 *
 * Required end-to-end behavior:
 *   Consumer  /login          -> forgot password -> reset -> /login (unchanged)
 *   Business  /business/login -> forgot password -> reset -> /business/login (fixed)
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mockParams = new URLSearchParams()
let pushMock = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ push: (...args: unknown[]) => pushMock(...args) }),
}))
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }))
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}))

import BusinessLoginForm from '@/app/business/login/BusinessLoginForm'
import ForgotPasswordPage from '@/app/forgot-password/page'
import ResetPasswordPage from '@/app/reset-password/page'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mockParams = new URLSearchParams()
  pushMock = jest.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.restoreAllMocks()
})

const ADVERSARIAL_PAYLOADS: Array<[string, string]> = [
  ['protocol-relative', '//evil.com'],
  ['backslash-variant', '/\\evil.com'],
  ['fully-qualified external URL', 'https://evil.com'],
  ['encoded path traversal', '/business/%2e%2e/%2e%2e/etc/passwd'],
  ['literal path traversal', '/business/../../../login'],
  ['embedded control character', '/\t/evil.com'],
]

// ─────────────────────────────────────────────────────────────────────────
// Part 1 — BusinessLoginForm now sends Business context on its forgot-
// password link.
// ─────────────────────────────────────────────────────────────────────────
describe('BusinessLoginForm: "Forgot password?" link carries Business context', () => {
  it('links to /forgot-password?callbackUrl=%2Fbusiness%2Flogin (not a bare /forgot-password)', () => {
    act(() => root.render(React.createElement(BusinessLoginForm)))
    const link = Array.from(container.querySelectorAll('a')).find(a => a.textContent === 'Forgot password?')
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/forgot-password?callbackUrl=%2Fbusiness%2Flogin')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Part 2 — app/forgot-password/page.tsx: consumer unchanged, Business
// honoured, adversarial payloads rejected.
// ─────────────────────────────────────────────────────────────────────────
describe('ForgotPasswordPage: "Back to sign in" context', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as any
  })

  function render() {
    act(() => root.render(React.createElement(ForgotPasswordPage)))
  }

  function backToSignInHref(): string | null {
    const link = Array.from(container.querySelectorAll('a')).find(a => a.textContent?.includes('Back to sign in'))
    return link ? link.getAttribute('href') : null
  }

  it('REGRESSION: no callbackUrl param (consumer /login flow) -> "Back to sign in" still points at /login', () => {
    render()
    expect(backToSignInHref()).toBe('/login')
  })

  it('a legitimate Business callbackUrl (?callbackUrl=/business/login) -> "Back to sign in" points at /business/login', () => {
    mockParams = new URLSearchParams({ callbackUrl: '/business/login' })
    render()
    expect(backToSignInHref()).toBe('/business/login')
  })

  it('submitting the form with a Business context forwards the VALIDATED callbackUrl to the API, never the raw param', async () => {
    mockParams = new URLSearchParams({ callbackUrl: '/business/login' })
    render()
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeSetter.call(emailInput, 'biz@acme.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body).toEqual({ email: 'biz@acme.com', callbackUrl: '/business/login' })
  })

  describe('ADVERSARIAL — malicious callbackUrl values are rejected (fall back to /login, never forwarded)', () => {
    it.each(ADVERSARIAL_PAYLOADS)('%s: %s is rejected', (_label, payload) => {
      mockParams = new URLSearchParams()
      mockParams.set('callbackUrl', payload)
      render()
      expect(backToSignInHref()).toBe('/login')
    })

    it('a malicious payload is never forwarded to the API body either', async () => {
      mockParams = new URLSearchParams()
      mockParams.set('callbackUrl', '//evil.com')
      render()
      const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
      const form = container.querySelector('form') as HTMLFormElement
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      act(() => {
        nativeSetter.call(emailInput, 'mallory@acme.com')
        emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await new Promise(r => setTimeout(r, 0))
      })
      const [, init] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body).toEqual({ email: 'mallory@acme.com' })
      expect(JSON.stringify(body)).not.toContain('evil.com')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Part 3 — app/reset-password/page.tsx: context preserved through to the
// post-reset redirect and the "Request new reset link" fallback.
// ─────────────────────────────────────────────────────────────────────────
describe('ResetPasswordPage: context preserved end-to-end', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockParams = new URLSearchParams({ token: 'tok_abc' })
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as any
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  function render() {
    act(() => root.render(React.createElement(ResetPasswordPage)))
  }

  async function submit() {
    const pw = container.querySelectorAll('input[type="password"]')[0] as HTMLInputElement
    const cf = container.querySelectorAll('input[type="password"]')[1] as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeSetter.call(pw, 'correct-horse-battery-staple')
      pw.dispatchEvent(new Event('input', { bubbles: true }))
      nativeSetter.call(cf, 'correct-horse-battery-staple')
      cf.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('REGRESSION: no callbackUrl (consumer flow) -> redirects to /login after success', async () => {
    render()
    await submit()
    act(() => { jest.advanceTimersByTime(3000) })
    expect(pushMock).toHaveBeenCalledWith('/login')
  })

  it('a legitimate Business callbackUrl -> redirects to /business/login after success', async () => {
    mockParams = new URLSearchParams({ token: 'tok_abc', callbackUrl: '/business/login' })
    render()
    await submit()
    act(() => { jest.advanceTimersByTime(3000) })
    expect(pushMock).toHaveBeenCalledWith('/business/login')
  })

  describe('ADVERSARIAL — malicious callbackUrl is rejected, falls back to /login', () => {
    it.each(ADVERSARIAL_PAYLOADS)('%s: %s is rejected', async (_label, payload) => {
      mockParams = new URLSearchParams()
      mockParams.set('token', 'tok_abc')
      mockParams.set('callbackUrl', payload)
      render()
      await submit()
      act(() => { jest.advanceTimersByTime(3000) })
      expect(pushMock).toHaveBeenCalledWith('/login')
    })
  })

  it('missing-token state preserves a legitimate Business context on "Request new reset link"', () => {
    mockParams = new URLSearchParams({ callbackUrl: '/business/login' }) // no token
    render()
    const link = Array.from(container.querySelectorAll('a')).find(a => a.textContent === 'Request new reset link')
    expect(link!.getAttribute('href')).toBe('/forgot-password?callbackUrl=%2Fbusiness%2Flogin')
  })

  it('missing-token state with no context falls back to a bare /forgot-password link (regression)', () => {
    mockParams = new URLSearchParams() // no token, no callbackUrl
    render()
    const link = Array.from(container.querySelectorAll('a')).find(a => a.textContent === 'Request new reset link')
    expect(link!.getAttribute('href')).toBe('/forgot-password')
  })

  it('missing-token state with a malicious callbackUrl falls back to a bare /forgot-password link', () => {
    mockParams = new URLSearchParams({ callbackUrl: '//evil.com' }) // no token
    render()
    const link = Array.from(container.querySelectorAll('a')).find(a => a.textContent === 'Request new reset link')
    expect(link!.getAttribute('href')).toBe('/forgot-password')
  })
})
