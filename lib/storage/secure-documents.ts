// lib/storage/secure-documents.ts
// Release 6.1 — Track 7: Server-side document URL security.
//
// Problem: upload/route.ts stored a 7-day signed URL as PortalDocument.fileUrl.
// After 7 days the stored URL expires and documents become inaccessible.
//
// Solution: always generate a fresh short-lived signed URL from the fileKey
// (storage path) at retrieval time, after verifying server-side ownership.
// The stored fileUrl is kept for backward compat but should not be trusted
// to still be valid — always use getSecureDocumentUrl() for display.

import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logIdentityEvent, IDENTITY_EVENT } from '@/lib/portal/identity-logging'

const BUCKET            = 'portal-documents'
const DEFAULT_EXPIRY_S  = 60 * 60  // 1-hour signed URL — short-lived, safe to re-generate

export interface SecureDocumentUrl {
  signedUrl:  string
  expiresAt:  string  // ISO-8601
  documentId: string
}

/**
 * Generate a fresh short-lived signed URL for a portal document.
 * Verifies server-side that userId owns the document before signing.
 *
 * @param documentId  PortalDocument.id
 * @param userId      Authenticated portal User.id (from NextAuth session)
 * @param expiresInS  Signed URL TTL in seconds (default: 1 hour)
 */
export async function getSecureDocumentUrl(
  documentId:  string,
  userId:      string,
  expiresInS = DEFAULT_EXPIRY_S,
): Promise<SecureDocumentUrl | null> {
  // Ownership check — must be server-authoritative
  const doc = await prisma.portalDocument.findFirst({
    where: { id: documentId, userId },
    select: { id: true, fileKey: true, fileUrl: true },
  })

  if (!doc) {
    logIdentityEvent(IDENTITY_EVENT.DOCUMENT_ACCESS_DENIED, { documentId, userId })
    return null
  }

  // Use fileKey (storage path) for the signed URL.
  // Fall back to fileUrl when fileKey is the URL itself (legacy records).
  const storageKey = resolveStorageKey(doc.fileKey, doc.fileUrl)
  if (!storageKey) return null

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, expiresInS)

  if (error || !data?.signedUrl) {
    console.error('[STORAGE] Failed to sign document URL', { documentId, error })
    return null
  }

  logIdentityEvent(IDENTITY_EVENT.DOCUMENT_URL_REFRESHED, { documentId, userId })

  const expiresAt = new Date(Date.now() + expiresInS * 1000).toISOString()
  return { signedUrl: data.signedUrl, expiresAt, documentId }
}

/**
 * Resolve the storage key (path inside the bucket) from the stored values.
 * Legacy records may have stored the full signed URL in fileKey — handle both.
 */
function resolveStorageKey(
  fileKey: string | null,
  fileUrl: string | null,
): string | null {
  if (fileKey && !fileKey.startsWith('http')) return fileKey

  // fileKey is a full URL — extract the path after the bucket name
  const source = fileKey ?? fileUrl
  if (!source) return null

  try {
    const url  = new URL(source)
    const path = url.pathname  // e.g. /storage/v1/object/sign/portal-documents/user-123/doc.pdf
    const marker = `/object/sign/${BUCKET}/`
    const markerAlt = `/object/public/${BUCKET}/`
    const idx = path.indexOf(marker) !== -1
      ? path.indexOf(marker) + marker.length
      : path.indexOf(markerAlt) + markerAlt.length
    if (idx <= 0) return null
    const raw = path.slice(idx)
    // Strip query params that were part of the old signed URL
    return raw.split('?')[0]
  } catch {
    return null
  }
}

/**
 * Verify that userId owns the document. Used when the caller already has
 * the document record and just needs a boolean ownership assertion.
 */
export async function verifyDocumentOwnership(
  documentId: string,
  userId:     string,
): Promise<boolean> {
  const doc = await prisma.portalDocument.findFirst({
    where:  { id: documentId, userId },
    select: { id: true },
  })
  return doc !== null
}
