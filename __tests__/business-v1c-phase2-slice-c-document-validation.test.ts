/**
 * Walz Business (V1-C Phase 2, Slice C) — pure, dependency-free unit tests
 * for lib/business/visa-link-document-validation.ts: the signature
 * (magic-byte) detector, the combined MIME/extension/content consistency
 * check, and the size gate. Runs in the plain Node test environment (no
 * jsdom needed) since the module under test has zero browser-only
 * dependencies — exactly the point of keeping it separate from
 * VisaLinkForm.tsx.
 *
 * Also asserts SECURE_LINK_ALLOWED_MIME_TYPES / SECURE_LINK_MAX_FILE_BYTES
 * stay byte-for-byte identical to lib/intelligence/document-store.ts's own
 * INTEL_ALLOWED_TYPES / INTEL_MAX_BYTES — the two are deliberately COPIES,
 * not a shared import (see this module's header for why), so this is the
 * regression guard against the two silently drifting apart.
 */
import {
  SECURE_LINK_ALLOWED_MIME_TYPES,
  SECURE_LINK_MAX_FILE_BYTES,
  SECURE_LINK_MAX_FILES,
  SECURE_LINK_SIGNATURE_HEADER_BYTES,
  detectFileSignature,
  validateFileSignature,
  validateFileSize,
} from '@/lib/business/visa-link-document-validation'
import { INTEL_ALLOWED_TYPES, INTEL_MAX_BYTES } from '@/lib/intelligence/document-store'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

function asciiBytes(text: string): Uint8Array {
  return new Uint8Array(Array.from(text, c => c.charCodeAt(0)))
}

function padded(sig: Uint8Array, totalLength = SECURE_LINK_SIGNATURE_HEADER_BYTES): Uint8Array {
  const out = new Uint8Array(Math.max(totalLength, sig.length))
  out.set(sig)
  return out
}

// Real, minimal, correctly-signed headers for each allowed format.
const PDF_HEADER = padded(asciiBytes('%PDF-1.7'))
const JPEG_HEADER = padded(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))
const PNG_HEADER = padded(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
const WEBP_HEADER = padded(new Uint8Array([...bytes(0x52, 0x49, 0x46, 0x46), 0, 0, 0, 0, ...asciiBytes('WEBP')]))
const EXE_HEADER = padded(bytes(0x4d, 0x5a, 0x90, 0, 3, 0))
const HTML_HEADER = padded(asciiBytes('<!DOCTYPE html><html>'))
const SVG_HEADER = padded(asciiBytes('<svg xmlns="http://www.w3.org/2000/svg">'))
const SCRIPT_HEADER = padded(asciiBytes('console.log("hello world")'))

describe('detectFileSignature', () => {
  it.each([
    ['pdf', PDF_HEADER],
    ['jpeg', JPEG_HEADER],
    ['png', PNG_HEADER],
    ['webp', WEBP_HEADER],
    ['exe', EXE_HEADER],
    ['html', HTML_HEADER],
    ['svg', SVG_HEADER],
  ] as const)('detects a real %s header as %s', (kind, header) => {
    expect(detectFileSignature(header)).toBe(kind)
  })

  it('classifies plain-text/JS content as unknown (not any of the 4 allowed formats)', () => {
    expect(detectFileSignature(SCRIPT_HEADER)).toBe('unknown')
  })

  it('classifies an empty byte array as unknown', () => {
    expect(detectFileSignature(new Uint8Array(0))).toBe('unknown')
  })

  it('tolerates a UTF-8 BOM and leading whitespace before HTML/SVG markers', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...asciiBytes('  <html>')])
    expect(detectFileSignature(withBom)).toBe('html')
  })
})

