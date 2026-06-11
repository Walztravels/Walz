'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CinematicPackageCard from '@/components/CinematicPackageCard'

interface FeaturedPackage {
  id: string
  slug: string
  title: string
  destination: string
  country_iso2: string | null
  tagline: string | null
  images: string[]
  price_per_person: number
  original_price: number | null
  currency: string
  duration_days: number
  duration_nights: number | null
  total_seats: number | null
  seats_booked: number
  departure_date: string | null
  package_type: string
  is_featured: boolean
}

const FALLBACK_PACKAGES: FeaturedPackage[] = [
  {
    id: 'f1',
    slug: 'dubai-group-december-2026',
    title: 'Dubai Group Escape — December 2026',
    destination: 'Dubai, UAE',
    country_iso2: 'AE',
    tagline: '5 nights of luxury, desert and skyline',
    images: [
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=85',
    ],
    price_per_person: 1850,
    original_price: 2100,
    currency: 'USD',
    duration_days: 6,
    duration_nights: 5,
    total_seats: 20,
    seats_booked: 7,
    departure_date: '2026-12-10',
    package_type: 'group',
    is_featured: true,
  },
  {
    id: 'f2',
    slug: 'london-group-february-2027',
    title: 'London City Break — February 2027',
    destination: 'London, UK',
    country_iso2: 'GB',
    tagline: '7 nights in the heart of London',
    images: [
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=85',
    ],
    price_per_person: 2100,
    original_price: 2400,
    currency: 'GBP',
    duration_days: 8,
    duration_nights: 7,
    total_seats: 18,
    seats_booked: 4,
    departure_date: '2027-02-05',
    package_type: 'group',
    is_featured: false,
  },
  {
    id: 'f3',
    slug: 'zanzibar-honeymoon-special',
    title: 'Zanzibar Honeymoon Escape',
    destination: 'Zanzibar, Tanzania',
    country_iso2: 'TZ',
    tagline: 'Pristine beaches and overwater romance',
    images: [
      'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?w=800&q=85',
    ],
    price_per_person: 2800,
    original_price: null,
    currency: 'USD',
    duration_days: 9,
    duration_nights: 8,
    total_seats: null,
    seats_booked: 0,
    departure_date: null,
    package_type: 'honeymoon',
    is_featured: false,
  },
  {
    id: 'f4',
    slug: 'paris-romance-getaway',
    title: 'Paris Romance Getaway',
    destination: 'Paris, France',
    country_iso2: 'FR',
    tagline: 'Romance, cuisine and timeless elegance',
    images: [
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=85',
    ],
    price_per_person: 1650,
    original_price: null,
    currency: 'EUR',
    duration_days: 5,
    duration_nights: 4,
    total_seats: null,
    seats_booked: 0,
    departure_date: null,
    package_type: 'private',
    is_featured: false,
  },
  {
    id: 'f5',
    slug: 'toronto-group-october-2026',
    title: 'Toronto City Explorer',
    destination: 'Toronto, Canada',
    country_iso2: 'CA',
    tagline: 'Vibrant city with diverse culture',
    images: [
      'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=85',
    ],
    price_per_person: 1950,
    original_price: null,
    currency: 'USD',
    duration_days: 7,
    duration_nights: 6,
    total_seats: null,
    seats_booked: 0,
    departure_date: null,
    package_type: 'group',
    is_featured: false,
  },
  {
    id: 'f6',
    slug: 'new-york-city-experience',
    title: 'New York City Experience',
    destination: 'New York, USA',
    country_iso2: 'US',
    tagline: 'The city that never sleeps',
    images: [
      'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=85',
    ],
    price_per_person: 2200,
    original_price: null,
    currency: 'USD',
    duration_days: 7,
    duration_nights: 6,
    total_seats: null,
    seats_booked: 0,
    departure_date: null,
    package_type: 'private',
    is_featured: false,
  },
]

function safeImages(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

export default function TopSellers() {
  const [packages, setPackages] =
    useState<FeaturedPackage[]>(FALLBACK_PACKAGES)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/packages/featured')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: FeaturedPackage[]) => {
        const mapped = data.map((p) => ({ ...p, images: safeImages(p.images) }))
        const filled =
          mapped.length >= 6
            ? mapped.slice(0, 6)
            : [...mapped, ...FALLBACK_PACKAGES.slice(mapped.length)]
        setPackages(filled)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  return (
    <section className="py-24 lg:py-32 bg-[#FAF7F2]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12 lg:mb-16 gap-6">
          <div>
            <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.3em] mb-3">
              Top Selling Packages
            </p>
            <h2 className="font-display text-4xl lg:text-5xl text-[#0B1F3A] font-bold leading-tight mb-3">
              Popular Destinations
            </h2>
            <p className="text-gray-500 text-base max-w-md">
              Our best-selling escapes — visa, flights and hotel handled.
            </p>
          </div>
          <Link
            href="/packages"
            className="hidden md:inline-flex items-center gap-2 font-semibold text-[#0B1F3A] border-b-2 border-[#C9A84C] pb-1 hover:text-[#C9A84C] transition-colors whitespace-nowrap self-end text-sm"
          >
            View All Packages →
          </Link>
        </div>

        {/* Grid — 3×2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg, i) => (
            <div
              key={pkg.id}
              className={`transition-all duration-700 ${
                loaded
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <CinematicPackageCard {...pkg} images={pkg.images} index={i} />
            </div>
          ))}
        </div>

        {/* Mobile CTA */}
        <div className="mt-10 md:hidden text-center">
          <Link
            href="/packages"
            className="inline-block w-full max-w-sm px-8 py-4 rounded-2xl border-2 border-[#0B1F3A] text-[#0B1F3A] font-bold text-sm hover:bg-[#0B1F3A] hover:text-white transition-colors"
          >
            View All Packages
          </Link>
        </div>

      </div>
    </section>
  )
}
