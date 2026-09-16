/**
 * Safe list-fetching for the Intelligence Hub pages (DI-1, client-safe).
 *
 * Replaces the `setX(data.<key> ?? data ?? [])` idiom that let 401/500/
 * object responses flow into array state and crash the first `.map()`
 * (the Diaspora "e.map is not a function" incident). An ERROR is never
 * silently converted into an EMPTY list — callers get a discriminated
 * result and must render the two states differently.
 */

export type RecordsResult<T> =
  | { ok: true; records: T[] }
  | { ok: false; error: string }

/** Read a user-safe error message from a failed response body. */
function safeErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const msg = b.message ?? b.error
    // Server-provided messages are kept; stack-trace-looking strings are not.
    if (typeof msg === 'string' && msg && !/\n\s+at\s/.test(msg) && msg.length <= 300) return msg
  }
  if (status === 401) return 'Your session has expired — please sign in again.'
  if (status === 403) return 'Your role does not include access to this module.'
  return `The server returned an error (HTTP ${status}). Please try again.`
}

/**
 * Fetch `url` and return the array at `data[key]`.
 * Never throws; never returns a non-array as records.
 */
export async function fetchRecords<T>(url: string, key: string): Promise<RecordsResult<T>> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    return { ok: false, error: 'Network error — please check your connection and try again.' }
  }
  let body: unknown = null
  try { body = await res.json() } catch { /* non-JSON body (crash page, gateway) */ }
  if (!res.ok) return { ok: false, error: safeErrorMessage(res.status, body) }
  const records = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined
  if (!Array.isArray(records)) {
    return { ok: false, error: 'The server response was not in the expected format. Please refresh and try again.' }
  }
  return { ok: true, records: records as T[] }
}
