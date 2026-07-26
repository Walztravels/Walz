'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { CategoryImagery } from '@/lib/concierge/imagery'

// Fallback icon map for when imagery is unavailable
const ICON_MAP: Record<string, string> = {
  'airport-services':      '✈',
  'executive-transport':   '🚗',
  'private-aviation':      '🛩',
  'yacht-marine':          '⛵',
  'lifestyle-concierge':   '✨',
  'tickets-entertainment': '🎭',
  'vip-experiences':       '👑',
}

interface CategoryTileProps {
  slug:        string
  name:        string
  description: string
  imagery:     CategoryImagery | null
  priority?:   boolean
}

export function CategoryTile({
  slug,
  name,
  description,
  imagery,
  priority = false,
}: CategoryTileProps) {
  const icon = ICON_MAP[slug] ?? '✦'

  return (
    <Link
      href={`/concierge/${slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10
        aspect-[4/5] sm:aspect-[3/4]
        hover:border-[#C9A84C]/60 transition-all duration-700
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]
        focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
    >
      {/* Background */}
      {imagery ? (
        <div className="absolute inset-0 will-change-transform">
          <Image
            src={imagery.card}
            alt={imagery.alt}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            style={{ objectPosition: imagery.position }}
          />
        </div>
      ) : (
        /* No-image fallback: dark navy gradient + emoji icon */
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background:
              'linear-gradient(135deg, #0F2340 0%, #1C3557 60%, #0B1F3A 100%)',
          }}
        >
          <span
            aria-hidden="true"
            className="text-6xl opacity-20 select-none"
          >
            {icon}
          </span>
        </div>
      )}

      {/* Bottom-up gradient overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(11,31,58,0.96) 0%, rgba(11,31,58,0.55) 45%, rgba(11,31,58,0.10) 100%)',
        }}
      />

      {/* Content — pinned to bottom */}
      <div className="relative mt-auto px-5 pb-5 pt-16 z-10">
        <h3 className="font-display text-2xl font-bold text-white leading-tight mb-1.5">
          {name}
        </h3>
        <p className="text-white/60 text-sm leading-snug line-clamp-2 mb-3">
          {description}
        </p>

        {/* Arrow indicator */}
        <span
          aria-hidden="true"
          className="inline-block text-[#C9A84C] text-base font-semibold
            translate-x-0 group-hover:translate-x-1.5 transition-transform duration-300"
        >
          →
        </span>
      </div>
    </Link>
  )
}
