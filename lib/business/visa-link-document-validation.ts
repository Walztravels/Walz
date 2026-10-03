// lib/business/visa-link-document-validation.ts — Walz Business (V1-C Phase
// 2, Slice C) — SECURE-RECIPIENT-SPECIFIC document selection guards for the
// anonymous visa-link recipient surface
// (app/business/visa-link/[token]/VisaLinkForm.tsx).
//
// WHY THIS IS ITS OWN FILE, AND WHY ITS CONSTANTS ARE MIRRORED RATHER THAN
// IMPORTED FROM lib/intelligence/document-store.ts:
//
//   lib/intelligence/document-store.ts DOES export INTEL_ALLOWED_TYPES and
//   INTEL_MAX_BYTES, and this slice's brief asked to reuse them directly if
//   "importable". They are exported, but that module is NOT safely
//   importable into a 'use client' browser bundle: its top level also
//   imports lib/supabase's getSupabaseAdmin() (a service-role Supabase
//   client factory) and lib/db's Prisma client singleton, plus Node's
//   builtin `crypto` module for sha256(). None of that belongs in, or is
//   guaranteed to even bundle for, client-side JavaScript shipped to an
//   anonymous recipient's browser — at best it bloats the client bundle
//   with server-only code paths; at worst (Node core modules with no
//   browser shim) it risks a hard `next build` failure for the client
//   chunk. Importing it here would also be a bad precedent: a client
//   component reaching into a module whose entire reason to exist is
//   server-side, credentialed storage access.
//
//   So: INTEL_ALLOWED_TYPES / INTEL_MAX_BYTES are copied EXACTLY below —
//   not reinterpreted, not loosened, not tightened. A dedicated test
//   (__tests__/business-v1c-phase2-slice-c-document-validation.test.ts)
//   imports BOTH this file and lib/intelligence/document-store.ts (that
//   test runs in the plain Node test environment, not a browser bundle —
//   importing the server module there is safe) and asserts byte-for-byte
//   equality, specifically so any future drift between the two is caught
//   by CI rather than discovered in production.
//
// SECURE_LINK_MAX_FILES — a NEW cap. A fresh search of storeCaseDocument(),
// VisaCaseDocument, and every visa-documents/visa-submit route (done before
// writing this file) found NO existing limit on file COUNT anywhere in the
// domain — only a per-file byte-size cap. This constant is a
// SECURE-RECIPIENT-SURFACE-SPECIFIC technical ceiling: an abuse/resource
// guard against an anonymous, unauthenticated link recipient queuing up an
// unbounded number of files in one browser tab, NOT a claim about how many
// documents a real visa application needs. It must never be read as a
// product requirement and must never be imposed on the existing, separate,
// authenticated staff/business document-authz-gated upload surfaces. 10 is
// chosen as generous headroom for a typical visa document set (passport bio
// page, passport photo, 2-3 bank statements, an employment or invitation
// letter, a travel itinerary) while still bounding memory/eventual-upload
// cost for this one anonymous, unauthenticated surface.
export const SECURE_LINK_MAX_FILES = 10

// Mirrors lib/intelligence/document-store.ts's INTEL_ALLOWED_TYPES exactly
// — see the file header above for why this is a copy, not an import.
export const SECURE_LINK_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

// Mirrors lib/intelligence/document-store.ts's INTEL_MAX_BYTES (15MB)
// exactly — see the file header above for why this is a copy, not an
// import. This client-side check is UX-only, not authoritative: nothing in
// this slice persists a file anywhere, so there is no server-side
// enforcement point yet. Whichever slice builds the real upload endpoint
// MUST re-validate size (and the signature checks below) itself rather
// than trusting that this component ever ran — see this file's exported
// validateFileSize()/validateFileSignature(), which are plain, dependency-
// free functions specifically so a future server route can import and
// reuse them directly instead of reimplementing the same checks.
export const SECURE_LINK_MAX_FILE_BYTES = 15 * 1024 * 1024

// How many leading bytes we inspect to tell real file content apart from a
// spoofed extension/MIME claim. 12 is the largest prefix any of the four
// signatures below needs (WEBP's "WEBP" marker sits at byte offset 8-11).
export const SECURE_LINK_SIGNATURE_HEADER_BYTES = 16

export type DetectedSignature = 'pdf' | 'jpeg' | 'png' | 'webp' | 'exe' | 'html' | 'svg' | 'unknown'

function startsWithBytes(bytes: Uint8Array, sequence: number[], offset = 0): boolean {
  if (bytes.length < offset + sequence.length) return false
  for (let i = 0; i < sequence.length; i++) {
    if (bytes[offset + i] !== sequence[i]) return false
  }
  return true
}

