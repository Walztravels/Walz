import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import prisma from '@/lib/db'
import { PackageFilters } from '@/components/PackageFilters'
import FeaturedDepartureSlider, { type SpotlightPackage } from '@/components/FeaturedDepartureSlider'

export const revalidate = 60

export const metadata: Metadata = {
  title: { absolute: 'Travel Packages | Walz Travels' },
  description:
    'Group tours and holiday packages from Lagos and Accra. Flights, visas, hotels and tours included. Dubai, London, Zanzibar and more.',
  alternates: { canonical: 'https://www.walztravels.com/packages' },
  openGraph: {
    title: 'Travel Packages | Walz Travels',
    description:
      'Group tours and holiday packages from Lagos and Accra. Flights, visas, hotels and tours included.',
  },
}

export interface PackageCard {
  id: string
  slug: string
  title: string
  destination: string
  country_iso2: string | null
  tagline: string | null
  images: string[]
  duration_days: number
  duration_nights: number | null
  price_per_person: number
  currency: string
  original_price: number | null
  package_type: string
  departure_date: string | null
  departure_city: string | null
  total_seats: number | null
  seats_booked: number
  visa_included: boolean
  flight_included: boolean
  hotel_included: boolean
  meals: string | null
  is_featured: boolean
}

const FALLBACK_PACKAGES: PackageCard[] = [
  {
    id: 'f1',
    slug: 'dubai-group-december-2026',
    title: 'Dubai Group Escape — December 2026',
    destination: 'Dubai, UAE',
    country_iso2: 'AE',
    tagline: '5 nights of luxury, desert and skyline',
    images: ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=85'],
    duration_days: 6,
    duration_nights: 5,
    price_per_person: 1850,
    currency: 'USD',
    original_price: 2100,
    package_type: 'group',
    departure_date: '2026-12-10',
    departure_city: 'Lagos',
    total_seats: 20,
    seats_booked: 7,
    visa_included: true,
    flight_included: true,
    hotel_included: true,
    meals: 'Breakfast daily',
    is_featured: true,
  },
  {
    id: 'f2',
    slug: 'london-group-february-2027',
    title: 'London City Break — February 2027',
    destination: 'London, UK',
    country_iso2: 'GB',
    tagline: '7 nights exploring the best of London',
    images: ['https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=85'],
    duration_days: 8,
    duration_nights: 7,
    price_per_person: 2100,
    currency: 'GBP',
    original_price: 2400,
    package_type: 'group',
    departure_date: '2027-02-05',
    departure_city: 'Lagos',
    total_seats: 18,
    seats_booked: 4,
    visa_included: true,
    flight_included: true,
    hotel_included: true,
    meals: 'Breakfast daily',
    is_featured: false,
  },
  {
    id: 'f3',
    slug: 'zanzibar-honeymoon-special',
    title: 'Zanzibar Honeymoon Escape',
    destination: 'Zanzibar, Tanzania',
    country_iso2: 'TZ',
    tagline: 'Overwater villas and private beaches',
    images: ['https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?w=800&q=85'],
    duration_days: 9,
    duration_nights: 8,
    price_per_person: 2800,
    currency: 'USD',
    original_price: null,
    package_type: 'honeymoon',
    departure_date: null,
    departure_city: null,
    total_seats: null,
    seats_booked: 0,
    visa_included: false,
    flight_included: true,
    hotel_included: true,
    meals: 'All-inclusive',
    is_featured: false,
  },
]

function safeJsonImages(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function PackagesPage() {
  let packages: PackageCard[] = []
  let spotlight: SpotlightPackage[] = []

  try {
    const [pkgRows, spotRows] = await Promise.all([
      prisma.$queryRawUnsafe<PackageCard[]>(
        `SELECT id, slug, title, destination, country_iso2, tagline, images,
                duration_days, duration_nights, price_per_person, currency,
                original_price, package_type, departure_date, departure_city,
                total_seats, seats_booked, visa_included, flight_included,
                hotel_included, meals, is_featured
         FROM travel_packages
         WHERE is_active = true
         ORDER BY is_featured DESC, display_order ASC, created_at DESC`,
      ),
      prisma.$queryRawUnsafe<SpotlightPackage[]>(
        `SELECT id, slug, title, destination, country_iso2, tagline, images,
                price_per_person, original_price, currency, duration_days,
                duration_nights, departure_date, departure_city, total_seats,
                seats_booked, package_type, visa_included, flight_included,
                hotel_included
         FROM travel_packages
         WHERE is_active = true AND is_spotlight = true
         ORDER BY departure_date ASC NULLS LAST
         LIMIT 5`,
      ),
    ])
    packages = pkgRows.map((p) => ({ ...p, images: safeJsonImages(p.images) }))
    spotlight = spotRows.map((p) => ({ ...p, images: safeJsonImages(p.images) })) as SpotlightPackage[]
  } catch {
    // DB unavailable — use fallbacks
  }

  if (packages.length === 0) {
    packages = FALLBACK_PACKAGES
  }

  const featuredHero =
    (spotlight[0]?.images[0] ?? packages.find(p => p.is_featured)?.images[0]) ??
    'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=85'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>

      {/* ── CINEMATIC HERO ── */}
      <section className="relative h-[60vh] min-h-[480px] overflow-hidden">
        <Image
          src={featuredHero}
          fill
          priority
          sizes="100vw"
          alt="Walz Travels Packages"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/50 to-[#0B1F3A]/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 lg:pb-24">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.3em] mb-4">
            Walz Travels Packages
          </p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl text-white font-bold leading-tight max-w-3xl mb-5">
            Journeys, <br />Perfected.
          </h1>
          <p className="text-white/75 text-lg max-w-xl leading-relaxed">
            Group departures and private escapes — visa, flights, hotels and experiences in one seamless price.
          </p>
        </div>
      </section>

      {/* ── FEATURED DEPARTURE SLIDER ── */}
      <div className="relative z-10 mt-6 lg:-mt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FeaturedDepartureSlider initialPackages={spotlight} />
      </div>

      {/* ── FILTER + GRID ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <PackageFilters packages={packages} />
      </section>

      {/* ── CTA BANNER ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #0D2845 100%)' }}
        >
          <div
            className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5 pointer-events-none"
            style={{ background: '#C9A84C', transform: 'translate(30%, -30%)' }}
          />
          <div className="relative p-10 lg:p-16 text-center max-w-2xl mx-auto">
            <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.3em] mb-4">
              Bespoke Packages
            </p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
              Don&apos;t see your destination?
            </h2>
            <p className="text-white/60 text-base max-w-lg mx-auto mb-8">
              We design fully bespoke packages to any destination worldwide — your dates, your group size, your budget.
            </p>
            <a
              href="https://wa.me/447398753797?text=Hi!%20I%20want%20to%20enquire%20about%20a%20custom%20travel%20package."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-sm transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Build My Custom Package
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
