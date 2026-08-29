/**
 * Server-side canonical hash for the commercial proposal state.
 *
 * PURPOSE: Detect when a proposal has changed since it was last sent to the
 * client. Stored as sentOptionsHash in Itinerary.options. Rebuilt at
 * acceptance time and compared — mismatch means the advisor edited the
 * itinerary after sending, so the client would be accepting a stale version.
 *
 * WHAT IS HASHED (commercial content only):
 *   referenceNumber, currency, destination, startDate, endDate, duration,
 *   numberOfTravellers, tripType, totalPrice, deposit, depositDue, balanceDue,
 *   overview, terms, priceBreakdown, days, flights, hotels, transfers, tours,
 *   trains, ferries, inclusions, exclusions, packageOptions (from Supabase).
 *
 * WHAT IS NOT HASHED:
 *   - Volatile operational state: updatedAt, sentAt, viewCount, approvedAt
 *   - Token metadata: approvalToken, approvalTokenUsed, approvalTokenExpiresAt
 *   - The hash itself: sentOptionsHash, sentOptionsHashCreatedAt (circular)
 *   - Internal admin fields: notes, budget, assignedTo, tags, createdBy
 *   - Identity / routing: clientName, clientEmail, clientPhone, coverImage
 *   - Supplier internals: supplierCost, rateKey, partnerNetPrice, margin
 *   - CRM state: status, selectedOption, clientSignature
 *   - Display cosmetics: title, attachments, coverImage
 *
 * CANONICALIZATION RULES:
 *   - Object keys sorted alphabetically (recursive)
 *   - Arrays: preserved in display order where order is meaningful
 *             sorted alphabetically for set-semantic arrays (inclusions, exclusions, features)
 *             sorted by sort_order+name for packageOptions
 *   - Money: Float → toFixed(2) string  (£2000 and £2000.00 → "2000.00")
 *   - Dates: DateTime → YYYY-MM-DD string  (strip time component)
 *   - undefined → null
 *   - NaN/Infinity → null
 */

import { createHash } from 'crypto'
import type { Itinerary } from '@prisma/client'
import { parseOptions } from '@/lib/itinerary-options'

// ─── types ────────────────────────────────────────────────────────────────────

// Only the commercial columns from itinerary_package_options.
// id, itinerary_id, is_selected, created_at, updated_at are excluded.
export type PackageOptionRow = {
  name:        string
  description: string | null
  price:       number | null
  currency:    string
  features:    string[]
  sort_order:  number
  [key: string]: unknown  // allow extra Supabase columns without TS error
}

// The exact set of values fed into the hash — explicit, no raw Prisma object.
type ProposalHashPayload = {
  referenceNumber:    string
  currency:           string
  destination:        string
  startDate:          string | null   // YYYY-MM-DD
  endDate:            string | null   // YYYY-MM-DD
  duration:           number | null
  numberOfTravellers: number
  tripType:           string | null
  totalPrice:         string | null   // toFixed(2) string
  deposit:            string | null   // toFixed(2) string
  depositDue:         string | null   // YYYY-MM-DD
  balanceDue:         string | null   // YYYY-MM-DD
  overview:           string | null
  terms:              string | null
  priceBreakdown:     unknown[]       // display order; cost normalized
  days:               unknown[]       // display order preserved
  flights:            unknown[]       // display order preserved
  hotels:             unknown[]       // display order preserved
  transfers:          unknown[]       // display order preserved
  tours:              unknown[]       // display order preserved
  trains:             unknown[]       // display order preserved
  ferries:            unknown[]       // display order preserved
  inclusions:         string[]        // sorted (set semantics)
  exclusions:         string[]        // sorted (set semantics)
  packageOptions:     unknown[]       // sorted by sort_order, then name
}

// ─── normalization helpers ─────────────────────────────────────────────────────

// Normalize DateTime (Date | string | null) → YYYY-MM-DD string.
// Guards against routes serializing the same date differently:
//   new Date('2026-09-01') → "2026-09-01T00:00:00.000Z" vs "2026-09-01"
function normalizeDate(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const s = typeof d === 'string' ? d : d.toISOString()
  return s.slice(0, 10)
}

// Normalize a Float money value → "NNNN.NN" string.
// Prevents £2000 and £2000.00 from hashing differently due to float representation.
function normalizeMoney(v: number | null | undefined): string | null {
  if (v == null) return null
  return Number(v).toFixed(2)
}

function safeParseArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Normalize cost fields in priceBreakdown items (display order preserved).
function normalizePriceBreakdown(items: unknown[]): unknown[] {
  return items.map(item => {
    if (typeof item !== 'object' || !item) return item
    const row = item as Record<string, unknown>
    return { ...row, cost: row.cost != null ? Number(row.cost).toFixed(2) : null }
  })
}

