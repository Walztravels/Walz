/**
 * WhatsApp Broadcast V1.1 — manual WhatsApp number entry.
 *
 * Pure. No Prisma, no env, no I/O — so every rule here is unit-testable and
 * so the SERVER can run exactly the same parse the browser previewed,
 * without trusting a single thing the browser concluded.
 *
 * ── WHAT A MANUAL ENTRY IS NOT ──────────────────────────────────────────
 * A manual number does NOT create a Lead, does NOT create a
 * WhatsAppConsent row, and does NOT get a synthetic record of any kind
 * minted to "fit" the pipeline. It is its own provenance type
 * (sourceType 'MANUAL') carried straight through to the snapshot.
 *
 * A manual number is checked against the REAL whatsapp_consents table by
 * normalized number, exactly like a Lead- or VisaApplication-sourced
 * recipient. If a row happens to exist and is SUBSCRIBED, the number is
 * eligible; if not, it is NO_CONSENT. There is no special case, no
 * allowlist, no "the staff member typed it so they must know" shortcut.
 *
 * ── NORMALIZATION IS NOT REIMPLEMENTED HERE ─────────────────────────────
 * This module delegates to `normalizePhoneE164` from lib/identity/normalize
 * — the codebase's single existing phone normalizer, already used by the
 * V1 resolver, the Inbox identity layer and the conversation→client
 * resolver. A second, differently-behaved normalizer would mean the same
 * human's number could canonicalize two ways and defeat the whole
 * dedup-by-number guarantee.
 */

import { normalizePhoneE164 } from '@/lib/identity/normalize'

/** A raw entry as typed/pasted, before any server-side validation. */
export interface ManualNumberInput {
  number: string
  displayName?: string | null
}

/** One accepted, normalized manual recipient. */
export interface ManualNumberValid {
  /** Exactly as the staff member typed it — kept for the error/report UI. */
  raw: string
  normalizedNumber: string
  displayName: string | null
}

/** One rejected entry, with a reason a human can act on. */
export interface ManualNumberRejected {
  raw: string
  reason: string
}

/** One entry that normalized to a number already present in this batch. */
export interface ManualNumberDuplicate {
  raw: string
  normalizedNumber: string
  /** The raw text of the first entry that claimed this number. */
  firstSeenAs: string
}

export interface ManualNumberParseResult {
  valid: ManualNumberValid[]
  invalid: ManualNumberRejected[]
  /** Duplicates WITHIN this manual batch. Cross-source dedup happens later. */
  duplicates: ManualNumberDuplicate[]
  /** Every entry examined — valid + invalid + duplicates. */
  totalEntries: number
}

/** Hard cap on one paste, so a runaway paste cannot become a 50k-row scan. */
export const MAX_MANUAL_ENTRIES = 1000

/** Display names are stored and shown; keep them short and single-line. */
export const MAX_DISPLAY_NAME_LENGTH = 80

/**
 * Split a pasted blob into individual entries.
 *
 * Accepts newlines, commas, semicolons and tabs as separators — the four
 * things a spreadsheet, a CRM export or a hand-typed list actually
 * produce. A '+' is never treated as a separator.
 *
 * An entry may carry an optional display name after a pipe or a colon:
 *   "+2348012345678 | Ada Obi"
 *   "+233201234567: Kwame"
 * Anything else is treated as the whole entry being the number.
 */
export function splitManualNumberBlob(blob: string): ManualNumberInput[] {
  if (typeof blob !== 'string' || !blob.trim()) return []
  return blob
    .split(/[\n\r,;\t]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(piece => {
      const m = piece.match(/^(.*?)\s*[|:]\s*(.+)$/)
      if (m && m[1].trim()) return { number: m[1].trim(), displayName: m[2].trim() }
      return { number: piece, displayName: null }
    })
}

function cleanDisplayName(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const collapsed = raw.replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!collapsed) return null
  return collapsed.slice(0, MAX_DISPLAY_NAME_LENGTH)
}

/**
 * Validate and normalize a batch of manual entries, SERVER-SIDE.
 *
 * Every entry is reported in exactly one bucket, so `valid.length +
 * invalid.length + duplicates.length === totalEntries` always holds and
 * the UI can show a complete, reconcilable account of a paste.
 *
 * Rejection reasons are written for the staff member, not for a log.
 */
export function parseManualNumbers(entries: ManualNumberInput[]): ManualNumberParseResult {
  const valid: ManualNumberValid[] = []
  const invalid: ManualNumberRejected[] = []
  const duplicates: ManualNumberDuplicate[] = []
  const firstSeen = new Map<string, string>()

  const capped = entries.slice(0, MAX_MANUAL_ENTRIES)
  for (const over of entries.slice(MAX_MANUAL_ENTRIES)) {
    invalid.push({
      raw: String(over?.number ?? ''),
      reason: `Only the first ${MAX_MANUAL_ENTRIES} numbers in one batch are accepted.`,
    })
  }

  for (const entry of capped) {
    const raw = typeof entry?.number === 'string' ? entry.number.trim() : ''
    if (!raw) {
      invalid.push({ raw: '', reason: 'Empty entry.' })
      continue
    }

    const normalized = normalizePhoneE164(raw)
    if (!normalized) {
      invalid.push({ raw, reason: manualRejectionReason(raw) })
      continue
    }

    const already = firstSeen.get(normalized)
    if (already !== undefined) {
      duplicates.push({ raw, normalizedNumber: normalized, firstSeenAs: already })
      continue
    }

    firstSeen.set(normalized, raw)
    valid.push({ raw, normalizedNumber: normalized, displayName: cleanDisplayName(entry.displayName) })
  }

  return { valid, invalid, duplicates, totalEntries: entries.length }
}

/**
 * Explain, in the staff member's terms, why normalizePhoneE164 said no.
 *
 * Mirrors that function's documented rules rather than guessing: it is the
 * authority on acceptance, this is only the wording.
 */
export function manualRejectionReason(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 'No digits — this is not a phone number.'
  const hadPlus = raw.trim().startsWith('+')
  const body = !hadPlus && digits.startsWith('00') ? digits.slice(2) : digits
  if (body.startsWith('0')) {
    return 'Local format (starts with 0). Use the full international form, e.g. +2348012345678.'
  }
  if (body.length < 8) return 'Too short to be a dialable international number.'
  if (body.length > 15) return 'Too long — a phone number has at most 15 digits.'
  return 'Not a valid WhatsApp number in international (E.164) format.'
}

/**
 * Narrow an untrusted JSON blob from the browser into manual entries.
 *
 * Accepts either a list of objects or a single pasted string, because the
 * UI offers both. Nothing here trusts a client-side "valid" flag — there
 * is no such field in the accepted shape, by design.
 */
export function parseManualEntriesPayload(raw: unknown): ManualNumberInput[] {
  if (typeof raw === 'string') return splitManualNumberBlob(raw)
  if (!Array.isArray(raw)) return []
  const out: ManualNumberInput[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push(...splitManualNumberBlob(item))
      continue
    }
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.number !== 'string') continue
    out.push({
      number: o.number,
      displayName: typeof o.displayName === 'string' ? o.displayName : null,
    })
  }
  return out
}
