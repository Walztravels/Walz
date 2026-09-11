/**
 * Server-side PDF text extraction (pdf-parse v2 / pdfjs).
 *
 * Two production defects lived here (incident 2026-09-11, AI screening
 * 500s on every request):
 *
 *  1. A TOP-LEVEL `require('pdf-parse')` crashed the module graph of every
 *     importing API route at load time on Vercel: pdf-parse v2 needs
 *     @napi-rs/canvas for DOM polyfills, the lambda bundle doesn't include
 *     it, and the package then references `DOMMatrix` unconditionally →
 *     `ReferenceError: DOMMatrix is not defined` before any handler ran.
 *     The library is now loaded LAZILY inside the function, after
 *     installing minimal DOM stubs — text extraction never renders, so
 *     identity stubs are sufficient (verified against the real package
 *     with @napi-rs/canvas removed).
 *
 *  2. The old code called the module as a function (`pdfParse(buf)`) —
 *     pdf-parse v2 exports a `PDFParse` class instead, so extraction could
 *     never have succeeded even when the module loaded.
 *
 * Failures throw PdfExtractionError so callers can surface a typed,
 * user-safe CV_TEXT_EXTRACTION_FAILED instead of a crash.
 */

export class PdfExtractionError extends Error {
  readonly code = 'CV_TEXT_EXTRACTION_FAILED'
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'PdfExtractionError'
  }
}

export interface PdfExtractionResult {
  text: string
  pageCount: number
  isLikelyScanned: boolean
  charCount: number
}

interface PdfParseModule {
  PDFParse: new (opts: { data: Uint8Array }) => {
    getText: (opts?: { last?: number }) => Promise<{ text?: string; total?: number }>
    destroy?: () => Promise<void>
  }
}

/** pdfjs references these browser globals at init when @napi-rs/canvas is
 *  unavailable (as on the Vercel lambda). getText() never renders, so
 *  minimal stubs are safe — they exist only so module init succeeds. */
function installDomStubs(): void {
  const g = globalThis as Record<string, unknown>
  g.DOMMatrix ??= class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
  }
  g.ImageData ??= class ImageData {
    width: number; height: number; data: Uint8ClampedArray
    constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(0) }
  }
  g.Path2D ??= class Path2D {
    addPath() {} moveTo() {} lineTo() {} closePath() {}
  }
}

let cachedModule: PdfParseModule | null = null

/** Lazy, cached loader — never runs at route module load. Exposed so other
 *  PDF consumers (bank analyser) share the same safe path. */
export async function loadPdfParse(): Promise<PdfParseModule> {
  if (cachedModule) return cachedModule
  installDomStubs()
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('pdf-parse') as PdfParseModule
    if (typeof mod?.PDFParse !== 'function') {
      throw new Error('pdf-parse loaded but PDFParse export is missing')
    }
    cachedModule = mod
    return mod
  } catch (err) {
    throw new PdfExtractionError(
      'PDF parser could not be loaded on this server',
      err,
    )
  }
}

export async function extractPdfText(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
  const { PDFParse } = await loadPdfParse()
  try {
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) })
    // last: 50 caps work on huge documents, mirroring the old {max: 50}
    const data = await parser.getText({ last: 50 })
    await parser.destroy?.().catch(() => {})

    const text = data.text ?? ''
    const charCount = text.replace(/\s/g, '').length
    const pageCount = data.total ?? 1
    const charsPerPage = charCount / Math.max(pageCount, 1)

    // Fewer than 100 non-whitespace chars per page = likely a scanned image PDF
    const isLikelyScanned = charsPerPage < 100

    return { text, pageCount, isLikelyScanned, charCount }
  } catch (err) {
    if (err instanceof PdfExtractionError) throw err
    throw new PdfExtractionError(
      err instanceof Error ? `PDF could not be parsed: ${err.message.slice(0, 200)}` : 'PDF could not be parsed',
      err,
    )
  }
}
