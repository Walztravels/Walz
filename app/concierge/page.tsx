import type { Metadata } from 'next'
import { getActiveCategories } from '@/lib/concierge/catalogue'
import { CATEGORY_IMAGERY, getImagery } from '@/lib/concierge/imagery'
import { ConciergePageClient } from '@/components/concierge/ConciergePageClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Walz Concierge — White-Glove Travel Services',
  description: 'Bespoke travel services handled by personal specialists. Private aviation, yacht charters, airport VIP, and more — all arranged by Jade.',
  alternates: { canonical: 'https://www.walztravels.com/concierge' },
  openGraph: {
    title: 'Walz Concierge — White-Glove Travel Services',
    description: 'Private aviation, yacht charters, airport VIP and more — arranged by your personal specialist.',
    url: 'https://www.walztravels.com/concierge',
    type: 'website',
    siteName: 'Walz Travels',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=75&auto=format&fit=crop',
        width: 1200,
        height: 630,
        alt: 'Intimate restaurant with warm evening light — Walz Concierge',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Walz Concierge — White-Glove Travel Services',
    description: 'Private aviation, yacht charters, airport VIP and more.',
  },
}

// Fallback services list — used when the DB is unavailable
const FALLBACK_SERVICES = [
  { slug: 'airport-services',      name: 'Airport Services',       description: 'Fast-track, meet & greet, lounge access, porter and VIP arrivals.' },
  { slug: 'executive-transport',   name: 'Executive Transport',     description: 'Chauffeur-driven cars, limousines and VIP fleet for any occasion.' },
  { slug: 'private-aviation',      name: 'Private Aviation',        description: 'Charter jets, turboprops and helicopter transfers worldwide.' },
  { slug: 'yacht-marine',          name: 'Yacht & Marine',          description: 'Superyacht, gulet and speedboat charters in any ocean.' },
  { slug: 'lifestyle-concierge',   name: 'Lifestyle Concierge',     description: 'Restaurant reservations, personal shopping, wellness retreats.' },
  { slug: 'tickets-entertainment', name: 'Tickets & Entertainment', description: 'VIP events, sports, concerts, F1 paddock and beyond.' },
  { slug: 'vip-experiences',       name: 'VIP Experiences',         description: 'Bespoke white-glove packages crafted around you.' },
]

export default async function ConciergePage() {
  const dbCategories = await getActiveCategories().catch(() => [])
  const categories   = dbCategories.length > 0 ? dbCategories : FALLBACK_SERVICES

  // Build a plain-object imagery lookup — Maps are not serialisable across
  // the server/client boundary, so we use Record<slug, CategoryImagery>.
  const allImagery: Record<string, typeof CATEGORY_IMAGERY[number]> = {}
  for (const img of CATEGORY_IMAGERY) {
    allImagery[img.slug] = img
  }

  // Hero imagery: lifestyle-concierge (warm, dark-capable)
  const heroImagery = getImagery('lifestyle-concierge')!

  return (
    <ConciergePageClient
      categories={categories.map(c => ({
        slug:        c.slug,
        name:        c.name,
        description: c.description ?? '',
      }))}
      heroImagery={heroImagery}
      allImagery={allImagery}
    />
  )
}
