/**
 * @jest-environment jsdom
 *
 * Walz Business V1-A — item 6 of the required test list (ADVERSARIAL):
 * a callbackUrl of `//evil.com` (and at least one other open-redirect-shaped
 * payload) is rejected/neutralized everywhere it is accepted in this
 * slice's new/touched code.
 *
 * Background: a bare `rawCallback.startsWith('/')` check — the pre-existing
 * pattern in app/login/LoginForm.tsx — does NOT block a protocol-relative
 * payload like `//evil.com`. This first block proves that exploitability
 * using Node's own URL resolution (the same algorithm a browser uses to
 * resolve a protocol-relative URL against the current origin), WITHOUT
 * touching or importing LoginForm.tsx itself (that file is explicitly out
 * of scope and must remain byte-for-byte unchanged in this slice).
 *
 * CRITICAL UPDATE (2026-10-02): an independent security review found, and
 * reproduced, that the deny-list style check this file originally tested
 * against (`startsWith('//')`, `startsWith('/\\')`) did NOT reject embedded
 * ASCII control characters (TAB `\x09`, LF `\x0A`, CR `\x0D`). Per the
 * WHATWG URL spec, those are silently stripped during URL parsing, so
 * `/\t/evil.com` passed the old filter but a browser resolves
 * `new URL('/\t/evil.com', 'https://www.walztravels.com')` to
 * `https://evil.com/` — exploitable via BusinessLoginForm.tsx's post-sign-in
 * `window.location.href = callbackUrl`. `lib/safe-redirect.ts` has since
 * been rewritten to use robust positive URL-parsing/origin-comparison
 * validation instead of a growing deny-list (see that file's own doc
 * comment and `__tests__/safe-redirect.test.ts` for the full pure-function
 * regression suite). This file is extended below with the additional
 * adversarial cases and an integration-level test of the actual
 * BusinessLoginForm post-login redirect, so a future mismatch between the
 * helper and its caller can't silently reintroduce the bug.
 */
import { isSafeLocalPath, safeLocalRedirect } from '@/lib/safe-redirect'

