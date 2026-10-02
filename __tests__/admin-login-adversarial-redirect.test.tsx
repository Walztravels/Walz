/**
 * @jest-environment jsdom
 *
 * Admin login — app/admin/login/page.tsx open-redirect regression suite.
 *
 * BACKGROUND: `app/admin/login/page.tsx` previously computed its post-login
 * redirect target as:
 *
 *   const from = searchParams.get('from') ?? '/admin/dashboard'
 *   // ... later, at two call sites (password login success, biometric/
 *   // WebAuthn login success):
 *   router.push(from)
 *
 * Zero validation. Next.js's `router.push()` internally computes
 * `url = new URL(addBasePath(href), location.href)` and checks
 * `url.origin !== window.location.origin`; when external, it performs a
 * genuine top-level `window.location.assign()` to the attacker-controlled
 * origin — exploitable via full absolute URLs AND the `//evil.com` /
 * backslash-variant bypass classes (same bug family already fixed in
 * `lib/safe-redirect.ts` and `app/login/LoginForm.tsx`).
 *
 * THE FIX: both call sites now compute
 *   const from = safeAdminCallback(searchParams.get('from')) ?? '/admin/dashboard'
 * reusing the already-hardened, triple-reviewed `safeLocalRedirect` primitive
 * via the new `safeAdminCallback` export, with an admin-only namespace
 * restriction applied to the NORMALIZED, parsed pathname (never the raw
 * input string) — mirroring `safeBusinessCallback` exactly.
 *
 * This suite tests:
 *   1. The pure `safeAdminCallback` helper directly (unit-level), matching
 *      the `safe-redirect-business-callback.test.ts` pattern.
 *   2. The ACTUAL `app/admin/login/page.tsx` component at BOTH vulnerable
 *      call sites (password login success, biometric/WebAuthn login
 *      success) — not just the helper in isolation.
 */
import { safeAdminCallback, isSafeLocalPath, safeLocalRedirect } from '@/lib/safe-redirect'

// ─────────────────────────────────────────────────────────────────────────
// 1. PURE HELPER — safeAdminCallback unit tests
// ─────────────────────────────────────────────────────────────────────────

describe('safeAdminCallback — the exact reported payload class', () => {
  it('REPRODUCTION: /admin/../../../etc/passwd literally starts with "/admin" but normalizes to /etc/passwd', () => {
    const payload = '/admin/../../../etc/passwd'
    expect(payload.startsWith('/admin')).toBe(true) // a naive raw-string check would have accepted this
    const resolved = new URL(payload, 'https://www.walztravels.com')
    expect(resolved.pathname).toBe('/etc/passwd') // what it ACTUALLY normalizes to
  })

  it('safeAdminCallback REJECTS /admin/../../../etc/passwd (returns null)', () => {
    expect(safeAdminCallback('/admin/../../../etc/passwd')).toBeNull()
  })

  it('isSafeLocalPath alone would have ACCEPTED this payload (same-origin) — only the /admin-scoping check catches it', () => {
    expect(isSafeLocalPath('/admin/../../../etc/passwd')).toBe(true)
    expect(safeLocalRedirect('/admin/../../../etc/passwd', '')).toBe('/etc/passwd')
  })

  it('rejects /admin/../../../login (confirms what it actually normalizes to first)', () => {
    const resolved = new URL('/admin/../../../login', 'https://www.walztravels.com')
    expect(resolved.pathname).toBe('/login') // not /admin-prefixed
    expect(safeAdminCallback('/admin/../../../login')).toBeNull()
  })
})

describe('safeAdminCallback — dot-segment normalization edge cases', () => {
  it('rejects /admin/../login (normalizes to /login, which is NOT /admin-prefixed)', () => {
    const resolved = new URL('/admin/../login', 'https://www.walztravels.com')
    expect(resolved.pathname).toBe('/login')
    expect(safeAdminCallback('/admin/../login')).toBeNull()
  })

  it('rejects a payload that normalizes to exactly "/" (outside /admin)', () => {
    expect(safeAdminCallback('/admin/..')).toBeNull()
  })

  it('accepts a dot-segment payload that normalizes BACK INTO /admin (e.g. /admin/foo/../bar)', () => {
    const resolved = new URL('/admin/foo/../bar', 'https://www.walztravels.com')
    expect(resolved.pathname).toBe('/admin/bar')
    expect(safeAdminCallback('/admin/foo/../bar')).toBe('/admin/bar')
  })

  it('an encoded dot-segment variant (%2e%2e) is treated as a dot-segment and rejected the same as the literal form', () => {
    const raw = '/admin/%2e%2e/%2e%2e/etc/passwd'
    const resolved = new URL(raw, 'https://www.walztravels.com')
    expect(resolved.pathname).toBe('/etc/passwd')
    expect(safeAdminCallback(raw)).toBeNull()
  })
})

