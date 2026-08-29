import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { viatorPost } from '@/lib/activities/providers/viator/client'
import { mapViatorProduct } from '@/lib/activities/providers/viator/mapper'
import type { ViatorProductSummary } from '@/lib/activities/providers/viator/types'

export const dynamic = 'force-dynamic'

// /products/bulk returns a single product when called with one code.
// Typing matches the existing getProduct() pattern in ViatorActivityProvider.
interface ViatorBulkResponse {
  product?: ViatorProductSummary
  products?: ViatorProductSummary[]
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Config guard ─────────────────────────────────────────────────────────────
  if (!process.env.VIATOR_API_KEY) {
    return NextResponse.json({ error: 'Viator API not configured' }, { status: 503 })
  }

  // ── Input validation ─────────────────────────────────────────────────────────
  const body = await req.json() as { productCode?: string }
  const productCode = (body.productCode ?? '').trim()
  if (!productCode) {
    return NextResponse.json({ error: 'productCode is required' }, { status: 400 })
  }

  // ── Fetch product detail from Viator ─────────────────────────────────────────
  try {
    const { status, data } = await viatorPost<ViatorBulkResponse>('/products/bulk', {
      productCodes: [productCode],
      currency:     'USD',
    })

    if (status !== 200) {
      return NextResponse.json({ error: `Viator returned ${status}` }, { status: 502 })
    }

    // Handle both singular and plural response shapes
    const product = data.product ?? data.products?.[0]
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const normalized = mapViatorProduct(product, '', 'USD')

    const images      = normalized.images.map(img => img.url).filter(Boolean)
    const heroImageUrl = normalized.images.find(img => img.isCover)?.url
      ?? normalized.images[0]?.url
      ?? null

    // Return ONLY image URLs — no pricing, cost, commission, or supplier credentials
    return NextResponse.json({
      images,
      heroImageUrl,
    })
  } catch (err) {
    console.error('[walz-activity-images] Failed to fetch product images', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to fetch images from Viator' }, { status: 502 })
  }
}
