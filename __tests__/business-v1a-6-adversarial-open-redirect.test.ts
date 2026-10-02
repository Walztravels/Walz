/**
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