describe('safeAdminCallback — valid callbacks still accepted', () => {
  it('accepts /admin', () => {
    expect(safeAdminCallback('/admin')).toBe('/admin')
  })

  it('accepts /admin/dashboard', () => {
    expect(safeAdminCallback('/admin/dashboard')).toBe('/admin/dashboard')
  })

  it('accepts /admin/orbit/studio?x=1#y, preserving query and hash', () => {
    expect(safeAdminCallback('/admin/orbit/studio?x=1#y')).toBe('/admin/orbit/studio?x=1#y')
  })
})

describe('safeAdminCallback — rejects cross-origin and malformed payloads', () => {
  it('rejects https://evil.example (absolute external URL)', () => {
    expect(safeAdminCallback('https://evil.example')).toBeNull()
  })

  it('rejects //evil.example (protocol-relative)', () => {
    expect(safeAdminCallback('//evil.example')).toBeNull()
  })

  it('rejects backslash variants /\\evil.example and /\\/evil.example', () => {
    expect(safeAdminCallback('/\\evil.example')).toBeNull()
    expect(safeAdminCallback('/\\/evil.example')).toBeNull()
  })

  it('rejects raw ASCII control-character variants (TAB/LF/CR)', () => {
    expect(safeAdminCallback('/\t/evil.example')).toBeNull()
    expect(safeAdminCallback('/\n/evil.example')).toBeNull()
    expect(safeAdminCallback('/\r/evil.example')).toBeNull()
  })

  it('rejects post-decode control-character variants as they would arrive via searchParams.get()', () => {
    const payloads = ['%2F%09%2Fevil.example', '%2F%0A%2Fevil.example', '%2F%0D%2Fevil.example']
    for (const encodedQuery of payloads) {
      const url = new URL(`https://www.walztravels.com/admin/login?from=${encodedQuery}`)
      const decoded = url.searchParams.get('from')!
      expect(safeAdminCallback(decoded)).toBeNull()
    }
  })

  it('rejects javascript: and data: schemes', () => {
    expect(safeAdminCallback('javascript:alert(document.cookie)')).toBeNull()
    expect(safeAdminCallback('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects malformed/null/undefined/empty/non-string input', () => {
    expect(safeAdminCallback(null)).toBeNull()
    expect(safeAdminCallback(undefined)).toBeNull()
    expect(safeAdminCallback('')).toBeNull()
    expect(safeAdminCallback(42)).toBeNull()
  })

  it('rejects a safe same-origin path outside of /admin entirely (admin-namespace restriction)', () => {
    expect(safeAdminCallback('/dashboard')).toBeNull()
    expect(safeAdminCallback('/business')).toBeNull()
    expect(safeAdminCallback('/')).toBeNull()
    expect(safeAdminCallback('/adminx')).toBeNull() // prefix-boundary check, not a loose substring match
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. INTEGRATION — the actual AdminLoginPage component at both call sites
// ─────────────────────────────────────────────────────────────────────────

const ADVERSARIAL_PAYLOADS: Array<{ name: string; payload: string }> = [
  { name: 'absolute external URL (https)',  payload: 'https://evil.example' },
  { name: 'protocol-relative //evil.example', payload: '//evil.example' },
  { name: 'backslash variant /\\evil.example', payload: '/\\evil.example' },
  { name: 'backslash variant /\\/evil.example', payload: '/\\/evil.example' },
  { name: 'raw TAB /\\t/evil.example', payload: '/\t/evil.example' },
  { name: 'raw LF /\\n/evil.example', payload: '/\n/evil.example' },
  { name: 'raw CR /\\r/evil.example', payload: '/\r/evil.example' },
  { name: 'dot-segment traversal /admin/../../../login', payload: '/admin/../../../login' },
  { name: 'encoded dot-segment /admin/%2e%2e/%2e%2e/etc/passwd', payload: '/admin/%2e%2e/%2e%2e/etc/passwd' },
  { name: 'javascript: scheme', payload: 'javascript:alert(document.cookie)' },
  { name: 'data: scheme', payload: 'data:text/html,<script>alert(1)</script>' },
  { name: 'non-admin same-origin path /dashboard', payload: '/dashboard' },
  { name: 'non-admin same-origin path /business', payload: '/business' },
  { name: 'non-admin same-origin path /', payload: '/' },
]

const LEGITIMATE_ADMIN_CALLBACKS = ['/admin', '/admin/dashboard', '/admin/orbit/studio?x=1#y']

describe('INTEGRATION: the actual app/admin/login/page.tsx source routes `from` through safeAdminCallback', () => {
  it('imports and calls safeAdminCallback, and no longer contains the old unvalidated fallback expression', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/admin/login/page.tsx'), 'utf-8')
    expect(src).toContain("import { safeAdminCallback } from '@/lib/safe-redirect'")
    expect(src).toContain("safeAdminCallback(searchParams.get('from'))")
    expect(src).not.toContain("searchParams.get('from') ?? '/admin/dashboard'")
  })
})

describe('INTEGRATION: actual AdminLoginPage component — password login call site', () => {
  async function renderAndSubmitPassword(fromParam: string | null) {
    jest.resetModules()
    const mockPush = jest.fn()
    const mockRefresh = jest.fn()
    const mockParams = new URLSearchParams()
    if (fromParam !== null) mockParams.set('from', fromParam)
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
      useSearchParams: () => mockParams,
    }))
    jest.doMock('next/image', () => ({
      __esModule: true,
      default: (props: any) => require('react').createElement('img', props),
    }))

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as any

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const AdminLoginPage = require('@/app/admin/login/page').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(React.createElement(AdminLoginPage)))

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(emailInput, 'admin@walztravels.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeInputValueSetter.call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    act(() => root.unmount())
    container.remove()

    return mockPush
  }

  it.each(ADVERSARIAL_PAYLOADS)('a malicious ?from=$name results in router.push(/admin/dashboard), never the attacker/non-admin value', async ({ payload }) => {
    const mockPush = await renderAndSubmitPassword(payload)
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/admin/dashboard')
    expect(mockPush).not.toHaveBeenCalledWith(payload)
  })

  it.each(LEGITIMATE_ADMIN_CALLBACKS)('a legitimate ?from=%s is preserved and passed to router.push exactly', async (callback) => {
    const mockPush = await renderAndSubmitPassword(callback)
    expect(mockPush).toHaveBeenCalledWith(callback)
  })

  it('no ?from param at all falls back to /admin/dashboard (unchanged default behavior)', async () => {
    const mockPush = await renderAndSubmitPassword(null)
    expect(mockPush).toHaveBeenCalledWith('/admin/dashboard')
  })
})

describe('INTEGRATION: actual AdminLoginPage component — biometric/WebAuthn login call site', () => {
  async function renderAndSubmitBiometric(fromParam: string | null) {
    jest.resetModules()
    const mockPush = jest.fn()
    const mockRefresh = jest.fn()
    const mockParams = new URLSearchParams()
    if (fromParam !== null) mockParams.set('from', fromParam)
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
      useSearchParams: () => mockParams,
    }))
    jest.doMock('next/image', () => ({
      __esModule: true,
      default: (props: any) => require('react').createElement('img', props),
    }))
    jest.doMock('@simplewebauthn/browser', () => ({
      startAuthentication: jest.fn().mockResolvedValue({ id: 'cred_1' }),
    }))

    // Make the platform-authenticator check resolve true so the biometric
    // button renders, and mock the two WebAuthn fetch round-trips.
    ;(window as any).PublicKeyCredential = function () {}
    ;(window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = jest
      .fn()
      .mockResolvedValue(true)

    global.fetch = jest.fn().mockImplementation((url: string, init?: any) => {
      if (typeof url === 'string' && url.includes('/api/admin/auth/webauthn/authenticate') && (!init || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: async () => ({ challenge: 'c' }) })
      }
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }) as any

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { act } = React
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const AdminLoginPage = require('@/app/admin/login/page').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(React.createElement(AdminLoginPage)))

    // Let the useEffect's isUserVerifyingPlatformAuthenticatorAvailable()
    // promise resolve and re-render with the biometric button visible.
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeInputValueSetter.call(emailInput, 'admin@walztravels.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    const bioButton = buttons.find(b => b.textContent?.includes('Face ID') || b.textContent?.includes('Verifying'))
    expect(bioButton).toBeTruthy()

    await act(async () => {
      bioButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(r => setTimeout(r, 0))
      await new Promise(r => setTimeout(r, 0))
    })

    act(() => root.unmount())
    container.remove()
    delete (window as any).PublicKeyCredential

    return mockPush
  }

  it.each(ADVERSARIAL_PAYLOADS)('a malicious ?from=$name results in router.push(/admin/dashboard) on the biometric success path too', async ({ payload }) => {
    const mockPush = await renderAndSubmitBiometric(payload)
    expect(mockPush).toHaveBeenCalledWith('/admin/dashboard')
    expect(mockPush).not.toHaveBeenCalledWith(payload)
  })

  it('a legitimate ?from=/admin/orbit/studio is preserved on the biometric success path', async () => {
    const mockPush = await renderAndSubmitBiometric('/admin/orbit/studio')
    expect(mockPush).toHaveBeenCalledWith('/admin/orbit/studio')
  })
})