function startsWithAsciiCI(bytes: Uint8Array, text: string, offset = 0): boolean {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i++) {
    const code = bytes[offset + i]
    if (code === undefined || code > 0x7f) return false
    if (String.fromCharCode(code).toLowerCase() !== text[i].toLowerCase()) return false
  }
  return true
}

/**
 * Inspects raw leading bytes and classifies them by MAGIC-BYTE SIGNATURE
 * ONLY — this is content-format detection, NOT malware scanning. It can
 * tell "this is actually a PNG" apart from "this is actually an HTML
 * file that was renamed .png", but it says nothing about whether a
 * genuinely well-formed PDF/JPEG/PNG/WEBP is safe to open — no scanner for
 * that exists anywhere in this codebase (VisaCaseDocument.scanStatus
 * defaults to SCAN_UNAVAILABLE precisely because none does). See this
 * file's own header and the Slice C report for that residual risk.
 *
 * Deliberately recognizes a few DISALLOWED formats too (exe/html/svg) so
 * callers can give a precise, honest rejection message instead of a bare
 * "unrecognized" for the common spoofing patterns this slice was asked to
 * cover (an .exe/.html/.svg renamed to look like an allowed extension).
 */
export function detectFileSignature(bytes: Uint8Array): DetectedSignature {
  // %PDF-
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  // JPEG SOI marker: FF D8 FF
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  // PNG signature
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // RIFF container with a WEBP identifier at offset 8
  if (startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  // MZ — Windows/DOS executable header
  if (startsWithBytes(bytes, [0x4d, 0x5a])) return 'exe'

  // Text-based signatures: skip a UTF-8 BOM and leading whitespace before
  // comparing, since real HTML/SVG/XML files are routinely saved with
  // either.
  let start = 0
  if (startsWithBytes(bytes, [0xef, 0xbb, 0xbf])) start = 3
  while (start < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[start])) start++

  if (startsWithAsciiCI(bytes, '<!doctype html', start) || startsWithAsciiCI(bytes, '<html', start)) return 'html'
  if (startsWithAsciiCI(bytes, '<svg', start) || startsWithAsciiCI(bytes, '<?xml', start)) return 'svg'

  return 'unknown'
}

const MIME_TO_KIND: Record<string, DetectedSignature> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const EXTENSION_TO_KIND: Record<string, DetectedSignature> = {
  pdf: 'pdf',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).toLowerCase()
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

/**
 * Requires CONSISTENCY between the declared MIME type (File.type — itself
 * just the browser trusting the OS/extension, i.e. client-asserted), the
 * filename's extension, and the ACTUAL leading bytes. Rejects on any
 * mismatch rather than trusting any one of the three alone. This is the
 * one check in this file that inspects real content, not just metadata.
 */
export function validateFileSignature(input: {
  fileName: string
  declaredMimeType: string
  headerBytes: Uint8Array
}): ValidationResult {
  const expectedFromMime = MIME_TO_KIND[input.declaredMimeType]
  if (!expectedFromMime) {
    return { ok: false, error: 'Unsupported file type. Only PDF, JPG, PNG or WEBP files are accepted.' }
  }

  const ext = extensionOf(input.fileName)
  const expectedFromExtension = EXTENSION_TO_KIND[ext]
  if (!expectedFromExtension) {
    return { ok: false, error: 'Unsupported file extension. Use .pdf, .jpg, .jpeg, .png or .webp.' }
  }

  if (expectedFromExtension !== expectedFromMime) {
    return { ok: false, error: "This file's extension does not match its reported type." }
  }

  const detected = detectFileSignature(input.headerBytes)
  if (detected === 'unknown') {
    return { ok: false, error: "This file's content does not match any supported document format." }
  }
  if (detected !== expectedFromMime) {
    const label =
      detected === 'exe' ? 'an executable program' :
      detected === 'html' ? 'an HTML page' :
      detected === 'svg' ? 'an SVG/XML file' :
      `a ${detected.toUpperCase()} file`
    return { ok: false, error: `This file's content looks like ${label}, not a ${expectedFromMime.toUpperCase()} file as claimed.` }
  }

  return { ok: true }
}

/**
 * UX-only size gate mirroring SECURE_LINK_MAX_FILE_BYTES (itself mirroring
 * INTEL_MAX_BYTES — see the file header). Not authoritative on its own;
 * see the note on SECURE_LINK_MAX_FILE_BYTES above.
 */
export function validateFileSize(byteLength: number): ValidationResult {
  if (byteLength <= 0) return { ok: false, error: 'This file is empty.' }
  if (byteLength > SECURE_LINK_MAX_FILE_BYTES) return { ok: false, error: 'This file is too large (maximum 15MB).' }
  return { ok: true }
}
