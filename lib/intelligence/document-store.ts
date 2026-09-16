import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'

/**
 * Private retention for visa supporting documents (DI-2).
 *
 * Mirrors the recruitment-docs conventions: a PRIVATE bucket, service-role
 * access only, create-on-demand, sanitized paths. Passports and bank
 * statements never get public URLs — reads go through short-lived signed
 * URLs minted server-side for authorized staff, or service-role downloads.
 */

export const INTEL_DOC_BUCKET = 'visa-documents'   // PRIVATE — created with public:false
const INTEL_PREFIX = 'intel'

export const INTEL_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const INTEL_MAX_BYTES = 15 * 1024 * 1024

function safeFilename(name: string): string {
  const base = (name || 'document').split(/[\\/]/).pop() ?? 'document'
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Wrap DB writes so the pipeline degrades gracefully before the DI-2
 *  migration has been run (same convention as cv_extractions). */
async function tryDb<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/does not exist|relation|column/i.test(msg)) return null
    throw e
  }
}

export interface StoredDocument {
  documentId: string | null   // null when the table is not migrated yet
  storagePath: string
  checksum: string
}

/**
 * Validate and privately store one supporting document, recording it in
 * VisaCaseDocument. Returns a typed error for anything not storable.
 */
export async function storeCaseDocument(opts: {
  applicationId: string | null
  documentType:  string
  fileName:      string
  mimeType:      string
  buffer:        Buffer
  uploadedBy:    string
}): Promise<{ ok: true; doc: StoredDocument } | { ok: false; error: string }> {
  if (!INTEL_ALLOWED_TYPES.includes(opts.mimeType)) {
    return { ok: false, error: 'Only PDF, JPG, PNG or WEBP documents can be analyzed.' }
  }
  if (opts.buffer.length === 0 || opts.buffer.length > INTEL_MAX_BYTES) {
    return { ok: false, error: 'The document must be between 1 byte and 15MB.' }
  }

  const supabase = getSupabaseAdmin()
  const scope = opts.applicationId ? opts.applicationId : 'unlinked'
  const storagePath = `${INTEL_PREFIX}/${scope}/${Date.now()}_${safeFilename(opts.fileName)}`

  let { error } = await supabase.storage.from(INTEL_DOC_BUCKET)
    .upload(storagePath, opts.buffer, { contentType: opts.mimeType, upsert: false })
  if (error && /not found/i.test(error.message)) {
    await supabase.storage.createBucket(INTEL_DOC_BUCKET, { public: false }).catch(() => {})
    ;({ error } = await supabase.storage.from(INTEL_DOC_BUCKET)
      .upload(storagePath, opts.buffer, { contentType: opts.mimeType, upsert: false }))
  }
  if (error) {
    console.error('[intel-doc-store] upload failed:', error.message)
    return { ok: false, error: 'The document could not be stored — please try again.' }
  }

  const checksum = sha256(opts.buffer)
  const row = await tryDb(() => prisma.visaCaseDocument.create({
    data: {
      applicationId: opts.applicationId,
      bucket:        INTEL_DOC_BUCKET,
      storagePath,
      documentType:  opts.documentType,
      fileName:      safeFilename(opts.fileName),
      mimeType:      opts.mimeType,
      fileSize:      opts.buffer.length,
      checksum,
      uploadedBy:    opts.uploadedBy,
    },
    select: { id: true },
  }))

  return { ok: true, doc: { documentId: row?.id ?? null, storagePath, checksum } }
}

/** Short-lived signed URL for an authorized staff read. Never public. */
export async function signedDocumentUrl(storagePath: string, expiresInSeconds = 600): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().storage
    .from(INTEL_DOC_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) return null
  return data?.signedUrl ?? null
}
