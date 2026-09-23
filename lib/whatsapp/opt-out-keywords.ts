/**
 * WhatsApp Broadcast V1.2 — inbound opt-out keyword matching.
 *
 * Pure. No Prisma, no env, no I/O — so the exact matching rule can be
 * pinned in a unit test independent of the webhook plumbing.
 *
 * MATCHES THE WHOLE MESSAGE, case-insensitively, after trimming
 * surrounding whitespace — not a substring search. "please stop sending
 * me these" must NOT match (a real, on-topic message that happens to
 * contain the word "stop" is not an opt-out command), but "Stop" / "STOP "
 * / "unsubscribe" must. This mirrors the industry-standard SMS/WhatsApp
 * keyword convention (a dedicated, exact-word command) rather than a loose
 * substring match that would misfire on ordinary conversation.
 */
const OPT_OUT_KEYWORDS = new Set(['stop', 'unsubscribe'])

export function isOptOutKeyword(rawText: string | null | undefined): boolean {
  if (typeof rawText !== 'string') return false
  const normalized = rawText.trim().toLowerCase()
  return OPT_OUT_KEYWORDS.has(normalized)
}
