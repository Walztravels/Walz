/**
 * Safe read/merge/write helpers for the Itinerary.options JSON string field.
 *
 * The field defaults to "[]" in the Prisma schema (an array, not an object).
 * All helpers normalise that case so callers always work with a plain object.
 *
 * Deletion semantics: to explicitly remove a key, set its value to `undefined`
 * in the patch passed to mergeOptions(). Absent keys are left untouched.
 * Never pass `{ key: undefined }` to update a key to undefined — that removes it.
 */

export type OptionsMap = Record<string, unknown>

/**
 * Parse the raw options string from the DB into a plain object.
 * Returns {} for null, empty string, legacy "[]" default, or invalid JSON.
 * Logs a server-side warning if the value is non-empty but unparseable.
 */
export function parseOptions(raw: string | null | undefined): OptionsMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
      // Legacy default "[]" or any non-object — treat as empty
      return {}
    }
    return parsed as OptionsMap
  } catch {
    console.warn('[itinerary-options] Failed to parse options JSON:', raw.slice(0, 120))
    return {}
  }
}

/**
 * Merge a patch into existing options, preserving all keys not present in patch.
 *
 * - patch key = undefined  → that key is DELETED from the result
 * - patch key = any value  → that key is set to the new value
 * - keys absent from patch → unchanged from existing
 */
export function mergeOptions(existing: OptionsMap, patch: OptionsMap): OptionsMap {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }
  return merged
}

/**
 * Serialise an options map to a JSON string for DB storage.
 */
export function serializeOptions(opts: OptionsMap): string {
  return JSON.stringify(opts)
}

/**
 * One-shot helper: parse existing raw string, apply patch, return serialised result.
 * Equivalent to serializeOptions(mergeOptions(parseOptions(raw), patch)).
 */
export function patchOptions(raw: string | null | undefined, patch: OptionsMap): string {
  return serializeOptions(mergeOptions(parseOptions(raw), patch))
}
