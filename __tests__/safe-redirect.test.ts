/**
 * Walz Business — lib/safe-redirect.ts pure-function unit tests.
 *
 * CRITICAL regression suite for the open-redirect fix: the original
 * `isSafeLocalPath` was a string-prefix deny-list (`startsWith('//')`,
 * `startsWith('/\\')`) that did NOT reject embedded ASCII control
 * characters (TAB `\x09`, LF `\x0A`, CR `\x0D`). Per the WHATWG URL spec —
 * identical behavior in every major browser and in Node's own `URL` class —
 * those control characters are silently stripped anywhere in a string being
 * parsed as a URL, so a payload like `/\t/evil.com` passed the old filter
 * but a browser resolves `new URL('/\t/evil.com', 'https://www.walztravels.com')`
 * to `https://evil.com/`.
 *
 * The fix replaces the deny-list with robust positive validation: parse the
 * candidate against the app's known local origin using the real WHATWG
 * `URL` parser, then compare the PARSED result's `.origin`/`.protocol`
 * against the expected local origin.
 */
import { isSafeLocalPath, safeLocalRedirect } from '@/lib/safe-redirect'

describe('isSafeLocalPath / safeLocalRedirect — THE original CRITICAL exploit payload', () => {
  it('REGRESSION: /\\t/evil.com (raw TAB) is now rejected — this is the exact payload from the finding', () => {
    const payload = '/\t/evil.com'
    // Prove it would still be exploitable via naive resolution, so this
    // test fails loudly if the fix is ever reverted to a string check.
    const resolved = new URL(payload, 'https://www.walztravels.com')
    expect(resolved.hostname).toBe('evil.com')

    expect(isSafeLocalPath(payload)).toBe(false)
    expect(safeLocalRedirect(payload, '/business')).toBe('/business')
  })
})

describe('isSafeLocalPath — adversarial control-character payloads', () => {
  it('rejects raw TAB, LF, CR control-character payloads', () => {
    expect(isSafeLocalPath('/\t/evil.com')).toBe(false)
    expect(isSafeLocalPath('/\n/evil.com')).toBe(false)
    expect(isSafeLocalPath('/\r/evil.com')).toBe(false)
  })

  it('rejects the post-decode form of %09/%0A/%0D as they would arrive via searchParams.get()', () => {
    // useSearchParams().get() (and URLSearchParams.get() generally) returns
    // the DECODED value — i.e. by the time a query string of
    // `?callbackUrl=%09%2Fevil.com` reaches our function, it already looks
    // like a literal control character, exactly as exercised here.
    const url = new URL('https://www.walztravels.com/business/login?callbackUrl=%09%2Fevil.com')
    const decodedTab = url.searchParams.get('callbackUrl')!
    expect(decodedTab).toBe('\t/evil.com')
    // That decoded value doesn't even start with '/', so it's rejected on
    // that basis too — but also exercise a decoded value that DOES start
    // with '/' to isolate the control-character check itself:
    const url2 = new URL('https://www.walztravels.com/business/login?callbackUrl=%2F%09%2Fevil.com')
    const decoded2 = url2.searchParams.get('callbackUrl')!
    expect(decoded2).toBe('/\t/evil.com')
    expect(isSafeLocalPath(decoded2)).toBe(false)

    const url3 = new URL('https://www.walztravels.com/business/login?callbackUrl=%2F%0A%2Fevil.com')
    expect(isSafeLocalPath(url3.searchParams.get('callbackUrl')!)).toBe(false)

    const url4 = new URL('https://www.walztravels.com/business/login?callbackUrl=%2F%0D%2Fevil.com')
    expect(isSafeLocalPath(url4.searchParams.get('callbackUrl')!)).toBe(false)
  })

  it('rejects every other ASCII control character (0x00-0x1F, 0x7F), categorically — not just the three named in the finding', () => {
    for (let code = 0x00; code <= 0x1f; code++) {
      const ch = String.fromCharCode(code)
      expect(isSafeLocalPath(`/${ch}evil.com`)).toBe(false)
    }
    expect(isSafeLocalPath(`/\x7Fevil.com`)).toBe(false)
  })
})

