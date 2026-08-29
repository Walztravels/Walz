/**
 * lib/v2/validate-selection.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Pure validation for client option selections against a resolved set of
 * OptionGroups and OptionItems. No HTTP, no DB, fully unit-testable.
 *
 * All validation errors are collected before returning — never early-exit.
 * `valid: true` iff `errors` is empty.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type {
  OptionGroup,
  OptionItem,
  ClientSelectionPayload,
  SelectionValidationResult,
  SelectionValidationIssue,
} from './types'

/**
 * Validate client selections against the authoritative group and item data.
 *
 * @param payload      — The raw selections sent by the client browser
 * @param groups       — All OptionGroups for this itinerary (loaded server-side)
 * @param items        — All OptionItems for this itinerary (loaded server-side)
 * @param itineraryId  — The Prisma Itinerary.id that all groups/items must belong to
 * @param baseCurrency — The itinerary currency; item currencies must match
 */
export function validateClientSelections(
  payload: ClientSelectionPayload[],
  groups: OptionGroup[],
  items: OptionItem[],
  itineraryId: string,
  baseCurrency: string,
): SelectionValidationResult {
  const errors: SelectionValidationIssue[] = []

  // ── Build fast lookup maps ────────────────────────────────────────────────

  const groupMap = new Map<string, OptionGroup>()
  for (const g of groups) {
    groupMap.set(g.id, g)
  }

  const itemMap = new Map<string, OptionItem>()
  for (const item of items) {
    itemMap.set(item.id, item)
  }

  // ── DUPLICATE_ITEM: same itemId across the entire payload ─────────────────
  // Check before per-entry validation so we always report the full picture.

  const seenItemIds = new Set<string>()
  for (const entry of payload) {
    for (const itemId of entry.itemIds) {
      if (seenItemIds.has(itemId)) {
        errors.push({
          code:    'DUPLICATE_ITEM',
          itemId,
          message: `Item "${itemId}" appears more than once across all selections`,
        })
      } else {
        seenItemIds.add(itemId)
      }
    }
  }

  // ── Per-payload-entry validation ──────────────────────────────────────────

  for (const entry of payload) {
    const { groupId, itemIds } = entry
    const group = groupMap.get(groupId)

    // GROUP_NOT_FOUND: groupId unknown OR belongs to a different itinerary
    // (cross-itinerary injection guard — both cases map to the same error code)
    if (!group || group.itineraryId !== itineraryId) {
      errors.push({
        code:    'GROUP_NOT_FOUND',
        groupId,
        message: `Group "${groupId}" was not found for itinerary "${itineraryId}"`,
      })
      // Cannot validate items without a resolved group
      continue
    }

    // ── Group-level cardinality rules ───────────────────────────────────────

    if (group.selectionMode === 'SINGLE') {
      // SINGLE_EXCEEDED: more than one itemId submitted
      if (itemIds.length > 1) {
        errors.push({
          code:    'SINGLE_EXCEEDED',
          groupId,
          message: `Group "${group.name}" only allows a single selection but received ${itemIds.length}`,
        })
      }
    } else {
      // MULTIPLE mode
      if (itemIds.length < group.minSelections) {
        errors.push({
          code:    'MIN_NOT_MET',
          groupId,
          message: `Group "${group.name}" requires at least ${group.minSelections} selection(s) but received ${itemIds.length}`,
        })
      }
      if (itemIds.length > group.maxSelections) {
        errors.push({
          code:    'MAX_EXCEEDED',
          groupId,
          message: `Group "${group.name}" allows at most ${group.maxSelections} selection(s) but received ${itemIds.length}`,
        })
      }
    }

    // ── Per-item validation ─────────────────────────────────────────────────

    for (const itemId of itemIds) {
      const item = itemMap.get(itemId)

      // ITEM_NOT_FOUND: item unknown or does not belong to the declared group
      if (!item || item.groupId !== groupId) {
        errors.push({
          code:    'ITEM_NOT_FOUND',
          groupId,
          itemId,
          message: `Item "${itemId}" was not found in group "${groupId}"`,
        })
        // Cannot validate further without a resolved item
        continue
      }

      // WRONG_ITINERARY: item's itineraryId disagrees with the param
      // (data-integrity guard; normally caught by server-side query filter)
      if (item.itineraryId !== itineraryId) {
        errors.push({
          code:    'WRONG_ITINERARY',
          groupId,
          itemId,
          message: `Item "${itemId}" belongs to a different itinerary`,
        })
      }

      // CURRENCY_MISMATCH: item currency differs from the itinerary base currency
      if (item.currency !== baseCurrency) {
        errors.push({
          code:    'CURRENCY_MISMATCH',
          groupId,
          itemId,
          message: `Item "${itemId}" has currency "${item.currency}" but itinerary currency is "${baseCurrency}"`,
        })
      }

      // ITEM_NOT_ACTIVE: item is disabled
      if (!item.active) {
        errors.push({
          code:    'ITEM_NOT_ACTIVE',
          groupId,
          itemId,
          message: `Item "${item.name}" is not currently active`,
        })
      }

      // ITEM_NOT_SELECTABLE: item exists but clients cannot choose it
      if (!item.clientSelectable) {
        errors.push({
          code:    'ITEM_NOT_SELECTABLE',
          groupId,
          itemId,
          message: `Item "${item.name}" cannot be selected by the client`,
        })
      }

      // ITEM_EXPIRED: quoteExpiresAt is set and is strictly in the past
      if (item.quoteExpiresAt && new Date(item.quoteExpiresAt) < new Date()) {
        errors.push({
          code:    'ITEM_EXPIRED',
          groupId,
          itemId,
          message: `Item "${item.name}" quote has expired`,
        })
      }
    }
  }

  // ── REQUIRED_GROUP_MISSING ────────────────────────────────────────────────
  // Checked after payload traversal so all item-level errors are also captured.
  // A required group is considered "present" only if ≥1 itemId was submitted.

  for (const group of groups) {
    // Only consider groups that belong to this itinerary and are required
    if (!group.required || group.itineraryId !== itineraryId) continue

    const entry = payload.find(e => e.groupId === group.id)
    if (!entry || entry.itemIds.length === 0) {
      errors.push({
        code:    'REQUIRED_GROUP_MISSING',
        groupId: group.id,
        message: `Group "${group.name}" is required but has no selection`,
      })
    }
  }

  return {
    valid:  errors.length === 0,
    errors,
  }
}
