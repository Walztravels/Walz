import { Fragment, ReactNode } from 'react'

/**
 * UX-2 polish — safe display formatting for message bodies.
 *
 * The customer Jade bot writes Markdown (**bold**, *italic*); Chatwoot renders
 * it, our bubbles showed the raw markers. This module supports ONLY:
 *   **bold**, *italic*, _italic_ — plus \n line breaks, which the bubble
 * preserves via whitespace-pre-wrap (text tokens keep their newlines).
 *
 * Security contract: React elements ONLY — string splitting into
 * <strong>/<em>/text nodes. ABSOLUTELY NO dangerouslySetInnerHTML and no HTML
 * parsing: any HTML in content stays visibly escaped text (React default).
 * No link auto-detection. Pure display — the stored content is never mutated.
 */

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }

// Bold pass first: **...** spans win, and their inner text is rendered
// literally (nested markers degrade gracefully — no recursive parsing).
// Dot does not match \n, so markers never span line breaks.
const BOLD_RE = /\*\*([^\r]+?)\*\*/g
// Italic pass over the remaining text: *...* or _..._ with no marker
// character or newline inside. Unclosed markers simply stay literal text.
const ITALIC_RE = /\*([^*\r\n]+)\*|(?<![\w])_([^_\r\n]+)_(?![\w])/g

function pushItalics(tokens: InlineToken[], text: string): void {
  let last = 0
  ITALIC_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ITALIC_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', content: text.slice(last, m.index) })
    tokens.push({ type: 'italic', content: (m[1] ?? m[2])! })
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push({ type: 'text', content: text.slice(last) })
}

/** Pure token splitter — exported for unit tests. Never mutates its input. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  BOLD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BOLD_RE.exec(text)) !== null) {
    if (m.index > last) pushItalics(tokens, text.slice(last, m.index))
    tokens.push({ type: 'bold', content: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) pushItalics(tokens, text.slice(last))
  return tokens
}

/** Render a message body as React nodes — see the security contract above. */
export function formatMessageText(text: string): ReactNode {
  if (!text) return text
  const tokens = tokenizeInline(text)
  // Fast path: nothing to format — hand React the plain string.
  if (tokens.length === 1 && tokens[0].type === 'text') return text
  return tokens.map((t, i) => {
    if (t.type === 'bold') return <strong key={i} className="font-semibold">{t.content}</strong>
    if (t.type === 'italic') return <em key={i}>{t.content}</em>
    return <Fragment key={i}>{t.content}</Fragment>
  })
}
