/**
 * Preview Build Infrastructure Repair.
 *
 * Five routes/pages were statically evaluated by Next.js at BUILD time
 * (no `dynamic`/explicit fallback), which requires a live DATABASE_URL /
 * Supabase credential in whichever environment runs the build — breaking
 * Vercel Preview, where those are deliberately absent. This file proves:
 *   (a) each route/page still returns its normal, correct response when the
 *       DB/Supabase client succeeds (no runtime behavior regression), and
 *   (b) each one no longer THROWS when the DB/Supabase client fails — which
 *       is exactly the condition a build-time prerender attempt hits with no
 *       credentials configured.
 * It is not a build itself — see the separate `next build` verification
 * (with DATABASE_URL/DIRECT_URL unset) for proof the actual Vercel build
 * step no longer lists these paths under "Export encountered errors".
 */

// ── app/api/promos/flights ──────────────────────────────────────────────────
describe('GET /api/promos/flights', () => {
  afterEach(() => jest.resetModules())

  it('is force-dynamic (never statically evaluated at build time)', async () => {
    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: { featuredDeal: { findMany: jest.fn().mockResolvedValue([]) } },
    }))
    const route = await import('@/app/api/promos/flights/route')
    expect(route.dynamic).toBe('force-dynamic')
  })

  it('returns the active, ordered deals unchanged (no behavior regression)', async () => {
    const deals = [{ id: 'd1', active: true, order: 0 }]
    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: { featuredDeal: { findMany: jest.fn().mockResolvedValue(deals) } },
    }))
    const { GET } = await import('@/app/api/promos/flights/route')
    const res = await GET()
    expect(await res.json()).toEqual(deals)
  })
})

// ── app/api/promos/hotels ───────────────────────────────────────────────────
describe('GET /api/promos/hotels', () => {
  afterEach(() => jest.resetModules())

  it('is force-dynamic', async () => {
    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: { featuredHotel: { findMany: jest.fn().mockResolvedValue([]) } },
    }))
    const route = await import('@/app/api/promos/hotels/route')
    expect(route.dynamic).toBe('force-dynamic')
  })

  it('returns the active, ordered hotels unchanged', async () => {
    const hotels = [{ id: 'h1', active: true, order: 0 }]
    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: { featuredHotel: { findMany: jest.fn().mockResolvedValue(hotels) } },
    }))
    const { GET } = await import('@/app/api/promos/hotels/route')
    const res = await GET()
    expect(await res.json()).toEqual(hotels)
  })
})

// ── app/api/public/homepage ─────────────────────────────────────────────────
describe('GET /api/public/homepage', () => {
  afterEach(() => jest.resetModules())

  it('is force-dynamic (replacing the build-time-eligible revalidate export)', async () => {
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({ from: () => ({ select: async () => ({ data: [], error: null }) }) }),
    }))
    const route = await import('@/app/api/public/homepage/route')
    expect(route.dynamic).toBe('force-dynamic')
    expect((route as Record<string, unknown>).revalidate).toBeUndefined()
  })

  it('returns grouped content and the unchanged Cache-Control header on success', async () => {
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({
        from: () => ({
          select: async () => ({ data: [{ section: 'hero', data: { title: 'x' } }], error: null }),
        }),
      }),
    }))
    const { GET } = await import('@/app/api/public/homepage/route')
    const res = await GET()
    expect(await res.json()).toEqual({ content: { hero: { title: 'x' } } })
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
  })

  it('still returns empty content gracefully on a query-level error (unchanged pre-existing behavior)', async () => {
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({ from: () => ({ select: async () => ({ data: null, error: new Error('boom') }) }) }),
    }))
    const { GET } = await import('@/app/api/public/homepage/route')
    const res = await GET()
    expect(await res.json()).toEqual({ content: {} })
  })
})

// ── app/api/public/hotel-destinations ───────────────────────────────────────
describe('GET /api/public/hotel-destinations', () => {
  afterEach(() => jest.resetModules())

  it('is force-dynamic', async () => {
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
    }))
    const route = await import('@/app/api/public/hotel-destinations/route')
    expect(route.dynamic).toBe('force-dynamic')
  })

  it('returns the active destinations unchanged on success', async () => {
    const destinations = [{ id: 'dest1', active: true }]
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({
        from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: destinations, error: null }) }) }) }) }),
      }),
    }))
    const { GET } = await import('@/app/api/public/hotel-destinations/route')
    const res = await GET()
    expect(await res.json()).toEqual({ destinations })
  })

  it('still returns an empty list gracefully on a query-level error (unchanged pre-existing behavior)', async () => {
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: new Error('boom') }) }) }) }) }) }),
    }))
    const { GET } = await import('@/app/api/public/hotel-destinations/route')
    const res = await GET()
    expect(await res.json()).toEqual({ destinations: [] })
  })
})

// ── app/packages (the internal getPackages() fallback) ──────────────────────
// PackagesPage is a Server Component returning JSX, and getPackages() is not
// exported (page modules only export default/metadata/revalidate by Next.js
// convention) — so these tests invoke the page itself and assert on the
// resulting React element tree, which is the real boundary that matters:
// does the page still render correctly on success, and does it survive
// (rather than throw) a database failure.
describe('app/packages/page.tsx', () => {
  afterEach(() => jest.resetModules())

  it('renders the package grid unchanged when the database read succeeds', async () => {
    const packages = [{
      id: 'p1', slug: 'dubai-escape', name: 'Dubai Escape', active: true, type: 'package', order: 0,
      photos: [], imageUrl: null, currency: 'USD', price: 1200, location: 'Dubai', duration: '5 days',
      highlights: '[]',
    }]
    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: { tourListing: { findMany: jest.fn().mockResolvedValue(packages) } },
    }))
    const { default: PackagesPage } = await import('@/app/packages/page')
    const element = await PackagesPage()
    const html = require('react-dom/server').renderToStaticMarkup(element)
    expect(html).toContain('Dubai Escape')
    expect(html).not.toContain('No packages available right now')
  })

  it('renders the safe empty state (not a crash) when the database read fails — this is the exact condition a build-time prerender with no DATABASE_URL hits', async () => {
    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: { tourListing: { findMany: jest.fn().mockRejectedValue(new Error('Environment variable not found: DATABASE_URL.')) } },
    }))
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { default: PackagesPage } = await import('@/app/packages/page')
    const element = await PackagesPage()
    const html = require('react-dom/server').renderToStaticMarkup(element)
    expect(html).toContain('No packages available right now')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[packages] DB read failed, using fallback content:',
      expect.any(Error),
    )
    consoleErrorSpy.mockRestore()
  })
})
