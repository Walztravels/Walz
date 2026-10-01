import { Fragment, ReactNode } from 'react'

/**
 * Jade Customer Experience Polish — safe markdown renderer for Ask Jade
 * assistant messages.
 *
 * Replaces the previous PortalJadeChat.tsx `renderMarkdown()` helper, which
 * built an HTML string via 4 regex passes and injected it with
 * `dangerouslySetInnerHTML`. That approach (a) left `#` headings, `-`/`1.`
 * lists, and `` ` `` inline code completely unhandled — those characters
 * leaked to the user literally — and (b) had no sanitization step between
 * the regex substitutions and the raw-HTML sink, relying entirely on an
 * unenforced assumption that backend-returned text could never contain
 * executable markup.
 *
 * Security contract (modeled on, and extending, the React-element-tokenizer
 * pattern already used in production at
 * app/admin/inbox/components/formatMessageText.tsx):
 *   - React elements ONLY. No dangerouslySetInnerHTML, no HTML parser, no
 *     HTML string ever touches the DOM. Any literal `<`, `>`, `&`, or quote
 *     characters in the input are rendered as inert text content — this is
 *     an inherent property of React's text-node rendering, not something
 *     this module has to implement itself.
 *   - Markdown link targets are passed through an explicit scheme
 *     allowlist (http:, https:, mailto:, or a relative path). Anything
 *     else — javascript:, data:, vbscript:, or a scheme hidden behind
 *     whitespace/control characters — is rejected and the link's visible
 *     text is rendered as plain text instead of a clickable anchor.
 *   - Jade's backend-generated reply text is always treated as untrusted
 *     DATA to be parsed for display, never as trusted HTML or as
 *     instructions to this renderer.
 *
 * Supports: paragraphs, headings (`#`..`######`), bold/italic emphasis,
 * `inline code`, [text](url) links, unordered lists (`-`/`+`),
 * ordered lists (`1.`), and line breaks. This is a small, purpose-built
 * subset for chat-bubble display — not a general-purpose Markdown parser
 * (no tables, blockquotes, nested lists, or fenced code blocks).
 */

// ─── Safe link-scheme allowlist ─────────────────────────────────────────────

const SAFE_LINK_RE = /^(https?:|mailto:|\/)/i

function isSafeHref(href: string): boolean {
  const trimmed = href.trim()
  // Reject embedded whitespace/control characters first — a scheme check
  // alone can be defeated by something like "java\tscript:alert(1)", which
  // some browsers still interpret as javascript: after stripping tabs/newlines.
  if (/[\s\u0000-\u001f]/.test(trimmed)) return false
  return SAFE_LINK_RE.test(trimmed)
}

// ─── Inline tokenizer ────────────────────────────────────────────────────────
// Precedence, each pass only recursing into the text it did NOT claim:
// inline code first (contents never re-parsed), then links, then bold,
// then italic. A link's visible text is treated as literal — it is not
// itself re-parsed for bold/italic, keeping this simple and predictable.

type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; href: string }

