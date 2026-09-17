/**
 * Provider error handling & input validation for the admin inbox
 * Chatwoot proxy routes (INBOX-0S.3).
 *
 * Rules these helpers enforce:
 *  - Upstream failures are never wrapped in HTTP 200 and raw
 *    Chatwoot/Supabase error objects never reach the browser — routes log
 *    detail server-side and return a controlled, user-facing message.
 *  - Mutation inputs are validated server-side: resolve/reopen status
 *    against an allow-list, assignee ids as positive integers, reply
 *    payloads for shape/size, attachments for type/size/count.
 *  - The Private Note flag is parsed strictly. A malformed or missing
 *    flag is REJECTED (400), never silently coerced to a public reply —
 *    a private note must not become client-visible through request
 *    serialization quirks.
 *
 * Everything here is pure (no fetch, no Next imports) so it is unit-
 * testable; routes translate results into NextResponse.
 */

// ── Upstream failure mapping ─────────────────────────────────────────────────

export interface MappedFailure { status: number; error: string }

/**
 * Map a Chatwoot response status to a controlled client-facing error.
 * 404 stays 404 (the conversation genuinely doesn't exist); everything
 * else — including upstream 401/403, which are OUR configuration's fault,
 * not the staff member's — becomes 502 with a generic message.
 */
export function mapChatwootFailure(upstreamStatus: number, what: string): MappedFailure {
  if (upstreamStatus === 404) return { status: 404, error: 'Conversation not found.' }
  return { status: 502, error: `${what} failed — messaging service error. Please try again.` }
}

/** Parse a fetch Response body as JSON without ever throwing. */
export async function safeJson(res: { json(): Promise<unknown> }): Promise<unknown | null> {
  try { return await res.json() } catch { return null }
}

// ── Resolve / reopen ─────────────────────────────────────────────────────────

/**
 * Statuses the admin UI may set. Deliberately excludes 'pending' (the Jade
 * human-takeover state) and 'snoozed' — lifecycle states are managed by the
 * Jade handoff flow, not by this endpoint. Note 'open' RESUMES Jade.
 */
export const RESOLVE_STATUSES = ['open', 'resolved'] as const
export type ResolveStatus = (typeof RESOLVE_STATUSES)[number]

export function validateResolveStatus(v: unknown):
  | { ok: true; status: ResolveStatus }
  | { ok: false; error: string } {
  if (v === undefined) return { ok: true, status: 'resolved' }   // legacy default
  if (typeof v === 'string' && (RESOLVE_STATUSES as readonly string[]).includes(v)) {
    return { ok: true, status: v as ResolveStatus }
  }
  return { ok: false, error: `status must be one of: ${RESOLVE_STATUSES.join(', ')}` }
}

// ── Assignment ───────────────────────────────────────────────────────────────

export function validateAssigneeId(v: unknown):
  | { ok: true; id: number }
  | { ok: false; error: string } {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return { ok: true, id: v }
  return { ok: false, error: 'assignee_id must be a positive integer' }
}

// ── Reply payloads ───────────────────────────────────────────────────────────

export const REPLY_MAX_CHARS = 10_000

/**
 * Strict private-flag parsing. JSON: boolean, or absent (defaults to a
 * public reply — the documented shape for a plain {content} POST). Form:
 * the exact strings 'true'/'false' only — an absent or malformed field is
 * an error, because defaulting it would let a private note go out publicly.
 */
export function parsePrivateFlag(input:
  | { kind: 'json'; value: unknown }
  | { kind: 'form'; value: unknown }):
  | { ok: true; isPrivate: boolean }
  | { ok: false; error: string } {
  if (input.kind === 'json') {
    if (input.value === undefined) return { ok: true, isPrivate: false }
    if (typeof input.value === 'boolean') return { ok: true, isPrivate: input.value }
    return { ok: false, error: 'private must be a boolean' }
  }
  if (input.value === 'true')  return { ok: true, isPrivate: true }
  if (input.value === 'false') return { ok: true, isPrivate: false }
  return { ok: false, error: "private must be 'true' or 'false'" }
}

export function validateReplyContent(content: string, hasAttachment: boolean):
  | { ok: true }
  | { ok: false; error: string } {
  if (content.length === 0 && !hasAttachment) {
    return { ok: false, error: 'Message cannot be empty.' }
  }
  if (content.length > REPLY_MAX_CHARS) {
    return { ok: false, error: `Message is too long (max ${REPLY_MAX_CHARS.toLocaleString()} characters).` }
  }
  return { ok: true }
}

// ── Attachments ──────────────────────────────────────────────────────────────

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024   // 10 MB
export const ATTACHMENT_MAX_COUNT = 1                  // the UI sends one file

// Mirrors the ReplyBox accept list: images, PDF, Office docs, CSV, plain text.
export const ATTACHMENT_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
])
export const ATTACHMENT_ALLOWED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
])

/**
 * Validate attachment metadata BEFORE the file body is read into memory —
 * the size check is what protects the serverless lambda from oversized
 * uploads. Browsers sometimes omit the MIME type, so a recognised
 * extension is accepted as a fallback; an unknown type AND unknown
 * extension is rejected.
 */
export function validateAttachmentMeta(file: { name: string; size: number; type: string }):
  | { ok: true }
  | { ok: false; status: 413 | 415; error: string } {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, status: 413, error: 'Attachment is too large (max 10 MB).' }
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  const mimeOk = file.type !== '' && ATTACHMENT_ALLOWED_MIME.has(file.type.toLowerCase())
  const extOk  = ATTACHMENT_ALLOWED_EXT.has(ext)
  if (!mimeOk && !extOk) {
    return { ok: false, status: 415, error: 'This file type is not supported.' }
  }
  return { ok: true }
}
