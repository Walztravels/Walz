// lib/safe-redirect.ts — Walz Business (V1-A): shared "is this a safe,
// same-origin, local path" check for callbackUrl-style redirect targets
// accepted from untrusted query params or request bodies.
//
// CRITICAL FIX (2026-10-02): the original implementation here was a
// string-prefix deny-list (`startsWith('//')`, `startsWith('/\\')`). That
// style of check is fundamentally unsound against URL-parser normalization
// quirks: it blocked the two bypass shapes it happened to name, but did NOT
// reject embedded ASCII control characters (TAB `\x09`, LF `\x0A`, CR
// `\x0D`, and others in 0x00–0x1F/0x7F). Per the WHATWG URL spec — identical
// behavior in every major browser and in Node's own `URL` class — those
// control characters are silently stripped anywhere they appear in a string
// being parsed as a URL. A payload like `/\t/evil.com` therefore passed the
// old `startsWith('/')`-based filter (it starts with `/` and not with `//`
// or `/\\`) but a browser resolves
// `new URL('/\t/evil.com', 'https://www.walztravels.com')` to
// `https://evil.com/` — a genuine open redirect, reachable via
// `BusinessLoginForm.tsx`'s post-sign-in `window.location.href = callbackUrl`.
//
// This rewrite replaces the growing deny-list with robust POSITIVE
// validation: parse the candidate against a known local origin using the
// actual WHATWG `URL` parser (the same algorithm every browser uses to
// resolve `window.location.href = ...`), then compare the PARSED result's
// `.origin` (and `.protocol`) against the expected local origin. Any input
// that resolves to a different origin — via `//evil.com`, `/\evil.com`,
// embedded control characters, a fully-qualified external URL, or any other
// normalization trick — is rejected categorically, because the check now
// inspects what the browser would actually navigate to, not a guess at
// string patterns.
//
// Base origin: this module intentionally does NOT import `SITE_URL` from
// lib/seo.ts (that constant is unused by every other call site in this
// codebase — see e.g. lib/business/invitation-email.ts and
// lib/business/claim-invite.ts, the two most directly analogous files in
// this same domain, which both independently read
// `process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'` rather
// than importing a shared helper). This file follows that exact, already-
// established Business-domain precedent so the local origin used here
// matches the origin those sibling files already treat as canonical.
//
// This helper is used by every NEW callbackUrl-accepting call site added in
// this slice (Business login/register forms, the signup route's optional
// callbackUrl field, and the verify-email redirect). It deliberately does
// NOT touch app/login/LoginForm.tsx's own inline check — that pre-existing
// consumer code path is out of scope for this slice (see release notes) and
// its behavior must remain byte-for-byte unchanged.

const LOCAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'

// Any ASCII control character (0x00–0x1F, plus DEL 0x7F) can trigger
// browser/URL-parser stripping or normalization quirks when embedded in a
// string that is later parsed as a URL. Rejecting all of them up front —
// categorically, not just the three characters (`\t`, `\n`, `\r`) in the
// specific exploit that was found — closes this entire bypass class rather
// than one instance of it.
// eslint-disable-next-line no-control-regex
const ASCII_CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/

function resolveLocalOrigin(): { origin: string; protocol: string } | null {
  try {
    const base = new URL(LOCAL_BASE_URL)
    return { origin: base.origin, protocol: base.protocol }
  } catch {
    return null
  }
}

/**
 * Parses `raw` against the app's known local origin and returns the parsed
 * `URL` only if it is a genuinely local, same-origin, http(s) path —
 * otherwise `null`. This is the single source of truth both exported
 * functions below build on.
 */
function parseIfLocal(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0) return null

  // 1. Reject embedded ASCII control characters BEFORE doing anything else.
  if (ASCII_CONTROL_CHAR_RE.test(raw)) return null

  // 2. Must look like a path, not an absolute URL or a non-http(s) scheme
  //    (javascript:, data:, mailto:, etc. never start with '/').
  if (!raw.startsWith('/')) return null

  const local = resolveLocalOrigin()
  if (!local) return null

  // 3. Parse against the known local origin using actual URL parsing —
  //    not string-prefix heuristics — so protocol-relative (`//evil.com`),
  //    backslash variants (`/\evil.com`, `/\/evil.com`), and any other
  //    normalization trick are handled by inspecting the real parsed
  //    result rather than guessing at patterns.
  let parsed: URL
  try {
    parsed = new URL(raw, LOCAL_BASE_URL)
  } catch {
    return null
  }

  // 4. The parsed result's origin must match the expected local origin
  //    exactly. This is what categorically defeats //evil.com, /\evil.com,
  //    mixed slash/backslash variants, and fully-qualified external URLs.
  if (parsed.origin !== local.origin) return null

  // 5. Belt-and-braces: the protocol must match the local origin's own
  //    protocol (http:/https:). javascript:/data:/etc. parse to an opaque
  //    ("null") origin already rejected by step 4, but this is asserted
  //    explicitly rather than assumed.
  if (parsed.protocol !== local.protocol) return null

  return parsed
}

