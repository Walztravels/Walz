import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { viatorPost } from '@/lib/activities/providers/viator/client'
import { mapViatorProduct } from '@/lib/activities/providers/viator/mapper'
import { resolveViatorDestId } from '@/lib/activities/providers/viator/destinations'
import type { ViatorProductSummary, ViatorProductSearchResponse } from '@/lib/activities/providers/viator/types'

export const dynamic = 'force-dynamic'

export type ActivitySearchResult = {
  productCode: string
  title: string
  location: string
  supplier: 'VIATOR'
  heroImageUrl: string | null
  thumbImageUrl: string | null
  allImageUrls: string[]
}

// Viator /search/freetext response envelope
interface ViatorFreetextResponse {
  products?: {
    results?: ViatorProductSummary[]
    totalCount?: number
  }
  message?: string
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Config guards ────────────────────────────────────────────────────────────
  if (!process.env.VIATOR_API_KEY) {
    return NextResponse.json({ error: 'Viator API not configured' }, { status: 503 })
  }
  if (process.env.VIATOR_ACTIVITIES_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Viator activities not enabled' }, { status: 503 })
  }

  // ── Input validation ─────────────────────────────────────────────────────────
  const body = await req.json() as { query?: string; location?: string }
  const query    = (body.query    ?? '').trim()
  const location = (body.location ?? '').trim()

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const searchTerm = location ? `${query} ${location}` : query

  let products: ViatorProductSummary[] = []

  // ── Primary: freetext search ─────────────────────────────────────────────────
  try {
    const { status, data } = await viatorPost<ViatorFreetextResponse>('/search/freetext', {
      searchTerm,
      searchTypes: [{ searchType: 'PRODUCTS', pagination: { offset: 0, limit: 10 } }],
    })

    if (status === 200 && data.products?.results?.length) {
      products = data.products.results
    }
  } catch (err) {
    console.warn(
      '[search-walz-activities] Freetext search failed, trying destination fallback',
      err instanceof Error ? err.message : err,
    )
  }

  // ── Fallback: destination-based search filtered by query text ─────────────────
  if (products.length === 0) {
    const destLookup = location || query
    try {
      const destId = resolveViatorDestId(destLookup)
      if (destId) {
        const { status, data } = await viatorPost<ViatorProductSearchResponse>('/products/search', {
          filtering:  { destination: destId },
          pagination: { start: 1, count: 40 },
          currency:   'GBP',
        })
        if (status === 200 && data.products?.length) {
          // Score by how many query words appear in the title
          const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
          const scored = data.products.map(p => {
            const titleLower = p.title.toLowerCase()
            const score = queryWords.filter(w => titleLower.includes(w)).length
            return { p, score }
          })
          const matched = scored
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ p }) => p)
          // If no word matches at all, return first 10 from destination (better than nothing)
          products = (matched.length > 0 ? matched : data.products).slice(0, 10)
        }
      }
    } catch (err) {
      console.warn(
        '[search-walz-activities] Destination fallback also failed',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // ── Map to public-safe shape (no pricing / cost / commission data) ────────────
  const activities: ActivitySearchResult[] = products.map(product => {
    const normalized = mapViatorProduct(product, location || 'Unknown', 'GBP')

    const coverImage  = normalized.images.find(img => img.isCover) ?? normalized.images[0]
    const secondImage = normalized.images.find((img, i) => i === 1)
    const allImageUrls = normalized.images.map(img => img.url)

    const heroImageUrl  = coverImage?.url  ?? null
    const thumbImageUrl = secondImage?.url ?? heroImageUrl

    return {
      productCode:  product.productCode,
      title:        product.title,
      location:     normalized.location?.address ?? location,
      supplier:     'VIATOR',
      heroImageUrl,
      thumbImageUrl,
      allImageUrls,
    }
  })

  return NextResponse.json({ activities })
}
