// lib/safe-redirect.ts — Walz Business (V1-A): shared "is this a safe,
// same-origin, local path" check for callbackUrl-style redirect targets
// accepted from untrusted query params or request bodies.
//
// A bare `path.startsWith('/')` check (the pre-existing pattern in
// app/login/LoginForm.tsx) is NOT sufficient on its own: a protocol-relative
// path like `//evil.com`, or a backslash variant like `/\evil.com` /
// `/\/evil.com`, all start with `/` but browsers can resolve them to an
// EXTERNAL origin (protocol-relative URLs inherit the current scheme; some
// browsers also normalize a leading backslash to a forward slash before
// parsing, making `/\evil.com` equivalent to `//evil.com`). A naive
// `startsWith('/')` check is therefore an open-redirect vector.
//
// This helper is used by every NEW callbackUrl-accepting call site added in
// this slice (Business login/register forms, the signup route's optional
// callbackUrl field, and the verify-email redirect). It deliberately does
// NOT touch app/login/LoginForm.tsx's own inline check — that pre-existing
// consumer code path is out of scope for this slice (see release notes) and
// its behavior must remain byte-for-byte unchanged.
export function isSafeLocalPath(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0) return false
  if (!raw.startsWith('/')) return false
  if (raw.startsWith('//')) return false   // protocol-relative, e.g. //evil.com
  if (raw.startsWith('/\\')) return false  // backslash variant, e.g. /\evil.com
  return true
}

/**
 * Returns `raw` if it is a safe local path, otherwise `fallback`.
 */
export function safeLocalRedirect(raw: unknown, fallback: string): string {
  return isSafeLocalPath(raw) ? raw : fallback
}