describe('validateFileSignature — honest, real content-sniffing (not malware scanning)', () => {
  it('accepts a real PDF declared as application/pdf with a .pdf extension', () => {
    expect(validateFileSignature({ fileName: 'passport.pdf', declaredMimeType: 'application/pdf', headerBytes: PDF_HEADER })).toEqual({ ok: true })
  })

  it('accepts a real JPEG declared as image/jpeg with a .jpg extension', () => {
    expect(validateFileSignature({ fileName: 'photo.jpg', declaredMimeType: 'image/jpeg', headerBytes: JPEG_HEADER })).toEqual({ ok: true })
  })

  it('accepts a real JPEG with a .jpeg extension too', () => {
    expect(validateFileSignature({ fileName: 'photo.jpeg', declaredMimeType: 'image/jpeg', headerBytes: JPEG_HEADER })).toEqual({ ok: true })
  })

  it('accepts a real PNG declared as image/png with a .png extension', () => {
    expect(validateFileSignature({ fileName: 'scan.png', declaredMimeType: 'image/png', headerBytes: PNG_HEADER })).toEqual({ ok: true })
  })

  it('accepts a real WEBP declared as image/webp with a .webp extension', () => {
    expect(validateFileSignature({ fileName: 'scan.webp', declaredMimeType: 'image/webp', headerBytes: WEBP_HEADER })).toEqual({ ok: true })
  })

  // --- Content-spoofing matrix (adversarial addendum, item 6) ---

  it('rejects an executable (MZ header) renamed .pdf', () => {
    const r = validateFileSignature({ fileName: 'invoice.pdf', declaredMimeType: 'application/pdf', headerBytes: EXE_HEADER })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/executable/i)
  })

  it('rejects an HTML file renamed .pdf', () => {
    const r = validateFileSignature({ fileName: 'letter.pdf', declaredMimeType: 'application/pdf', headerBytes: HTML_HEADER })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/HTML/i)
  })

  it('rejects an SVG file renamed .png', () => {
    const r = validateFileSignature({ fileName: 'photo.png', declaredMimeType: 'image/png', headerBytes: SVG_HEADER })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/SVG/i)
  })

  it('rejects a JS/plain-text file renamed .jpg', () => {
    const r = validateFileSignature({ fileName: 'photo.jpg', declaredMimeType: 'image/jpeg', headerBytes: SCRIPT_HEADER })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/does not match any supported/i)
  })

  it('rejects real PDF bytes declared as image/jpeg', () => {
    const r = validateFileSignature({ fileName: 'file.jpg', declaredMimeType: 'image/jpeg', headerBytes: PDF_HEADER })
    expect(r.ok).toBe(false)
  })

  it('rejects real JPEG bytes declared as application/pdf', () => {
    const r = validateFileSignature({ fileName: 'file.pdf', declaredMimeType: 'application/pdf', headerBytes: JPEG_HEADER })
    expect(r.ok).toBe(false)
  })

  it('rejects real PNG bytes named .jpg (even with a consistent image/jpeg MIME claim)', () => {
    const r = validateFileSignature({ fileName: 'photo.jpg', declaredMimeType: 'image/jpeg', headerBytes: PNG_HEADER })
    expect(r.ok).toBe(false)
  })

  it('rejects real WEBP bytes with an incorrect declared MIME type', () => {
    const r = validateFileSignature({ fileName: 'photo.webp', declaredMimeType: 'image/png', headerBytes: WEBP_HEADER })
    expect(r.ok).toBe(false)
  })

  it('rejects a valid (PDF) signature paired with a disallowed extension', () => {
    const r = validateFileSignature({ fileName: 'document.exe', declaredMimeType: 'application/pdf', headerBytes: PDF_HEADER })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/extension/i)
  })

  it('rejects an allowed extension (.pdf) with an invalid/garbage signature', () => {
    const r = validateFileSignature({ fileName: 'document.pdf', declaredMimeType: 'application/pdf', headerBytes: bytes(1, 2, 3, 4, 5, 6, 7, 8) })
    expect(r.ok).toBe(false)
  })

  it('rejects a declared MIME type outside the allowed 4', () => {
    const r = validateFileSignature({ fileName: 'archive.zip', declaredMimeType: 'application/zip', headerBytes: bytes(0x50, 0x4b, 0x03, 0x04) })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/Unsupported file type/i)
  })

  it('rejects a mismatched extension/MIME pair even before checking content (e.g. .png file declared image/jpeg)', () => {
    const r = validateFileSignature({ fileName: 'photo.png', declaredMimeType: 'image/jpeg', headerBytes: JPEG_HEADER })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/extension/i)
  })
})

describe('validateFileSize', () => {
  it('rejects an empty (0-byte) file', () => {
    expect(validateFileSize(0)).toEqual({ ok: false, error: 'This file is empty.' })
  })

  it('accepts a normal, well within-limit file', () => {
    expect(validateFileSize(1024 * 1024)).toEqual({ ok: true })
  })

  it('accepts a file exactly at the 15MB limit', () => {
    expect(validateFileSize(SECURE_LINK_MAX_FILE_BYTES)).toEqual({ ok: true })
  })

  it('rejects a file one byte over the 15MB limit', () => {
    const r = validateFileSize(SECURE_LINK_MAX_FILE_BYTES + 1)
    expect(r.ok).toBe(false)
  })
})

describe('constants mirror lib/intelligence/document-store.ts exactly (anti-drift guard)', () => {
  it('SECURE_LINK_ALLOWED_MIME_TYPES === INTEL_ALLOWED_TYPES', () => {
    expect([...SECURE_LINK_ALLOWED_MIME_TYPES]).toEqual(INTEL_ALLOWED_TYPES)
  })

  it('SECURE_LINK_MAX_FILE_BYTES === INTEL_MAX_BYTES', () => {
    expect(SECURE_LINK_MAX_FILE_BYTES).toBe(INTEL_MAX_BYTES)
  })

  it('SECURE_LINK_MAX_FILES is a positive integer new to this surface (no domain counterpart to mirror)', () => {
    expect(Number.isInteger(SECURE_LINK_MAX_FILES)).toBe(true)
    expect(SECURE_LINK_MAX_FILES).toBeGreaterThan(0)
  })
})
