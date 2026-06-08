'use client'

import { useRef } from 'react'

const ITEMS = [
  'Flights',
  'Visa Processing',
  'Private Tours',
  'Hotel Reservations',
  'Corporate Travel',
  'Group Packages',
  'Travel Insurance',
  'Airport Transfers',
  '24/7 Support',
]

export function MarqueeStrip() {
  const trackRef = useRef<HTMLDivElement>(null)

  return (
    <div className="w-full bg-[#0B1F3A] py-4 overflow-hidden select-none">
      <div
        className="flex items-center gap-0 group"
        style={{ width: 'max-content' }}
      >
        {/* Two copies for seamless loop */}
        {[0, 1].map(copy => (
          <div
            key={copy}
            ref={copy === 0 ? trackRef : undefined}
            className="flex items-center gap-0 animate-marquee group-hover:[animation-play-state:paused]"
            aria-hidden={copy === 1}
          >
            {ITEMS.map((item) => (
              <span
                key={item}
                className="flex items-center gap-5 text-[#C9A84C] text-xs font-semibold tracking-[0.18em] uppercase whitespace-nowrap px-8"
              >
                {item}
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/40 flex-shrink-0" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