// Normalize Supabase packageOption rows: exclude internal fields, normalize
// money, sort features (set semantics), sort rows by sort_order then name.
function normalizePackageOptions(rows: PackageOptionRow[]): unknown[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(r => ({
      name:        r.name,
      description: r.description ?? null,
      price:       normalizeMoney(r.price),
      currency:    r.currency,
      features:    [...(r.features ?? [])].sort(),
      sort_order:  r.sort_order,
    }))
}

// ─── canonicalization ──────────────────────────────────────────────────────────

// Recursively produce a deterministic JSON-serializable structure:
//   - Object keys sorted alphabetically
//   - Arrays: preserved in the order they arrive (caller pre-sorted where needed)
//   - undefined → null
//   - NaN / Infinity → null
function canonicalize(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value === 'number') return isFinite(value) ? value : null
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const obj = value as Record<string, unknown>
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize(obj[k])
      return acc
    }, {})
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build the explicit hash payload from an Itinerary row and its Supabase
 * package options. Pure function — no DB calls, fully testable.
 */
export function buildProposalHashPayload(
  itin: Itinerary,
  packageOptions: PackageOptionRow[] = []
): ProposalHashPayload {
  return {
    referenceNumber:    itin.referenceNumber,
    currency:           itin.currency,
    destination:        itin.destination,
    startDate:          normalizeDate(itin.startDate),
    endDate:            normalizeDate(itin.endDate),
    duration:           itin.duration ?? null,
    numberOfTravellers: itin.numberOfTravellers,
    tripType:           itin.tripType ?? null,
    totalPrice:         normalizeMoney(itin.totalPrice),
    deposit:            normalizeMoney(itin.deposit),
    depositDue:         normalizeDate(itin.depositDue),
    balanceDue:         normalizeDate(itin.balanceDue),
    overview:           itin.overview ?? null,
    terms:              itin.terms ?? null,
    priceBreakdown:     normalizePriceBreakdown(safeParseArray(itin.priceBreakdown)),
    days:               safeParseArray(itin.days),
    flights:            safeParseArray(itin.flights),
    hotels:             safeParseArray(itin.hotels),
    transfers:          safeParseArray(itin.transfers ?? null),
    tours:              safeParseArray(itin.tours ?? null),
    trains:             safeParseArray(itin.trains ?? null),
    ferries:            safeParseArray(itin.ferries ?? null),
    inclusions:         (safeParseArray(itin.inclusions) as string[]).slice().sort(),
    exclusions:         (safeParseArray(itin.exclusions) as string[]).slice().sort(),
    packageOptions:     normalizePackageOptions(packageOptions),
  }
}

/**
 * Produce a SHA-256 hex digest of the canonical proposal payload.
 * Synchronous; no side effects.
 */
export function hashProposalState(payload: ProposalHashPayload): string {
  const canonical  = canonicalize(payload)
  const serialized = JSON.stringify(canonical)
  return createHash('sha256').update(serialized, 'utf8').digest('hex')
}

// ─── validation ───────────────────────────────────────────────────────────────

export type ProposalValidationResult =
  | { result: 'VALID' }
  | { result: 'STALE';         storedHash: string; currentHash: string }
  | { result: 'NO_HASH_LEGACY' }

/**
 * Validate that the current itinerary state matches what was hashed at send time.
 *
 * VALID          — hash matches; proposal is current; acceptance is safe
 * STALE          — hash mismatch; itinerary changed since last send; reject acceptance
 * NO_HASH_LEGACY — no stored hash (sent before GA3); log and allow per backward-compat policy
 *
 * Callers must supply packageOptions (from Supabase) so this function stays pure.
 * Get storedHash from: parseOptions(itin.options).sentOptionsHash as string | undefined
 */
export function validateSentProposalState(
  itin: Itinerary,
  packageOptions: PackageOptionRow[],
  storedHash: string | undefined
): ProposalValidationResult {
  if (!storedHash) return { result: 'NO_HASH_LEGACY' }
  const payload     = buildProposalHashPayload(itin, packageOptions)
  const currentHash = hashProposalState(payload)
  if (currentHash === storedHash) return { result: 'VALID' }
  return { result: 'STALE', storedHash, currentHash }
}

/**
 * Read the stored hash from the raw options string.
 * Convenience wrapper so callers don't need to import parseOptions separately.
 */
export function getStoredProposalHash(rawOptions: string | null | undefined): string | undefined {
  return parseOptions(rawOptions).sentOptionsHash as string | undefined
}