describe('Adversarial: //evil.com-style payload', () => {
  it('PROOF OF EXPLOITABILITY: a naive `startsWith(\'/\')` check does NOT stop `//evil.com` from resolving to an external origin', () => {
    const naiveCheck = (raw: string) => (raw.startsWith('/') ? raw : '/dashboard')
    const payload = '//evil.com/phish'
    const accepted = naiveCheck(payload)
    expect(accepted).toBe(payload) // the naive check lets it straight through

    // Resolve it exactly as a browser would resolve `window.location.href =
    // '//evil.com/phish'` from https://www.walztravels.com — protocol-relative,
    // so it keeps the current scheme but switches host entirely.
    const resolved = new URL(accepted, 'https://www.walztravels.com')
    expect(resolved.hostname).toBe('evil.com') // confirmed: genuinely exploitable
    expect(resolved.hostname).not.toBe('www.walztravels.com')
  })

  it('PROOF OF EXPLOITABILITY: a naive check also does not stop a backslash-variant payload', () => {
    const naiveCheck = (raw: string) => (raw.startsWith('/') ? raw : '/dashboard')
    const payload = '/\\evil.com/phish'
    expect(naiveCheck(payload)).toBe(payload)
    // Browsers normalize a leading backslash to a forward slash before
    // resolving, making this equivalent to the protocol-relative case above.
    const normalized = payload.replace(/\\/g, '/')
    const resolved = new URL(normalized, 'https://www.walztravels.com')
    expect(resolved.hostname).toBe('evil.com')
  })

  it('isSafeLocalPath REJECTS //evil.com', () => {
    expect(isSafeLocalPath('//evil.com')).toBe(false)
    expect(isSafeLocalPath('//evil.com/phish')).toBe(false)
  })

  it('isSafeLocalPath REJECTS the backslash-variant payload', () => {
    expect(isSafeLocalPath('/\\evil.com')).toBe(false)
    expect(isSafeLocalPath('/\\/evil.com')).toBe(false)
  })

  it('isSafeLocalPath REJECTS a fully-qualified external URL', () => {
    expect(isSafeLocalPath('https://evil.com')).toBe(false)
    expect(isSafeLocalPath('http://evil.com')).toBe(false)
  })

  it('isSafeLocalPath ACCEPTS an ordinary same-origin local path', () => {
    expect(isSafeLocalPath('/business')).toBe(true)
    expect(isSafeLocalPath('/business/org_123')).toBe(true)
    expect(isSafeLocalPath('/business/invitations/abc123')).toBe(true)
  })

  it('isSafeLocalPath REJECTS non-string / empty input', () => {
    expect(isSafeLocalPath(null)).toBe(false)
    expect(isSafeLocalPath(undefined)).toBe(false)
    expect(isSafeLocalPath('')).toBe(false)
    expect(isSafeLocalPath(42)).toBe(false)
  })

  it('safeLocalRedirect falls back on every rejected payload', () => {
    expect(safeLocalRedirect('//evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect('/\\evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect('https://evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect(null, '/business')).toBe('/business')
  })

  it('safeLocalRedirect passes through a safe local path unchanged', () => {
    expect(safeLocalRedirect('/business/org_123', '/business')).toBe('/business/org_123')
  })
})

describe('Adversarial: the payload is neutralized at every NEW call site in this slice', () => {
  it('app/api/auth/signup/route.ts source only threads callbackUrl through isSafeLocalPath + a /business prefix check', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/auth/signup/route.ts'), 'utf-8')
    expect(src).toContain('isSafeLocalPath(rawCallbackUrl)')
    expect(src).toContain("rawCallbackUrl.startsWith('/business')")
  })

  it('app/api/auth/verify-email/route.ts source only honours callbackUrl through isSafeLocalPath + a /business prefix check', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/auth/verify-email/route.ts'), 'utf-8')
    expect(src).toContain('isSafeLocalPath(rawCallbackUrl)')
    expect(src).toContain("rawCallbackUrl.startsWith('/business')")
  })

  it('BusinessLoginForm and BusinessRegisterForm both route their callbackUrl query param through safeLocalRedirect', () => {
    const fs = require('fs')
    const path = require('path')
    const loginSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/business/login/BusinessLoginForm.tsx'), 'utf-8')
    const registerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/business/register/BusinessRegisterForm.tsx'), 'utf-8')
    expect(loginSrc).toContain('safeLocalRedirect(')
    expect(registerSrc).toContain('safeLocalRedirect(')
  })
})

describe('CRITICAL regression — the exact exploit payload from the finding (/\\t/evil.com)', () => {
  it('REPRODUCTION: proves the payload genuinely resolves to an external origin via real URL parsing (the finding\'s own repro script)', () => {
    const payload = '/\t/evil.com'
    const resolved = new URL(payload, 'https://www.walztravels.com')
    expect(resolved.href).toBe('https://evil.com/')
    expect(resolved.hostname).toBe('evil.com')
  })

  it('isSafeLocalPath now REJECTS /\\t/evil.com (was previously a false-positive "safe" path)', () => {
    expect(isSafeLocalPath('/\t/evil.com')).toBe(false)
  })

  it('isSafeLocalPath also rejects the \\n and \\r variants of the same payload shape', () => {
    expect(isSafeLocalPath('/\n/evil.com')).toBe(false)
    expect(isSafeLocalPath('/\r/evil.com')).toBe(false)
  })

  it('safeLocalRedirect falls back to the safe default for the exploit payload', () => {
    expect(safeLocalRedirect('/\t/evil.com', '/business')).toBe('/business')
  })
})

describe('Adversarial — additional bypass shapes required by the hardened review', () => {
  it('rejects the post-decode form of %09/%0A/%0D as they would arrive via searchParams.get()', () => {
    const url = new URL('https://www.walztravels.com/business/login?callbackUrl=%2F%09%2Fevil.com')
    const decoded = url.searchParams.get('callbackUrl')!
    expect(decoded).toBe('/\t/evil.com')
    expect(isSafeLocalPath(decoded)).toBe(false)
  })

  it('handles an encoded-slash variant (/%2F%2Fevil.com) safely as a literal local path, never a host switch', () => {
    expect(isSafeLocalPath('/%2F%2Fevil.com')).toBe(true)
    const result = safeLocalRedirect('/%2F%2Fevil.com', '/business')
    expect(new URL(result, 'https://walztravels.com').hostname).toBe('walztravels.com')
  })

  it('rejects javascript: and data: payloads explicitly, not just "any non-matching-origin value"', () => {
    expect(isSafeLocalPath('javascript:alert(1)')).toBe(false)
    expect(isSafeLocalPath('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('still accepts every required valid callback shape unchanged', () => {
    expect(isSafeLocalPath('/business')).toBe(true)
    expect(isSafeLocalPath('/business/abc123')).toBe(true)
    expect(isSafeLocalPath('/business/invitations/sometoken')).toBe(true)
    expect(isSafeLocalPath('/business?x=1')).toBe(true)
    expect(isSafeLocalPath('/business#section')).toBe(true)
  })
})

describe('INTEGRATION: BusinessLoginForm post-login navigation with a malicious callbackUrl query param', () => {
  it('a malicious ?callbackUrl=/\\t/evil.com on the actual login page results in window.location.href being set to the safe fallback, never the attacker origin', async () => {
    jest.resetModules()
    jest.doMock('next-auth/react', () => ({ signIn: jest.fn().mockResolvedValue({ ok: true, error: null }) }))
    const mockParams = new URLSearchParams()
    mockParams.set('callbackUrl', '/\t/evil.com')
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
      useSearchParams: () => mockParams,
    }))

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    // jsdom doesn't implement real cross-origin navigation — capture the
    // assignment BusinessLoginForm performs on success instead.
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

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(emailInput, 'attacker-target@acme.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeInputValueSetter.call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    // The component must have rejected the malicious callbackUrl and fallen
    // back to '/business' — NOT navigated anywhere resolving to evil.com.
    const finalHref = (window as any).location.href
    expect(finalHref).toBe('/business')
    expect(new URL(finalHref, 'https://www.walztravels.com').hostname).toBe('www.walztravels.com')
    expect(finalHref).not.toContain('evil.com')

    act(() => root.unmount())
    container.remove()
  })

  it('a legitimate ?callbackUrl=/business/org_abc still navigates there exactly as before (no regression on valid callbacks)', async () => {
    jest.resetModules()
    jest.doMock('next-auth/react', () => ({ signIn: jest.fn().mockResolvedValue({ ok: true, error: null }) }))
    const mockParams = new URLSearchParams()
    mockParams.set('callbackUrl', '/business/org_abc')
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
      useSearchParams: () => mockParams,
    }))

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(emailInput, 'legit@acme.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeInputValueSetter.call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    expect((window as any).location.href).toBe('/business/org_abc')

    act(() => root.unmount())
    container.remove()
  })
})
