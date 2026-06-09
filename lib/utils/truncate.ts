/**
 * Truncates `text` at the last word boundary before `maxLength`,
 * appending "…" if truncation occurs.
 */
export function truncateAtWord(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  const truncated = text.substring(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace === -1) return truncated + '...'
  return truncated.substring(0, lastSpace) + '...'
}
