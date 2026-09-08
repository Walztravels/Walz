/**
 * Formatting helpers for stored job-description text (Release: careers SEO).
 *
 * Job responsibilities/requirements/benefits arrive as plain text. Staff
 * write them either one-bullet-per-line or (legacy) as a single paragraph
 * with inline "•" separators. These helpers turn that text into semantic
 * paragraph/list blocks that the page renders as real <ul>/<li> elements —
 * exact text preserved, no raw HTML anywhere.
 */

export interface TextBlock { kind: 'p' | 'ul'; items: string[] }

/**
 * Splits a stored description block into paragraphs and bullet lists.
 * - Lines starting with a bullet marker (•, -, –, *) become list items.
 * - Legacy single paragraphs holding several " • "-separated items are
 *   split on the bullet character only — never on ordinary punctuation —
 *   so normal sentences and abbreviations are left intact.
 */
export function parseBulletBlocks(body: string): TextBlock[] {
  const blocks: TextBlock[] = []
  const push = (kind: 'p' | 'ul', item: string) => {
    const text = item.trim()
    if (!text) return
    const last = blocks[blocks.length - 1]
    if (last && last.kind === 'ul' && kind === 'ul') last.items.push(text)
    else blocks.push({ kind, items: [text] })
  }
  for (const rawLine of (body || '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const leadingBullet = line.match(/^[•\-–*]\s+(.*)$/)
    if (leadingBullet) {
      // A leading-bullet line may still carry inline "•" separators
      for (const part of leadingBullet[1].split(/\s+•\s+/)) push('ul', part)
      continue
    }
    const inlineParts = line.split(/\s+•\s+/)
    if (inlineParts.length >= 2) {
      // Legacy: one paragraph holding several " • "-separated items
      for (const part of inlineParts) push('ul', part)
    } else {
      push('p', line)
    }
  }
  return blocks
}
