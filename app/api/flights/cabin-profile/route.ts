import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULTS: Record<string, {
  label: string; headline: string; subheadline: string
  imageUrl: string; badgeText: string; badgeColor: string; features: string[]
}> = {
  ECONOMY: {
    label: 'Economy Class',
    headline: 'Comfortable travel at great value',
    subheadline: 'Everything you need for a great journey',
    imageUrl: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?w=1200&h=700&fit=crop&q=85',
    badgeText: 'Economy',
    badgeColor: '#6B7280',
    features: [
      'Ergonomic reclining seats',
      'Personal entertainment screen',
      'USB charging at every seat',
      'Complimentary meal service',
      '23kg checked baggage included',
      'Blanket & pillow on long-haul',
    ],
  },
  BUSINESS: {
    label: 'Business Class',
    headline: 'Where every flight feels like an arrival',
    subheadline: 'Flat-bed suites, fine dining and dedicated service',
    imageUrl: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=1200&h=700&fit=crop&q=85',
    badgeText: '★ Business',
    badgeColor: '#C9A84C',
    features: [
      'Lie-flat bed up to 78"',
      'Private suite with closing door',
      'Dedicated check-in & fast track',
      'Priority boarding',
      'Fine dining with sommelier service',
      'Noise-cancelling headphones',
      '32kg checked baggage (×2)',
      'Exclusive airport lounge access',
    ],
  },
  FIRST: {
    label: 'First Class',
    headline: 'An experience beyond the journey',
    subheadline: 'Private suites, personal butler and onboard shower spa',
    imageUrl: 'https://images.unsplash.com/photo-1559117207-f5157de3c88e?w=600&h=380&fit=crop&q=85',
    badgeText: '✦ First Class',
    badgeColor: '#0B1F3A',
    features: [
      'Private enclosed suite with sliding door',
      'Personal onboard butler',
      'Onboard shower spa',
      'Custom menu by Michelin-star chefs',
      '32kg checked baggage (×3)',
      'Chauffeur transfer to & from airport',
      'Most exclusive lounge access worldwide',
      'Bespoke pyjamas & luxury amenity kit',
    ],
  },
}

export async function GET(req: NextRequest) {
  const cabin = (req.nextUrl.searchParams.get('cabin') ?? 'ECONOMY').toUpperCase()
  const key = ['ECONOMY', 'BUSINESS', 'FIRST'].includes(cabin) ? cabin : 'ECONOMY'

  try {
    const row = await prisma.cabinProfile.findUnique({ where: { cabinClass: key } })
    if (row) {
      return NextResponse.json({
        cabinClass:  row.cabinClass,
        label:       row.label,
        headline:    row.headline,
        subheadline: row.subheadline,
        imageUrl:    row.imageUrl,
        badgeText:   row.badgeText,
        badgeColor:  row.badgeColor,
        features:    Array.isArray(row.features) ? row.features : [],
      })
    }
  } catch (err) {
    console.error('[cabin-profile] DB read error:', err)
  }

  return NextResponse.json({ cabinClass: key, ...DEFAULTS[key] })
}