const CODE_RE = /`([^`\r\n]+)`/g
const LINK_RE = /\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g
const BOLD_RE = /\*\*([^\r\n]+?)\*\*/g
// eslint-disable-next-line no-useless-escape
const ITALIC_RE = /\*([^*\r\n]+)\*|(?<![\w])_([^_\r\n]+)_(?![\w])/g

function tokenizeItalic(text: string, out: InlineToken[]): void {
  let last = 0
  ITALIC_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ITALIC_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', content: text.slice(last, m.index) })
    out.push({ type: 'italic', content: (m[1] ?? m[2])! })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', content: text.slice(last) })
}

function tokenizeBold(text: string, out: InlineToken[]): void {
  let last = 0
  BOLD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BOLD_RE.exec(text)) !== null) {
    if (m.index > last) tokenizeItalic(text.slice(last, m.index), out)
    out.push({ type: 'bold', content: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) tokenizeItalic(text.slice(last), out)
}

function tokenizeLinks(text: string, out: InlineToken[]): void {
  let last = 0
  LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) tokenizeBold(text.slice(last, m.index), out)
    out.push({ type: 'link', text: m[1], href: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) tokenizeBold(text.slice(last), out)
}

/** Pure inline tokenizer — exported for unit tests. Never mutates input. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  CODE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CODE_RE.exec(text)) !== null) {
    if (m.index > last) tokenizeLinks(text.slice(last, m.index), tokens)
    tokens.push({ type: 'code', content: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) tokenizeLinks(text.slice(last), tokens)
  return tokens
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(text).map((t, i) => {
    const key = `${keyPrefix}-${i}`
    switch (t.type) {
      case 'bold':
        return <strong key={key} className="font-semibold">{t.content}</strong>
      case 'italic':
        return <em key={key}>{t.content}</em>
      case 'code':
        return (
          <code key={key} className="px-1 py-0.5 rounded bg-black/20 text-[0.85em] font-mono">
            {t.content}
          </code>
        )
      case 'link':
        // Unsafe scheme (javascript:, data:, vbscript:, or an obfuscated
        // variant) — render the link's visible text as plain text, never
        // as a clickable/executable anchor.
        if (!isSafeHref(t.href)) return <Fragment key={key}>{t.text}</Fragment>
        return (
          <a
            key={key}
            href={t.href}
            className="text-[#C9A84C] underline hover:text-[#b8943d]"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.text}
          </a>
        )
      default:
        return <Fragment key={key}>{t.content}</Fragment>
    }
  })
}

// ─── Block-level parser ──────────────────────────────────────────────────────

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'paragraph'; lines: string[] }

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const UL_RE = /^[-*+]\s+(.*)$/
const OL_RE = /^\d+\.\s+(.*)$/

/** Pure block parser — exported for unit tests. Never mutates input. */
export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') { i++; continue }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }

    const ul = UL_RE.exec(line)
    if (ul) {
      const items = [ul[1]]
      i++
      while (i < lines.length) {
        const m = UL_RE.exec(lines[i])
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const ol = OL_RE.exec(line)
    if (ol) {
      const items = [ol[1]]
      i++
      while (i < lines.length) {
        const m = OL_RE.exec(lines[i])
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const paraLines = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', lines: paraLines })
  }

  return blocks
}

function headingClassName(level: number): string {
  // De-escalated for a chat-bubble context — not rendered as real <h1>-<h6>
  // elements (a conversation full of assistant messages scattering real
  // heading tags through the page's outline would be worse for a11y than
  // helpful), just styled to read as a heading within the bubble.
  return level <= 2
    ? 'text-[0.95rem] font-bold mt-2 mb-1 first:mt-0'
    : 'text-sm font-semibold mt-2 mb-1 first:mt-0'
}

/**
 * Render Jade assistant message content as safe React elements. See the
 * module header for the full security contract.
 */
export default function JadeMessageContent({ text }: { text: string }) {
  if (!text) return null
  const blocks = parseBlocks(text)

  return (
    <>
      {blocks.map((block, bi) => {
        const key = `b${bi}`

        if (block.type === 'heading') {
          return (
            <p key={key} className={headingClassName(block.level)}>
              {renderInline(block.text, key)}
            </p>
          )
        }

        if (block.type === 'ul') {
          return (
            <ul key={key} className="list-disc pl-5 my-1 space-y-0.5">
              {block.items.map((item, ii) => (
                <li key={`${key}-${ii}`}>{renderInline(item, `${key}-${ii}`)}</li>
              ))}
            </ul>
          )
        }

        if (block.type === 'ol') {
          return (
            <ol key={key} className="list-decimal pl-5 my-1 space-y-0.5">
              {block.items.map((item, ii) => (
                <li key={`${key}-${ii}`}>{renderInline(item, `${key}-${ii}`)}</li>
              ))}
            </ol>
          )
        }

        return (
          <p key={key} className={bi > 0 ? 'mt-2' : undefined}>
            {block.lines.map((line, li) => (
              <Fragment key={`${key}-${li}`}>
                {li > 0 && <br />}
                {renderInline(line, `${key}-${li}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
