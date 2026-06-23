'use client'

import Link from 'next/link'
import Image from 'next/image'

interface Props {
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
  total_seats: number | null
  seats_booked: number
  is_featured?: boolean
  index?: number
}

function flagEmoji(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return '🌍'
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  )
}

function packageTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    group: 'Group Departure',
    private: 'Private Journey',
    honeymoon: 'Honeymoon Escape',
    corporate: 'Corporate Travel',
  }
  return labels[type] ?? type.toUpperCase()
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=85'

export default function CinematicPackageCard({
  slug,
  title,
  destination,
  country_iso2,
  images,
  duration_days,
  duration_nights,
  price_per_person,
  currency,
  original_price,
  package_type,
  departure_date,
  total_seats,
  seats_booked,
  index,
}: Props) {
  const coverImage = images[0] || FALLBACK_IMAGE

  const remaining =
    total_seats !== null ? total_seats - seats_booked : null

  const saveDiff =
    original_price !== null ? original_price - price_per_person : null

  const showSaveBadge = saveDiff !== null && saveDiff > 0
  const showSeatsBadge =
    !showSaveBadge &&
    package_type === 'group' &&
    remaining !== null

  return (
    <Link href={`/packages/${slug}`}>
      <article
        className="group relative rounded-2xl overflow-hidden aspect-[4/5] sm:aspect-[3/4] max-h-[70vh] sm:max-h-none cursor-pointer select-none"
        style={{ animationDelay: `${(index ?? 0) * 100}ms` }}
      >
        {/* Image layer */}
        <Image
          src={coverImage}
          fill
          alt={title}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop' }}
        />

        {/* Permanent bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/60 to-[#0B1F3A]/10" />

        {/* Hover deepen overlay */}
        <div className="absolute inset-0 bg-[#0B1F3A] opacity-0 group-hover:opacity-30 transition-opacity duration-500" />

        {/* Top badges row */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          {/* Flag + destination badge */}
          <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white text-xs font-medium">
            {flagEmoji(country_iso2)} {destination}
          </span>

          {/* Right badge — save or seats */}
          {showSaveBadge && (
            <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              SAVE {currency} {saveDiff!.toLocaleString()}
            </span>
          )}

          {showSeatsBadge && remaining !== null && (
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                remaining <= 4
                  ? 'bg-red-600 text-white'
                  : 'bg-[#C9A84C] text-[#0B1F3A]'
              }`}
            >
              {remaining} SEATS LEFT
            </span>
          )}
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          {/* Eyebrow */}
          <p className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-[0.25em] mb-2">
            {packageTypeLabel(package_type)}
          </p>

          {/* Title */}
          <h3 className="font-display text-2xl lg:text-3xl text-white leading-tight font-bold mb-2">
            {title}
          </h3>

          {/* Meta row */}
          <p className="text-white/70 text-sm mb-3">
            {duration_days} Days
            {duration_nights ? ` · ${duration_nights} Nights` : ''}
            {departure_date
              ? ` · Departs ${formatShortDate(departure_date)}`
              : ''}
          </p>

          {/* Price row */}
          <div className="flex items-baseline gap-2">
            {original_price !== null && (
              <span className="text-white/40 text-sm line-through">
                {currency} {original_price.toLocaleString()}
              </span>
            )}
            <span className="text-[#C9A84C] text-xl font-bold">
              From {currency} {price_per_person.toLocaleString()}
            </span>
            <span className="text-white/60 text-xs">per person</span>
          </div>

          {/* Hover reveal — slides up */}
          <div className="max-h-0 opacity-0 group-hover:max-h-16 group-hover:opacity-100 transition-all duration-500 ease-out overflow-hidden">
            <div className="flex items-center gap-2 text-white text-sm font-medium mt-3 w-fit border-b border-[#C9A84C] pb-1">
              Explore Package
              <svg
                className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Gold bottom accent line */}
        <div className="absolute bottom-0 left-0 h-[3px] bg-[#C9A84C] w-0 group-hover:w-full transition-all duration-700 ease-out" />
      </article>
    </Link>
  )
}
