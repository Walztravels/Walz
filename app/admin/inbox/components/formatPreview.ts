/**
 * INBOX UX-3 — one-line preview text for a conversation card.
 *
 * Pure function: last message in → plain display string out. Never parses or
 * executes HTML — the output is a plain string and React escapes it on render.
 *
 * Performance note: this is a cheap pure string op — two single-pass
 * character-class replaces (no backtracking) plus a trim — so it is safe to
 * call per row per render without memoization.
 */

export interface PreviewAttachment {
  file_type: string
  file_name?: string
}

export interface PreviewMessage {
  content?: string | null
  attachments?: PreviewAttachment[]
}

const ATTACHMENT_LABELS: Record<string, string> = {
  image: '📷 Image',
  audio: '🎙 Voice message',
  video: '🎞 Video',
}

export function formatPreview(message?: PreviewMessage | null): string {
  const text = (message?.content ?? '')
    .replace(/\*/g, '').replace(/(?<![\w])_|_(?![\w])/g, '') // markdown emphasis markers: **, *, _
    .replace(/\s+/g, ' ') // newlines + whitespace runs → single spaces
    .trim()
  if (text) return text.slice(0, 140)   // defensive cap; CSS truncate is the visual clamp
  const att = message?.attachments?.[0]
  if (att) return ATTACHMENT_LABELS[att.file_type] ?? `📎 ${att.file_name ?? 'Document'}`
  return '—'
}
