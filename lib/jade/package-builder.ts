// lib/jade/package-builder.ts
// Release 5E — Dynamic Packages & Bundles
//
// A "Walz Package" is an orchestration of TripItems — flight + hotel + transfer
// + activity + eSIM. Package metadata lives in Trip.notes (JSON) to avoid
// schema changes. Pricing is per-currency only — never cross-currency totals.
//
// SECURITY:
//   - No fake package savings unless a real discount baseline exists
//   - Checkout reuses existing Trip checkout — no separate payment flow
//   - Failed supplier = PARTIALLY_CONFIRMED, never silently substituted

import prisma from '@/lib/db'
import { trackCommercialEvent } from '@/lib/commercial/track'
import { getSmartRecommendations } from './recommendations'

// ─── Package Tiers ────────────────────────────────────────────────────────────

export type PackageTier = 'ESSENTIAL' | 'COMFORT' | 'COMPLETE'

const TIER_COMPONENTS: Record<PackageTier, string[]> = {
  ESSENTIAL: ['FLIGHT', 'HOTEL'],
  COMFORT:   ['FLIGHT', 'HOTEL', 'TRANSFER'],
  COMPLETE:  ['FLIGHT', 'HOTEL', 'TRANSFER', 'ACTIVITY', 'ESIM'],
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageCurrencyTotal {
  currency: string
  amount:   number
  itemCount: number
}

export interface PackageReadiness {
  status:     'READY' | 'ACTION_REQUIRED' | 'BLOCKED'
  staleItems: string[]
  missingTier: PackageTier | null
  reasons:    string[]
}

export interface DynamicPackage {
  tripId:          string
  tier:            PackageTier
  label:           string
  description:     string
  componentTypes:  string[]
  presentTypes:    string[]
  missingTypes:    string[]
  currencyTotals:  PackageCurrencyTotal[]
  readiness:       PackageReadiness
  checkoutUrl:     string | null
}

// ─── Package Builder ─────────────────────────────────────────────────────────

export async function buildDynamicPackage(
  tripId:        string,
  requestedTier: PackageTier = 'COMPLETE',
): Promise<DynamicPackage> {
  const trip = await prisma.trip.findUnique({
    where:   { id: tripId },
    include: {
      items: {
        select: {
          id: true, type: true, title: true, cost: true, currency: true,
          metadata: true, confirmed: true,
        },
      },
    },
  })

  if (!trip) {
    throw new Error(`Trip ${tripId} not found`)
  }

  const componentTypes = TIER_COMPONENTS[requestedTier]
  const presentTypes   = [...new Set(trip.items.map(i => i.type.toUpperCase()))]
  const missingTypes   = componentTypes.filter(c => !presentTypes.includes(c))

  // Currency totals — per-currency, never summed cross-currency
  const currencyTotals = buildCurrencyTotals(trip.items)

  // Readiness check
  const readiness = assessReadiness(trip.items, missingTypes)

  // Generate checkout URL if ready
  const checkoutUrl = readiness.status === 'READY'
    ? `/checkout/trip/${tripId}`
    : null

  const tier  = nearestCompletedTier(presentTypes) ?? requestedTier
  const label = tierLabel(tier)

  // Track event
  trackCommercialEvent('jade_package_generated', {
    metadata: {
      tripId,
      tier,
      requestedTier,
      presentTypes,
      missingTypes,
      currencyCount: currencyTotals.length,
      readiness: readiness.status,
    },
  })

  return {
    tripId,
    tier,
    label,
    description:    tierDescription(tier, trip.destination),
    componentTypes,
    presentTypes,
    missingTypes,
    currencyTotals,
    readiness,
    checkoutUrl,
  }
}

// ─── Package Readiness ────────────────────────────────────────────────────────

function assessReadiness(
  items: Array<{ type: string; metadata: unknown; confirmed: boolean }>,
  missingTypes: string[],
): PackageReadiness {
  const staleItems: string[] = []
  const reasons:    string[] = []

  for (const item of items) {
    const m = item.metadata as Record<string, unknown>
    if (m?.stale) {
      staleItems.push(item.type)
    }
  }

  if (staleItems.length) {
    reasons.push(`Stale items need re-searching: ${staleItems.join(', ')}`)
    return { status: 'ACTION_REQUIRED', staleItems, missingTier: null, reasons }
  }

  if (missingTypes.length) {
    const missingTier = tierForMissingTypes(missingTypes)
    reasons.push(`Missing components for ${missingTier ?? 'requested'} tier: ${missingTypes.join(', ')}`)
    return { status: 'ACTION_REQUIRED', staleItems, missingTier, reasons }
  }

  return { status: 'READY', staleItems: [], missingTier: null, reasons: [] }
}

// ─── Currency Totals ──────────────────────────────────────────────────────────

function buildCurrencyTotals(
  items: Array<{ type: string; cost: number | null; currency: string }>,
): PackageCurrencyTotal[] {
  const map = new Map<string, { amount: number; count: number }>()

  for (const item of items) {
    const cur  = item.currency.toUpperCase()
    const cost = item.cost ? Number(item.cost) : 0
    const prev = map.get(cur) ?? { amount: 0, count: 0 }
    map.set(cur, { amount: prev.amount + cost, count: prev.count + 1 })
  }

  return [...map.entries()].map(([currency, { amount, count }]) => ({
    currency,
    amount,
    itemCount: count,
  }))
}

// ─── Tier Helpers ─────────────────────────────────────────────────────────────

function tierLabel(tier: PackageTier): string {
  switch (tier) {
    case 'ESSENTIAL': return 'Essential Trip'
    case 'COMFORT':   return 'Comfort Package'
    case 'COMPLETE':  return 'Complete Experience'
  }
}

function tierDescription(tier: PackageTier, destination: string): string {
  const dest = destination.trim() || 'your destination'
  switch (tier) {
    case 'ESSENTIAL': return `Flight and hotel in ${dest}`
    case 'COMFORT':   return `Flight, hotel, and airport transfer in ${dest}`
    case 'COMPLETE':  return `Full trip to ${dest} with flight, hotel, transfer, activities, and connectivity`
  }
}

function nearestCompletedTier(presentTypes: string[]): PackageTier | null {
  const tiers: PackageTier[] = ['COMPLETE', 'COMFORT', 'ESSENTIAL']
  for (const tier of tiers) {
    if (TIER_COMPONENTS[tier].every(c => presentTypes.includes(c))) return tier
  }
  return null
}

function tierForMissingTypes(missing: string[]): PackageTier | null {
  if (missing.includes('FLIGHT') || missing.includes('HOTEL')) return 'ESSENTIAL'
  if (missing.includes('TRANSFER'))                             return 'COMFORT'
  return 'COMPLETE'
}

// ─── Package Checkout Validation ──────────────────────────────────────────────

export async function validatePackageForCheckout(tripId: string): Promise<{
  valid:       boolean
  staleItems:  string[]
  blockers:    string[]
}> {
  const trip = await prisma.trip.findUnique({
    where:   { id: tripId },
    include: {
      items: { select: { type: true, metadata: true, confirmed: true } },
    },
  })

  if (!trip) return { valid: false, staleItems: [], blockers: ['Trip not found'] }

  const staleItems: string[] = []
  const blockers:   string[] = []

  for (const item of trip.items) {
    const m = item.metadata as Record<string, unknown>
    if (m?.stale) staleItems.push(item.type)
  }

  if (staleItems.length) {
    blockers.push(`Re-search required for: ${staleItems.join(', ')}`)
  }

  if (!['PLANNING', 'DRAFT', 'CHECKOUT_STARTED'].includes(trip.status)) {
    blockers.push(`Trip status "${trip.status}" cannot proceed to checkout`)
  }

  if (!trip.items.length) {
    blockers.push('Trip has no items')
  }

  return { valid: blockers.length === 0, staleItems, blockers }
}
