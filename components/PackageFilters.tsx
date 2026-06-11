'use client'

import { useState } from 'react'
import CinematicPackageCard from '@/components/CinematicPackageCard'
import type { PackageCard } from '@/app/packages/page'

// ── Filter config ─────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'group' | 'honeymoon' | 'private' | 'corporate'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All Packages' },
  { key: 'group', label: 'Group Tours' },
  { key: 'honeymoon', label: 'Honeymoon' },
  { key: 'private', label: 'Private' },
  { key: 'corporate', label: 'Corporate' },
]

// ── Main component ────────────────────────────────────────────────────────────

export function PackageFilters({ packages }: { packages: PackageCard[] }) {
  const [active, setActive] = useState<FilterKey>('all')

  const filtered =
    active === 'all' ? packages : packages.filter((p) => p.package_type === active)

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide sm:flex-wrap sm:overflow-visible mb-10">
        {FILTERS.map(({ key, label }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className="px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all cursor-pointer"
              style={
                isActive
                  ? { backgroundColor: '#C9A84C', borderColor: '#C9A84C', color: '#0B1F3A' }
                  : { backgroundColor: 'transparent', borderColor: '#0B1F3A', color: '#0B1F3A' }
              }
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Package grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-xl font-bold text-[#0B1F3A] mb-2">
            No packages found
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Try a different filter or enquire for a custom package.
          </p>
          <a
            href="https://wa.me/447398753797?text=Hi!%20I%20want%20to%20enquire%20about%20a%20custom%20travel%20package."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm cursor-pointer transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
          >
            Enquire on WhatsApp
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((pkg, i) => (
            <CinematicPackageCard
              key={pkg.id}
              id={pkg.id}
              slug={pkg.slug}
              title={pkg.title}
              destination={pkg.destination}
              country_iso2={pkg.country_iso2}
              tagline={pkg.tagline}
              images={pkg.images}
              duration_days={pkg.duration_days}
              duration_nights={pkg.duration_nights}
              price_per_person={pkg.price_per_person}
              currency={pkg.currency}
              original_price={pkg.original_price}
              package_type={pkg.package_type}
              departure_date={pkg.departure_date}
              total_seats={pkg.total_seats}
              seats_booked={pkg.seats_booked}
              is_featured={pkg.is_featured}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}