describe('isSafeLocalPath — protocol-relative and backslash variants', () => {
  it('rejects //evil.com', () => {
    expect(isSafeLocalPath('//evil.com')).toBe(false)
    expect(isSafeLocalPath('//evil.com/phish')).toBe(false)
  })

  it('rejects /\\evil.com and /\\/evil.com', () => {
    expect(isSafeLocalPath('/\\evil.com')).toBe(false)
    expect(isSafeLocalPath('/\\/evil.com')).toBe(false)
  })

  it('handles an encoded-slash variant safely: /%2F%2Fevil.com stays a literal local path, not a host switch', () => {
    // Pre-decode, the raw string still contains the literal characters
    // "%2F%2Fevil.com" (percent signs included) — this is the shape that
    // would reach our function if a caller never ran decodeURIComponent on
    // it (searchParams.get() would already have decoded %2F to '/' before
    // this point in real usage — see the control-char test above for that
    // post-decode path). The WHATWG URL parser treats percent-encoded
    // sequences inside a path segment as opaque path characters, NOT as
    // structural separators, so this resolves to a same-origin path and is
    // accepted — it can never cause a host switch either way.
    expect(isSafeLocalPath('/%2F%2Fevil.com')).toBe(true)
    const result = safeLocalRedirect('/%2F%2Fevil.com', '/business')
    const resolved = new URL(result, 'https://walztravels.com')
    expect(resolved.hostname).toBe('walztravels.com')
  })
})

describe('isSafeLocalPath — absolute URLs and dangerous schemes', () => {
  it('rejects a full external absolute URL', () => {
    expect(isSafeLocalPath('https://evil.com/phish')).toBe(false)
    expect(isSafeLocalPath('http://evil.com')).toBe(false)
  })

  it('rejects javascript: URLs', () => {
    expect(isSafeLocalPath('javascript:alert(1)')).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isSafeLocalPath('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('confirms the rejection is because these schemes never share the local origin once parsed', () => {
    const jsUrl = new URL('javascript:alert(1)', 'https://walztravels.com')
    expect(jsUrl.origin).toBe('null')
    expect(jsUrl.protocol).not.toBe('https:')

    const dataUrl = new URL('data:text/html,hi', 'https://walztravels.com')
    expect(dataUrl.origin).toBe('null')
    expect(dataUrl.protocol).not.toBe('https:')
  })
})

describe('isSafeLocalPath — non-string / empty input', () => {
  it('rejects null, undefined, empty string, and non-string types', () => {
    expect(isSafeLocalPath(null)).toBe(false)
    expect(isSafeLocalPath(undefined)).toBe(false)
    expect(isSafeLocalPath('')).toBe(false)
    expect(isSafeLocalPath(42)).toBe(false)
    expect(isSafeLocalPath({})).toBe(false)
    expect(isSafeLocalPath([])).toBe(false)
  })
})

describe('isSafeLocalPath — legitimate callbacks must still work exactly as before', () => {
  it('accepts /business', () => {
    expect(isSafeLocalPath('/business')).toBe(true)
  })
  it('accepts /business/<orgId>', () => {
    expect(isSafeLocalPath('/business/org_123')).toBe(true)
  })
  it('accepts /business/invitations/<token>', () => {
    expect(isSafeLocalPath('/business/invitations/abc123def456')).toBe(true)
  })
  it('accepts a path with a local query string', () => {
    expect(isSafeLocalPath('/business?x=1')).toBe(true)
  })
  it('accepts a path with a local hash', () => {
    expect(isSafeLocalPath('/business#section')).toBe(true)
  })
})

describe('safeLocalRedirect — fallback and pass-through behavior', () => {
  it('falls back on every rejected payload', () => {
    expect(safeLocalRedirect('//evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect('/\\evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect('https://evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect('javascript:alert(1)', '/business')).toBe('/business')
    expect(safeLocalRedirect('data:text/html,hi', '/business')).toBe('/business')
    expect(safeLocalRedirect('/\t/evil.com', '/business')).toBe('/business')
    expect(safeLocalRedirect(null, '/business')).toBe('/business')
  })

  it('passes through a safe local path unchanged (no query/hash)', () => {
    expect(safeLocalRedirect('/business/org_123', '/business')).toBe('/business/org_123')
  })

  it('preserves a local query string', () => {
    expect(safeLocalRedirect('/business?x=1', '/business')).toBe('/business?x=1')
  })

  it('preserves a local hash', () => {
    expect(safeLocalRedirect('/business#section', '/business')).toBe('/business#section')
  })

  it('returns only the reconstructed local path+query+hash, never the raw original string, even when they are identical in content', () => {
    const result = safeLocalRedirect('/business/invitations/tok123', '/business')
    expect(result).toBe('/business/invitations/tok123')
    // Defensive normalization property: the return value is always built
    // from pathname+search+hash of the parsed URL, not string-copied from
    // the input.
    const parsed = new URL('/business/invitations/tok123', 'https://walztravels.com')
    expect(result).toBe(parsed.pathname + parsed.search + parsed.hash)
  })
})
