/**
 * @jest-environment jsdom
 *
 * Consumer login — app/login/LoginForm.tsx open-redirect regression suite.
 *
 * BACKGROUND: `app/login/LoginForm.tsx` previously computed its post-login
 * redirect target as:
 *
 *   const callbackUrl = rawCallback.startsWith('/')
 *     ? rawCallback
 *     : '/dashboard'
 *
 * This is a raw string-prefix check. It does NOT reject protocol-relative
 * payloads (`//evil.com`), backslash variants (`/\evil.com`, `/\/evil.com`),
 * or embedded ASCII control characters (TAB/LF/CR), all of which the WHATWG
 * URL parser — the same algorithm a browser uses to resolve
 * `window.location.href = callbackUrl` — can resolve to an EXTERNAL origin
 * despite the raw string starting with `/`. This exact bug class was
 * already found, fixed, and triple-independently-reviewed in
 * `lib/safe-redirect.ts` as part of Walz Business Portal V1-A. This file's
 * fix reuses that hardened, already-proven `safeLocalRedirect` primitive
 * directly in `LoginForm.tsx`, replacing the weak inline check.
 *
 * This suite re-tests every previously-discovered vulnerability class
 * against the ACTUAL consumer LoginForm component (integration-level, not
 * just the pure helper, which already has its own dedicated suite in
 * __tests__/safe-redirect.test.ts and
 * __tests__/business-v1a-6-adversarial-open-redirect.test.ts — those are
 * NOT duplicated or modified here).
 */
import { safeLocalRedirect } from '@/lib/safe-redirect'

const ADVERSARIAL_PAYLOADS: Array<{ name: string; payload: string }> = [
  { name: 'protocol-relative //evil.com',            payload: '//evil.com' },
  { name: 'protocol-relative //evil.com/phish',       payload: '//evil.com/phish' },
  { name: 'backslash variant /\\evil.com',            payload: '/\\evil.com' },
  { name: 'backslash variant /\\/evil.com',           payload: '/\\/evil.com' },
  { name: 'embedded raw TAB /\\t/evil.com',           payload: '/\t/evil.com' },
  { name: 'embedded raw LF /\\n/evil.com',            payload: '/\n/evil.com' },
  { name: 'embedded raw CR /\\r/evil.com',            payload: '/\r/evil.com' },
  { name: 'full external absolute URL (https)',       payload: 'https://evil.com/phish' },
  { name: 'full external absolute URL (http)',        payload: 'http://evil.com' },
  { name: 'javascript: scheme',                       payload: 'javascript:alert(document.cookie)' },
  { name: 'data: scheme',                             payload: 'data:text/html,<script>alert(1)</script>' },
]

// The post-decode shapes of %09/%0A/%0D as they would actually arrive via
// useSearchParams().get(), which returns the DECODED query value.
const POST_DECODE_CONTROL_CHAR_PAYLOADS: Array<{ name: string; encodedQuery: string }> = [
  { name: 'post-decode %2F%09%2Fevil.com (TAB)', encodedQuery: '%2F%09%2Fevil.com' },
  { name: 'post-decode %2F%0A%2Fevil.com (LF)',  encodedQuery: '%2F%0A%2Fevil.com' },
  { name: 'post-decode %2F%0D%2Fevil.com (CR)',  encodedQuery: '%2F%0D%2Fevil.com' },
]

const LEGITIMATE_CALLBACKS = ['/', '/portal/dashboard', '/visa', '/dashboard/bookings?tab=upcoming', '/dashboard#profile']

describe('PROOF: the OLD LoginForm.tsx check is genuinely exploitable', () => {
  const oldNaiveCheck = (raw: string) => (raw.startsWith('/') ? raw : '/dashboard')

  it('//evil.com passes the old check and a browser resolves it to the attacker origin', () => {
    const payload = '//evil.com/phish'
    const accepted = oldNaiveCheck(payload)
    expect(accepted).toBe(payload) // old check let it straight through

    const resolved = new URL(accepted, 'https://www.walztravels.com')
    expect(resolved.hostname).toBe('evil.com')
    expect(resolved.hostname).not.toBe('www.walztravels.com')
  })

  it('/\\t/evil.com (raw TAB) passes the old check and a browser resolves it to the attacker origin', () => {
    const payload = '/\t/evil.com'
    const accepted = oldNaiveCheck(payload)
    expect(accepted).toBe(payload)

    const resolved = new URL(payload, 'https://www.walztravels.com')
    expect(resolved.href).toBe('https://evil.com/')
    expect(resolved.hostname).toBe('evil.com')
  })

  it('/\\evil.com (backslash variant) passes the old check and normalizes to the attacker origin', () => {
    const payload = '/\\evil.com/phish'
    const accepted = oldNaiveCheck(payload)
    expect(accepted).toBe(payload)

    const normalized = payload.replace(/\\/g, '/')
    const resolved = new URL(normalized, 'https://www.walztravels.com')
    expect(resolved.hostname).toBe('evil.com')
  })
})

