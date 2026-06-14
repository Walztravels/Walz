// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

export interface PdfExtractionResult {
  text: string
  pageCount: number
  isLikelyScanned: boolean
  charCount: number
}

export async function extractPdfText(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
  const data = await pdfParse(pdfBuffer, { max: 50 })

  const text = data.text ?? ''
  const charCount = text.replace(/\s/g, '').length
  const pageCount = data.numpages ?? 1
  const charsPerPage = charCount / Math.max(pageCount, 1)

  // Fewer than 100 non-whitespace chars per page = likely a scanned image PDF
  const isLikelyScanned = charsPerPage < 100

  return { text, pageCount, isLikelyScanned, charCount }
}
