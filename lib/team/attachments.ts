/**
 * Walz Team Hub V1 — attachment storage helpers. Mirrors
 * lib/storage/secure-documents.ts's "storageKey only, mint a fresh
 * short-lived signed URL at retrieval time after re-verifying access"
 * pattern exactly. The client-declared MIME type (`contentType` as passed
 * to these functions) is stored in TeamMessageAttachment for DISPLAY
 * purposes only (icon/label) — it is never verified against the file's
 * actual bytes (no magic-byte sniffing), so it must never be trusted for a
 * security-relevant decision.
 *
 * Security review finding (MEDIUM), fixed here: an earlier version passed
 * the unverified client-declared contentType straight through to Supabase
 * Storage's own `upload()` call, meaning IT became the object's actual
 * served Content-Type header — the exact opposite of "never used to
 * decide how content is served." The allowlist below already excludes
 * every browser-executable-as-markup type (no HTML/SVG), which bounded the
 * practical impact, but the comment was simply wrong. Fixed by always
 * storing objects as `application/octet-stream` regardless of the
 * declared type, and always minting signed URLs with a forced
 * `Content-Disposition: attachment` — so a mismatched or spoofed
 * declared type can never influence how a browser renders the response,
 * only how the UI labels/icons it before download.
 */
import { getSupabaseAdmin } from '@/lib/supabase'

export const TEAM_ATTACHMENTS_BUCKET = 'team-hub-attachments'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25MB
export const SIGNED_URL_TTL_S = 60 * 60 // 1 hour

// Deliberately conservative — no HTML/SVG/script-capable types (SVG can carry
// embedded script; HTML is a direct XSS vector if ever served/rendered).
const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
])

export function isAllowedAttachmentType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType)
}

/** Strips path separators and control characters; caps length. Never trust a client-supplied filename as a storage path component. */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').trim()
  return (base || 'file').slice(-180)
}

export function buildAttachmentStorageKey(conversationId: string, messageId: string, filename: string): string {
  return `${conversationId}/${messageId}/${Date.now()}-${sanitizeFilename(filename)}`
}

// Stored as the object's actual Content-Type regardless of what the
// uploader's browser declared — never the client-declared MIME. See this
// file's header comment.
const STORED_CONTENT_TYPE = 'application/octet-stream'

export async function uploadAttachment(storageKey: string, buffer: Buffer) {
  const supabase = getSupabaseAdmin()
  let { error } = await supabase.storage.from(TEAM_ATTACHMENTS_BUCKET).upload(storageKey, buffer, { contentType: STORED_CONTENT_TYPE, upsert: false })
  if (error && (error.message?.includes('not found') || error.message?.includes('Bucket'))) {
    await supabase.storage.createBucket(TEAM_ATTACHMENTS_BUCKET, { public: false })
    ;({ error } = await supabase.storage.from(TEAM_ATTACHMENTS_BUCKET).upload(storageKey, buffer, { contentType: STORED_CONTENT_TYPE }))
  }
  if (error) throw new Error(`Attachment upload failed: ${error.message}`)
}

/** Forces `Content-Disposition: attachment` — the response is always a download, never something a browser could try to render/execute inline, regardless of the (unverified) declared MIME type shown in the UI. */
export async function getAttachmentSignedUrl(storageKey: string, filename: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from(TEAM_ATTACHMENTS_BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_TTL_S, { download: filename })
  if (error || !data?.signedUrl) {
    console.error('[team/attachments] failed to sign URL', error)
    return null
  }
  return data.signedUrl
}
