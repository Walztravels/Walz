/**
 * Orbit Creative OS — Commercial Fact Lock.
 *
 * AI never authors: price, route, date, deposit, salary, visa outcome,
 * processing time, booking/supplier confirmation, discount, contact details.
 * These come from deterministic Walz data (staff-entered commercialFields,
 * BUSINESS config) and must be IDENTICAL across every asset in a campaign
 * kit. A mismatch is a hard publication block.
 */

import { BUSINESS } from '@/lib/config/business'
import type { CommercialFacts } from './types'

/** Canonicalize a facts object for comparison (trim, drop empties, sort keys). */
export function canonicalFacts(facts: CommercialFacts): string {
  const entries = Object.entries(facts)
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    .map(([k, v]) => [k, (v as string).trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(entries)
}

export interface FactMismatch { assetIndex: number; field: string; expected: string; actual: string }

/**
 * Assert every asset in a kit carries EXACTLY the same commercial facts.
 * Returns mismatches (empty = consistent). Missing fields count as mismatches
 * only when the master defines them.
 */
export function assertFactsConsistent(
  master: CommercialFacts,
  assets: Array<{ facts: CommercialFacts }>,
): FactMismatch[] {
  const mismatches: FactMismatch[] = []
  const masterEntries = Object.entries(master).filter(([, v]) => v?.trim())
  assets.forEach((asset, i) => {
    for (const [field, expected] of masterEntries) {
      const actual = asset.facts[field]?.trim() ?? ''
      if (actual !== expected!.trim()) {
        mismatches.push({ assetIndex: i, field, expected: expected!.trim(), actual })
      }
    }
  })
  return mismatches
}

/** The official contact facts — the ONLY permitted contact values on creatives. */
export function officialContactFacts(): { globalWhatsapp: string; email: string } {
  return {
    globalWhatsapp: BUSINESS.contacts.globalWhatsapp.display,
    email:          BUSINESS.contacts.email,
  }
}

/**
 * Detect AI-authored commercial values leaking into a generation prompt.
 * Prompts describe imagery, mood, composition — never prices/routes/contacts.
 */
const COMMERCIAL_PATTERNS: Array<[string, RegExp]> = [
  ['price',    /(?:[$£€₦]|NGN|USD|GBP|EUR)\s?\d[\d,.]*/i],
  ['contact',  /\+\d[\d\s-]{7,}/],
  ['discount', /\b\d{1,2}%\s*(?:off|discount)\b/i],
  ['route',    /\b[A-Z]{3}\s*(?:→|->|to)\s*[A-Z]{3}\b/],
]

export function detectCommercialLeakage(prompt: string): string[] {
  return COMMERCIAL_PATTERNS.filter(([, re]) => re.test(prompt)).map(([name]) => name)
}
