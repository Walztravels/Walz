// Central ranking/sort logic for activity search results.
// Both the public /activities API and the admin booking console use this.

import type { NormalizedActivity, ActivitySupplier } from './types'

// ── Supplier priority (1 = highest) ───────────────────────────────────────────
// Change this array to reorder supplier priority without touching other code.
export const ACTIVITY_SUPPLIER_PRIORITY: ActivitySupplier[] = ['VIATOR', 'HOTELBEDS', 'MANUAL']

function supplierRank(supplier: ActivitySupplier): number {
  const idx = ACTIVITY_SUPPLIER_PRIORITY.indexOf(supplier)
  return idx === -1 ? ACTIVITY_SUPPLIER_PRIORITY.length : idx
}

// ── Quality score (higher = better within the same supplier tier) ─────────────
function qualityScore(a: NormalizedActivity): number {
  let score = 0

  // Valid image — required for a usable card
  const hasImage = a.images?.some(img =>
    img.url && img.url.startsWith('https')
  )
  if (hasImage) score += 30

  // Valid price
  if (a.sellingPrice > 0) score += 20

  // Rating and review volume
  if ((a.rating ?? 0) >= 4.5) score += 25
  else if ((a.rating ?? 0) >= 4.0) score += 15
  else if ((a.rating ?? 0) > 0)    score += 5

  // Review count — more reviews = more trust
  const reviews = a.reviewCount ?? 0
  if (reviews >= 1000) score += 15
  else if (reviews >= 100) score += 10
  else if (reviews >= 10)  score += 5

  // Free cancellation — improves conversion
  if (a.freeCancellation) score += 5

  // Instant confirmation — reduces friction
  if (a.instantConfirmation) score += 5

  // Has description
  if (a.description || a.shortDescription) score += 5

  return score
}

/**
 * Sort activities by:
 *   1. Supplier priority (VIATOR before HOTELBEDS)
 *   2. Quality score within each supplier tier
 *
 * A broken Viator product (no image, no price, no reviews) will NOT outrank
 * a strong Hotelbeds product — quality score can swing ±100 points, which
 * crosses the supplier boundary only when the gap is very large.
 *
 * Returns a new array — does not mutate the input.
 */
export function rankActivities(activities: NormalizedActivity[]): NormalizedActivity[] {
  return [...activities].sort((a, b) => {
    const supplierDiff = supplierRank(a.supplier) - supplierRank(b.supplier)
    if (supplierDiff !== 0) return supplierDiff
    // Same supplier → rank by quality descending
    return qualityScore(b) - qualityScore(a)
  })
}

/**
 * Filter out activities that are genuinely unusable.
 * A product with no image AND no price AND no description is not worth showing.
 * This is deliberately conservative — keep borderline products.
 */
export function filterUnusableActivities(activities: NormalizedActivity[]): NormalizedActivity[] {
  return activities.filter(a => {
    const hasImage = a.images?.some(img => img.url?.startsWith('https'))
    const hasPrice = a.sellingPrice > 0
    const hasContent = !!(a.title && a.title.length > 2)
    // Must have at least a title — everything else is a nice-to-have
    return hasContent && (hasImage || hasPrice)
  })
}

/**
 * Deduplicate across suppliers by destination + normalised title similarity.
 * When Viator and Hotelbeds offer the same activity, the supplier-priority
 * sorted list means Viator comes first — we just drop subsequent near-duplicates.
 *
 * Conservative: only deduplicates when titles share ≥70% of significant words.
 */
export function deduplicateActivities(activities: NormalizedActivity[]): NormalizedActivity[] {
  const seen: string[] = []

  function sig(title: string): string[] {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)  // ignore short filler words
  }

  function isDuplicate(title: string): boolean {
    const words = sig(title)
    if (!words.length) return false
    for (const prev of seen) {
      const prevWords = sig(prev)
      if (!prevWords.length) continue
      const shared  = words.filter(w => prevWords.includes(w)).length
      const maxLen  = Math.max(words.length, prevWords.length)
      if (shared / maxLen >= 0.7) return true
    }
    return false
  }

  const result: NormalizedActivity[] = []
  for (const a of activities) {
    if (!isDuplicate(a.title)) {
      seen.push(a.title)
      result.push(a)
    }
  }
  return result
}