describe('FIX: the actual safeLocalRedirect primitive now used by LoginForm.tsx rejects every payload class', () => {
  it.each(ADVERSARIAL_PAYLOADS)('rejects $name and falls back to /dashboard', ({ payload }) => {
    const result = safeLocalRedirect(payload, '/dashboard')
    expect(result).toBe('/dashboard')
    expect(result).not.toContain('evil.com')
  })

  it.each(POST_DECODE_CONTROL_CHAR_PAYLOADS)('rejects $name as it arrives via searchParams.get() (post-decode)', ({ encodedQuery }) => {
    const url = new URL(`https://www.walztravels.com/login?callbackUrl=${encodedQuery}`)
    const decoded = url.searchParams.get('callbackUrl')!
    const result = safeLocalRedirect(decoded, '/dashboard')
    expect(result).toBe('/dashboard')
  })

  it('rejects malformed/non-string input', () => {
    expect(safeLocalRedirect(null, '/dashboard')).toBe('/dashboard')
    expect(safeLocalRedirect(undefined, '/dashboard')).toBe('/dashboard')
    expect(safeLocalRedirect('', '/dashboard')).toBe('/dashboard')
  })

  it.each(LEGITIMATE_CALLBACKS)('preserves legitimate same-origin callback %s unchanged', (callback) => {
    expect(safeLocalRedirect(callback, '/dashboard')).toBe(callback)
  })
})

describe('INTEGRATION: the actual LoginForm.tsx source routes callbackUrl through safeLocalRedirect', () => {
  it('imports and calls safeLocalRedirect, and no longer contains the old raw startsWith(\'/\') check', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/login/LoginForm.tsx'), 'utf-8')
    expect(src).toContain("import { safeLocalRedirect } from '@/lib/safe-redirect'")
    expect(src).toContain('safeLocalRedirect(rawCallback')
    expect(src).not.toContain("rawCallback.startsWith('/')")
  })

  it('does NOT use safeBusinessCallback — consumer login must accept any safe local path, not just /business/**', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/login/LoginForm.tsx'), 'utf-8')
    expect(src).not.toContain('safeBusinessCallback')
  })
})

describe('INTEGRATION: actual LoginForm component post-login navigation with a malicious callbackUrl', () => {
  async function renderAndSubmit(callbackUrlParam: string | null) {
    jest.resetModules()
    jest.doMock('next-auth/react', () => ({ signIn: jest.fn().mockResolvedValue({ ok: true, error: null }) }))
    const mockParams = new URLSearchParams()
    if (callbackUrlParam !== null) mockParams.set('callbackUrl', callbackUrlParam)
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
      useSearchParams: () => mockParams,
    }))

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    // jsdom doesn't implement real cross-origin navigation — capture the
    // assignment LoginForm performs on success instead, exactly as the
    // pre-existing BusinessLoginForm adversarial suite does. Unlike
    // BusinessLoginForm, LoginForm renders a next/image <Image>, which
    // needs a VALID base URL on window.location during render (it builds
    // absolute URLs internally) — so seed it with a real same-origin URL
    // instead of an empty string, then assert on the href it's reassigned
    // to afterward.
    delete (window as any).location
    ;(window as any).location = { href: 'https://www.walztravels.com/login' }

    const LoginForm = require('@/app/login/LoginForm').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(React.createElement(LoginForm)))

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(emailInput, 'consumer@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeInputValueSetter.call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    const finalHref = (window as any).location.href as string

    act(() => root.unmount())
    container.remove()

    return finalHref
  }

  it.each(ADVERSARIAL_PAYLOADS)('a malicious ?callbackUrl=$name results in window.location.href = /dashboard, never the attacker origin', async ({ payload }) => {
    const finalHref = await renderAndSubmit(payload)
    expect(finalHref).toBe('/dashboard')
    expect(finalHref).not.toContain('evil.com')
    expect(new URL(finalHref, 'https://www.walztravels.com').hostname).toBe('www.walztravels.com')
  })

  it('a malicious ?callbackUrl=/\\t/evil.com (the exact known exploit payload) falls back to /dashboard', async () => {
    const finalHref = await renderAndSubmit('/\t/evil.com')
    expect(finalHref).toBe('/dashboard')
  })

  it.each(LEGITIMATE_CALLBACKS)('a legitimate ?callbackUrl=%s still navigates there exactly as before (no regression)', async (callback) => {
    const finalHref = await renderAndSubmit(callback)
    expect(finalHref).toBe(callback)
  })

  it('no callbackUrl param at all falls back to /dashboard (unchanged default behavior)', async () => {
    const finalHref = await renderAndSubmit(null)
    expect(finalHref).toBe('/dashboard')
  })
})
