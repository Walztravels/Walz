/**
 * Date-only utilities for Walz Travels.
 *
 * Trip dates are DATE-ONLY business values (e.g. "2026-09-01"). Passing such
 * strings directly to `new Date()` treats them as UTC midnight, which shifts
 * the displayed date one day behind for every user in a UTC+ timezone. All
 * helpers here parse and manipulate dates in LOCAL time to avoid that bug.
 */

/**
 * Parse a YYYY-MM-DD date string into its numeric parts without any timezone
 * conversion.
 */
export function parseDateOnly(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split('T')[0].split('-')
  if (parts.length !== 3) {
    throw new Error(`parseDateOnly: expected "YYYY-MM-DD", got "${dateStr}"`)
  }
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`parseDateOnly: non-numeric parts in "${dateStr}"`)
  }
  return { year, month, day }
}

/**
 * Format a YYYY-MM-DD (or ISO datetime) string for display.
 *
 * Uses `new Date(year, month-1, day)` — local time constructor — so the
 * displayed date is never shifted by UTC offset.
 *
 * @param dateStr  A YYYY-MM-DD string, an ISO datetime string, or null/undefined.
 * @param format   'long' (default) → "1 September 2026"; 'short' → "1 Sep 2026"
 * @returns        Formatted string, or '' if dateStr is null/undefined/empty.
 */
export function formatDateOnly(
  dateStr: string | null | undefined,
  format: 'long' | 'short' = 'long'
): string {
  if (!dateStr) return ''
  try {
    const { year, month, day } = parseDateOnly(dateStr)
    const d = new Date(year, month - 1, day)
    if (isNaN(d.getTime())) return ''
    const monthFormat = format === 'short' ? 'short' : 'long'
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: monthFormat,
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Add N calendar days to a YYYY-MM-DD string and return the result as
 * "YYYY-MM-DD". Arithmetic is done in local time so DST transitions and
 * UTC offsets do not corrupt the result.
 */
export function addDaysToDateOnly(dateStr: string, days: number): string {
  const { year, month, day } = parseDateOnly(dateStr)
  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Convert a YYYY-MM-DD (or ISO datetime) string to the "YYYY-MM-DD" format
 * required by `<input type="date">`. Returns '' if dateStr is null/undefined.
 */
export function dateOnlyToInputValue(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const { year, month, day } = parseDateOnly(dateStr)
    const m = String(month).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  } catch {
    return ''
  }
}

/**
 * Return today's date as "YYYY-MM-DD" in local time (not UTC). Using
 * `new Date().toISOString()` would give UTC date, which can differ from the
 * user's local calendar date.
 */
export function todayAsDateOnly(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