export function isSafeLocalPath(raw: unknown): raw is string {
  return parseIfLocal(raw) !== null
}

/**
 * Returns `raw` if it is a safe local path, otherwise `fallback`.
 *
 * On success this returns ONLY the reconstructed local path+query+hash
 * (`url.pathname + url.search + url.hash`) — never the caller's original
 * raw string and never a full absolute URL. This is itself a defensive
 * normalization: even if some exotic input slipped through parsing with a
 * matching origin by coincidence, the caller can never receive anything but
 * a genuinely local path reconstructed from the parsed result.
 */
export function safeLocalRedirect(raw: unknown, fallback: string): string {
  const parsed = parseIfLocal(raw)
  if (!parsed) return fallback
  return parsed.pathname + parsed.search + parsed.hash
}

// ── LOW FIX (2026-10-02): /business-scoped callback validation ─────────────
//
// The Business signup/verify-email routes (app/api/auth/signup/route.ts,
// app/api/auth/verify-email/route.ts) need a narrower guarantee than plain
// same-origin safety: the callback must resolve INTO the /business
// namespace specifically. Their original gate checked the RAW,
// unnormalized string's literal prefix:
//
//   isSafeLocalPath(rawCallbackUrl) && rawCallbackUrl.startsWith('/business')
//
// That's unsound for the same reason the original CRITICAL finding was:
// `rawCallbackUrl.startsWith('/business')` inspects the string the caller
// sent, not what a browser actually navigates to. A payload like
// `/business/../../../etc/passwd` literally starts with `/business` (so the
// raw check passes) but the WHATWG URL parser's dot-segment normalization
// — the same normalization `safeLocalRedirect` above already performs and
// returns as its `pathname` — resolves it to `/etc/passwd`, which is not
// `/business`-prefixed at all. Since `/etc/passwd` is still same-origin,
// `isSafeLocalPath` alone would also accept it; only checking the
// *normalized* result against the `/business` prefix catches this.
//
// `safeBusinessCallback` fixes this by building on `safeLocalRedirect`
// (not re-parsing the URL itself) and checking the prefix against the
// RECONSTRUCTED, already-normalized path — the exact string callers will
// go on to thread forward (into the verification email link, into the
// post-verify redirect) — never against the caller's raw input. Callers
// must use this function's return value (not the original raw input) as
// the value they store/thread forward, so a pre-normalization payload can
// never reach anything downstream.
export function safeBusinessCallback(raw: unknown): string | null {
  // '' can never be a valid safeLocalRedirect() success value (every real
  // local path begins with '/'), so it's a safe "no value" sentinel here.
  const normalized = safeLocalRedirect(raw, '')
  if (!normalized) return null
  if (normalized === '/business' || normalized.startsWith('/business/')) {
    return normalized
  }
  return null
}

// ── CRITICAL FIX (2026-10-02): /admin-scoped callback validation ───────────
//
// app/admin/login/page.tsx accepted an unvalidated `?from=` query param and
// passed it straight to `router.push(from)` at two call sites (password
// login success, biometric/WebAuthn login success) — a confirmed open
// redirect (same bug family as the one fixed above for consumer login and
// Business callbackUrl handling). Admin login additionally needs a narrower
// guarantee than plain same-origin safety, mirroring `safeBusinessCallback`
// exactly: the callback must resolve INTO the /admin namespace specifically,
// and that check must run against the NORMALIZED, parsed pathname — never
// the raw input string — for the same reason documented above
// `safeBusinessCallback` (a raw-string prefix check lets a dot-segment
// payload like `/admin/../../../etc` pass a naive `startsWith('/admin')`
// test while actually resolving outside `/admin` entirely).
export function safeAdminCallback(raw: unknown): string | null {
  // '' can never be a valid safeLocalRedirect() success value (every real
  // local path begins with '/'), so it's a safe "no value" sentinel here.
  const normalized = safeLocalRedirect(raw, '')
  if (!normalized) return null
  if (normalized === '/admin' || normalized.startsWith('/admin/')) {
    return normalized
  }
  return null
}
