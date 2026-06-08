'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

const DESTINATIONS = [
  { name: 'London',      href: '/visa/uk',       img: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80', span: 'col-span-2 row-span-2' },
  { name: 'Dubai',       href: '/visa/uae',      img: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80', span: 'col-span-1 row-span-1' },
  { name: 'Toronto',     href: '/visa/canada',   img: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=600&q=80', span: 'col-span-1 row-span-1' },
  { name: 'Paris',       href: '/visa/schengen', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80', span: 'col-span-1 row-span-2' },
  { name: 'New York',    href: '/visa/usa',      img: 'https://images.unsplash.com/photo-1499092346302-2a6d82e0d6e5?w=600&q=80', span: 'col-span-1 row-span-1' },
  { name: 'Amsterdam',   href: '/visa/schengen', img: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=600&q=80', span: 'col-span-1 row-span-1' },
  { name: 'Maldives',    href: '/visa#checker',  img: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&q=80', span: 'col-span-2 row-span-1' },
  { name: 'Singapore',   href: '/visa#checker',  img: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=600&q=80', span: 'col-span-1 row-span-1' },
]

export function DestinationsGrid() {
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const items = gridRef.current?.children
    if (!items) return

    gsap.from(Array.from(items), {
      opacity: 0,
      y: 50,
      duration: 0.9,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: gridRef.current,
        start: 'top 82%',
        once: true,
      },
    })
  }, [])

  return (
    <section className="bg-white py-20 lg:py-28 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-3">
              Explore the World
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(2rem,4vw,3.2rem)] leading-tight">
              Popular Destinations
            </h2>
          </div>
          <Link href="/visa" className="hidden md:flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] border-b border-[#0B1F3A]/20 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors pb-0.5">
            View all destinations
          </Link>
        </div>

        {/* Masonry-style grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-2 md:grid-cols-4 auto-rows-[200px] gap-3 lg:gap-4"
        >
          {DESTINATIONS.map((dest) => (
            <Link
              key={dest.name}
              href={dest.href}
              className={`group relative rounded-2xl overflow-hidden ${dest.span}`}
              data-cursor="EXPLORE"
            >
              <Image
                src={dest.img}
                alt={dest.name}
                fill
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
                loading="lazy"
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              {/* Name */}
              <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                <p className="text-white font-bold text-base">{dest.name}</p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </section>
  )
}
