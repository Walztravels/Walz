/**
 * lib/v2/build-acceptance-snapshot.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Pure function: constructs the immutable AcceptedConfigurationV2 that is
 * written once to Itinerary.selectedOption at acceptance time.
 *
 * No HTTP, no DB, no side effects — fully unit-testable.
 *
 * The caller (accept-v2 route) must:
 *   1. Have already validated selections with validateClientSelections()
 *   2. Pass groups/items loaded server-side (never browser-supplied data)
 *   3. Overwrite acceptedAt inside the Prisma transaction for the winning
 *      request (same pattern as the V1 approve route)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type {
  AcceptedConfigurationV2,
  AcceptedGroup,
  AcceptedSelectedItem,
  OptionGroup,
  OptionItem,
  ClientSelectionPayload,
  SelectedItemInput,
} from './types'
import { calculateTripPrice } from './pricing'

export interface BuildSnapshotParams {
  acceptedBy:    string
  proposalHash:  string
  currency:      string
  /** Itinerary.totalPrice — the base before option adjustments */
  baseTotal:     number
  deposit:       number | null
  termsAccepted: boolean
  payload:       ClientSelectionPayload[]
  groups:        OptionGroup[]
  items:         OptionItem[]
}

/**
 * Build the AcceptedConfigurationV2 snapshot from validated inputs.
 *
 * - Builds selectedGroups by mapping payload through the server-authoritative
 *   group and item records (browser input is never used for amounts).
 * - Calls calculateTripPrice() to derive the authoritative pricing breakdown.
 * - acceptedTotal is taken from pricingResult.grandTotal — NEVER from browser input.
 * - acceptedAt is set to now(); the route MUST overwrite it inside the
 *   Prisma $transaction to use the winning request's timestamp.
 */
export function buildAcceptanceSnapshotV2(
  params: BuildSnapshotParams,
): AcceptedConfigurationV2 {
  const {
    acceptedBy, proposalHash, currency, baseTotal, deposit,
    termsAccepted, payload, groups, items,
  } = params

  // ── Build fast lookup maps ────────────────────────────────────────────────

  const groupMap = new Map<string, OptionGroup>()
  for (const g of groups) groupMap.set(g.id, g)

  const itemMap = new Map<string, OptionItem>()
  for (const it of items) itemMap.set(it.id, it)

  // ── Assemble selectedGroups and pricing inputs ────────────────────────────

  const selectedGroups: AcceptedGroup[]      = []
  const pricingInputItems: SelectedItemInput[] = []

  for (const entry of payload) {
    if (entry.itemIds.length === 0) continue // skip empty entries

    const group = groupMap.get(entry.groupId)
    if (!group) continue // should have been caught by validation; skip defensively

    const selectedItems: AcceptedSelectedItem[] = []

    for (const itemId of entry.itemIds) {
      const item = itemMap.get(itemId)
      if (!item) continue // should have been caught by validation; skip defensively

      selectedItems.push({
        itemId:          item.id,
        name:            item.name,
        description:     item.description,
        clientPrice:     item.clientPrice,
        priceAdjustment: item.priceAdjustment,
        currency:        item.currency,
      })

      pricingInputItems.push({
        groupId:         group.id,
        itemId:          item.id,
        pricingMode:     group.pricingMode,
        priceAdjustment: item.priceAdjustment,
        clientPrice:     item.clientPrice,
        currency:        item.currency,
        label:           item.name,
      })
    }

    if (selectedItems.length > 0) {
      selectedGroups.push({
        groupId:       group.id,
        groupName:     group.name,
        selectionMode: group.selectionMode,
        pricingMode:   group.pricingMode,
        selectedItems,
      })
    }
  }

  // ── Authoritative pricing ─────────────────────────────────────────────────
  // grandTotal is computed server-side from baseTotal + option adjustments.
  // The browser never supplies a total.

  const pricingBreakdown = calculateTripPrice({
    baseTotal,
    selectedItems: pricingInputItems,
    currency,
  })

  return {
    version:          2,
    acceptedAt:       new Date().toISOString(), // overwritten inside $transaction
    acceptedBy,
    proposalHash,
    currency,
    acceptedTotal:    pricingBreakdown.grandTotal, // server-computed
    deposit,
    termsAccepted,
    selectedGroups,
    pricingBreakdown,
  }
}
