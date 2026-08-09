// lib/concierge/imagery.ts
// Verified Unsplash imagery for each Concierge category.
// All photo IDs return HTTP 200 and are free to use under the Unsplash licence.

export interface CategoryImagery {
  slug:     string
  hero:     string   // ?w=1920&q=75&auto=format&fit=crop
  card:     string   // ?w=800&q=75&auto=format&fit=crop
  alt:      string
  position: string   // CSS object-position value
}

const BASE = 'https://images.unsplash.com'

function buildUrls(id: string): { hero: string; card: string } {
  return {
    hero: `${BASE}/${id}?w=1920&q=75&auto=format&fit=crop`,
    card: `${BASE}/${id}?w=800&q=75&auto=format&fit=crop`,
  }
}

export const CATEGORY_IMAGERY: CategoryImagery[] = [
  {
    slug: 'airport-services',
    ...buildUrls('photo-1570710891163-6d3b5c47248b'),
    alt:      'Quiet luxury airport terminal',
    position: 'center 60%',
  },
  {
    slug: 'executive-transport',
    ...buildUrls('photo-1558980664-2cd663cf8dde'),
    alt:      'Black luxury car interior at night',
    position: 'center center',
  },
  {
    slug: 'private-aviation',
    ...buildUrls('photo-1540339832862-474599807836'),
    alt:      'Private jet cabin with leather seats',
    position: 'center center',
  },
  {
    slug: 'yacht-marine',
    ...buildUrls('photo-1505118380757-91f5f5632de0'),
    alt:      'Yacht at anchor in turquoise water',
    position: 'center 30%',
  },
  {
    slug: 'lifestyle',
    ...buildUrls('photo-1414235077428-338989a2e8c0'),
    alt:      'Intimate restaurant with warm evening light',
    position: 'center center',
  },
  {
    slug: 'tickets',
    ...buildUrls('photo-1470229722913-7c0e2dbbafd3'),
    alt:      'Concert stage with dramatic lighting from the audience',
    position: 'center top',
  },
  {
    slug: 'vip-experiences',
    ...buildUrls('photo-1464822759023-fed622ff2c3b'),
    alt:      'Single figure at a mountain viewpoint',
    position: 'center center',
  },
]

export function getImagery(slug: string): CategoryImagery | null {
  return CATEGORY_IMAGERY.find(img => img.slug === slug) ?? null
}

// Server-only: reads concierge_images table and merges custom URLs over Unsplash defaults.
// Returns a Record<slug, CategoryImagery> with custom images applied where available.
export async function getImageryWithOverrides(): Promise<Record<string, CategoryImagery>> {
  const result: Record<string, CategoryImagery> = {}
  for (const img of CATEGORY_IMAGERY) {
    result[img.slug] = img
  }

  try {
    // Dynamic import keeps Prisma out of the client bundle
    const { prisma } = await import('@/lib/db')
    const rows = await prisma.$queryRawUnsafe<Array<{ slug: string; custom_url: string }>>(
      `SELECT slug, custom_url FROM concierge_images WHERE custom_url IS NOT NULL`,
    ).catch(() => [] as Array<{ slug: string; custom_url: string }>)

    for (const row of rows) {
      if (result[row.slug] && row.custom_url) {
        result[row.slug] = {
          ...result[row.slug],
          hero: row.custom_url,
          card: row.custom_url,
        }
      }
    }
  } catch {
    // DB unavailable — fall through with Unsplash defaults
  }

  return result
}
