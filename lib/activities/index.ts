import type { ActivitySearchParams, NormalizedActivity, UnifiedSearchResult } from './types'
import { HotelbedsActivityProvider } from './providers/hotelbeds'
import { ViatorActivityProvider }    from './providers/viator'

// Feature flags — server-side only
function viatorEnabled(): boolean {
  return process.env.VIATOR_ACTIVITIES_ENABLED === 'true' && !!process.env.VIATOR_API_KEY
}
function viatorCustomerEnabled(): boolean {
  return process.env.VIATOR_CUSTOMER_SEARCH_ENABLED === 'true' && viatorEnabled()
}

const hotelbeds = new HotelbedsActivityProvider()
const viator    = new ViatorActivityProvider()

/**
 * Unified activity search across all enabled suppliers.
 * Uses Promise.allSettled so a failing supplier never kills the whole response.
 *
 * @param params          Search parameters (shared across suppliers)
 * @param includeViator   Pass false to force-skip Viator (e.g. admin contexts that need cost breakdowns only from HB)
 */
export async function searchActivities(
  params: ActivitySearchParams,
  includeViator = true,
): Promise<UnifiedSearchResult> {
  const tasks: Promise<PromiseSettledResult<NormalizedActivity[]>>[] = [
    hotelbeds.search(params).then(r => ({ status: 'fulfilled', value: r } as PromiseSettledResult<NormalizedActivity[]>))
      .catch(e => ({ status: 'rejected', reason: e } as PromiseSettledResult<NormalizedActivity[]>)),
  ]

  if (includeViator && viatorCustomerEnabled()) {
    tasks.push(
      viator.search(params)
        .then(r => ({ status: 'fulfilled', value: r } as PromiseSettledResult<NormalizedActivity[]>))
        .catch(e => ({ status: 'rejected', reason: e } as PromiseSettledResult<NormalizedActivity[]>)),
    )
  }

  const [hbResult, viatorResult] = await Promise.all(tasks)

  const hbActivities     = hbResult?.status === 'fulfilled'      ? hbResult.value     : []
  const viatorActivities = viatorResult?.status === 'fulfilled'  ? viatorResult.value : []

  const hbError     = hbResult?.status === 'rejected'      ? String((hbResult as PromiseRejectedResult).reason) : undefined
  const viatorError = viatorResult?.status === 'rejected'  ? String((viatorResult as PromiseRejectedResult).reason) : undefined

  const combined = deduplicateActivities([...hbActivities, ...viatorActivities])

  return {
    activities: combined,
    total: combined.length,
    suppliers: {
      hotelbeds: { count: hbActivities.length,     error: hbError },
      ...(includeViator && viatorCustomerEnabled()
        ? { viator: { count: viatorActivities.length, error: viatorError } }
        : {}),
    },
  }
}

/**
 * Conservative deduplication: only removes a Viator result when a Hotelbeds
 * result with highly similar title AND same destination already exists.
 * When in doubt, keep both — false negatives are safer than false positives.
 */
function deduplicateActivities(activities: NormalizedActivity[]): NormalizedActivity[] {
  const hbTitles = new Set(
    activities
      .filter(a => a.supplier === 'HOTELBEDS')
      .map(a => normalizeTitle(a.title)),
  )

  return activities.filter(a => {
    if (a.supplier !== 'VIATOR') return true
    const t = normalizeTitle(a.title)
    return !hbTitles.has(t)
  })
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

// Re-export provider classes for admin/booking routes that need direct access
export { HotelbedsActivityProvider } from './providers/hotelbeds'
export { ViatorActivityProvider }    from './providers/viator'
export type * from './types'
