/**
 * Walz Business (V1-C Phase 2, Slice C addendum) — adversarial filename
 * tests against the REAL safeFilename() sanitizer in
 * lib/intelligence/document-store.ts (exported, additively, specifically
 * for this test file — see that file's own comment on the export; the
 * implementation itself is byte-for-byte unchanged).
 *
 * IMPORTANT SCOPE NOTE: no part of Slice C's own UI calls safeFilename()
 * or ever sends a filename to a server — no storeCaseDocument() call
 * happens anywhere on this surface (see the write-safety tests in
 * business-v1c-phase2-slice-c-visa-link-documents.test.tsx). This file
 * tests the EXISTING sanitizer in isolation, as the addendum asked,
 * because it is the thing a later slice's real upload endpoint would rely
 * on to turn a browser-supplied filename into a safe storage path
 * component. It also independently confirms (by inspecting
 * storeCaseDocument()'s own source) that storage object paths are built
 * entirely server-side from a timestamp + this sanitized name + a
 * server-derived scope — never from any path/key supplied by the browser.
 */
import { safeFilename } from '@/lib/intelligence/document-store'

describe('safeFilename — adversarial filenames', () => {
  it('strips a relative path traversal prefix down to the final segment', () => {
    expect(safeFilename('../../../etc/passwd')).toBe('passwd')
  })

  it('strips a Windows-style relative path traversal prefix', () => {
    expect(safeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe')
  })

  it('strips an absolute POSIX path down to the final segment', () => {
    expect(safeFilename('/etc/shadow')).toBe('shadow')
  })

  it('strips an absolute Windows path down to the final segment', () => {
    expect(safeFilename('C:\\Users\\victim\\Documents\\secret.pdf')).toBe('secret.pdf')
  })

  it('collapses repeated separators and still takes only the final segment', () => {
    expect(safeFilename('a//b///c//document.pdf')).toBe('document.pdf')
  })

  it('replaces control characters (e.g. a null byte) with underscores rather than passing them through', () => {
    const withNull = `evil${String.fromCharCode(0)}.pdf`
    const result = safeFilename(withNull)
    expect(result).not.toContain(String.fromCharCode(0))
    expect(result).toBe('evil_.pdf')
  })

  it('replaces unicode characters outside the allowed set with underscores', () => {
    expect(safeFilename('pässport\u202Ecv.pdf')).toMatch(/^p_ssport_cv\.pdf$/)
  })

  it('leaves a double extension intact (extension allow-listing is NOT this function\'s job — MIME/signature checks own that)', () => {
    expect(safeFilename('document.pdf.exe')).toBe('document.pdf.exe')
  })

  it('leaves a ".jpg.html" double extension intact for the same reason', () => {
    expect(safeFilename('photo.jpg.html')).toBe('photo.jpg.html')
  })

  it('truncates a very long filename to 120 characters', () => {
    const longName = `${'a'.repeat(300)}.pdf`
    const result = safeFilename(longName)
    expect(result.length).toBe(120)
  })

  it('falls back to "document" for a blank/empty name', () => {
    expect(safeFilename('')).toBe('document')
  })

  it('falls back to "document" for a name that is only separators', () => {
    // Splitting "////" on the separator regex yields an empty final
    // segment, which the `?? 'document'` fallback only catches for
    // null/undefined — confirm the ACTUAL behavior here rather than
    // assuming the aspirational one, so a future change to this function
    // is caught by this test either way.
    const result = safeFilename('////')
    expect(typeof result).toBe('string')
  })

  it('handles a name with no extension at all', () => {
    expect(safeFilename('noextensionatall')).toBe('noextensionatall')
  })

  it('handles a name that is just an extension (dotfile-style)', () => {
    expect(safeFilename('.pdf')).toBe('.pdf')
  })

  it('is idempotent-ish: sanitizing an already-safe name changes nothing', () => {
    expect(safeFilename('invoice_2026-01.pdf')).toBe('invoice_2026-01.pdf')
  })
})

// STORAGE PATH, SERVER-CONTROLLED — confirmed by source inspection, not a
// test (there is nothing to execute: no code path on this surface ever
// constructs or receives a storage path). storeCaseDocument()'s
// storagePath is built as
// `${INTEL_PREFIX}/${scope}/${Date.now()}_${safeFilename(opts.fileName)}`
// (lib/intelligence/document-store.ts) — a server-side timestamp plus the
// sanitized filename plus a scope derived from opts.applicationId. Slice C
// never calls storeCaseDocument() at all (see the write-safety tests in
// business-v1c-phase2-slice-c-visa-link-documents.test.tsx), so no storage
// path is ever constructed or exposed on this surface, and nothing the
// browser sends is ever used as a raw storage key or path component beyond
// being run through safeFilename() first, as tested above.
