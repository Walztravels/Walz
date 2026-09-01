/**
 * Walz Orbit Composer — auto-fit typography.
 *
 * Shrinks font size to fit text within a box.
 * The `measure` parameter makes this test-friendly (pass a mock in node).
 * In the browser, pass a bound canvas ctx.measureText.
 */

export interface AutoFitInput {
  text:        string
  boxWidth:    number   // px
  boxHeight:   number   // px
  maxFontSize: number
  minFontSize: number
  maxLines?:   number   // default 10
  fontFamily?: string
  fontWeight?: string
  lineHeight?: number   // multiplier, default 1.25
}

export interface AutoFitResult {
  fontSize: number
  lines:    string[]
  overflow: boolean   // true if text still does not fit at minFontSize
}

/** Measure text width at a given font size and font spec. */
export type MeasureFn = (text: string, fontSize: number, fontSpec: string) => number

/**
 * Word-wraps `text` into lines given a font size and max width.
 * Returns the line array.
 */
function wrapText(
  text:      string,
  maxWidth:  number,
  fontSize:  number,
  fontSpec:  string,
  measure:   MeasureFn,
): string[] {
  const words = text.split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word
    if (measure(attempt, fontSize, fontSpec) <= maxWidth) {
      current = attempt
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Anti-widow pass: if the last line has only one word and there are
 * 3+ lines, move the second-to-last word down to reduce visual orphan.
 * Returns a new line array — safe to call on empty input.
 */
function avoidWidow(lines: string[]): string[] {
  if (lines.length < 3) return lines
  const last = lines[lines.length - 1]
  const lastWords = last.split(' ').filter(Boolean)
  if (lastWords.length !== 1) return lines

  const penultimate = lines[lines.length - 2]
  const penWords    = penultimate.split(' ').filter(Boolean)
  if (penWords.length < 2) return lines

  const movedWord   = penWords[penWords.length - 1]
  const newPen      = penWords.slice(0, -1).join(' ')
  const newLast     = `${movedWord} ${last}`

  return [
    ...lines.slice(0, -2),
    newPen,
    newLast,
  ]
}

/**
 * Auto-fit text to a box using binary search on font size.
 * Caller must provide a `measure` function — e.g. a bound ctx.measureText call.
 */
export function autoFitText(input: AutoFitInput, measure: MeasureFn): AutoFitResult {
  const {
    text,
    boxWidth,
    boxHeight,
    maxFontSize,
    minFontSize,
    maxLines = 10,
    fontFamily = 'Arial, sans-serif',
    fontWeight = '800',
    lineHeight = 1.25,
  } = input

  const fontSpec = `${fontWeight} %sPX ${fontFamily}`

  let lo  = minFontSize
  let hi  = maxFontSize
  let bestSize  = minFontSize
  let bestLines = wrapText(text, boxWidth, minFontSize, fontSpec, measure)

  // Binary search: largest size that fits
  for (let iter = 0; iter < 20; iter++) {
    if (lo > hi) break
    const mid = Math.floor((lo + hi) / 2)
    const lines = wrapText(text, boxWidth, mid, fontSpec, measure)
    const totalHeight = lines.length * mid * lineHeight
    if (lines.length <= maxLines && totalHeight <= boxHeight) {
      bestSize  = mid
      bestLines = lines
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  // Anti-widow pass on the final line set
  bestLines = avoidWidow(bestLines)

  const totalHeight    = bestLines.length * bestSize * lineHeight
  const anyLineToWide  = bestLines.some(l => measure(l, bestSize, fontSpec) > boxWidth)
  const overflow       = bestLines.length > maxLines || totalHeight > boxHeight || anyLineToWide

  return { fontSize: bestSize, lines: bestLines, overflow }
}

/**
 * Simple character-width estimator for server/test environments.
 * Returns an approximate pixel width for the text at the given font size.
 * (Uses average character width ≈ 0.55 × fontSize for sans-serif at weight 800.)
 */
export function estimateMeasure(text: string, fontSize: number, _fontSpec: string): number {
  return text.length * fontSize * 0.55
}
