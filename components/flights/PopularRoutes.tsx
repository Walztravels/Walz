'use client'

import { useState, useEffect } from 'react'

function futureDate(daysFromNow: number): Date {
  const d = new Date(); d.setDate(d.getDate() + daysFromNow); return d
}
function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function displayDate(d: Date) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
function routeHref(from: string, to: string, daysOut: number, duration: number) {
  const dep = futureDate(daysOut), ret = futureDate(daysOut + duration)
  return `/flights/search?from=${from}&to=${to}&depart=${isoDate(dep)}&return=${isoDate(ret)}&trip=round-trip&cabin=ECONOMY&adults=1&children=0`
}
function routeDates(daysOut: number, duration: number) {
  return `${displayDate(futureDate(daysOut))} – ${displayDate(futureDate(daysOut + duration))}`
}

const ROUTES = [
  {
    from: 'LHR', fromCity: 'London',
    to: 'LOS',   toCity: 'Lagos',
    price: 680, currency: 'GBP',
    badge: 'Best Seller', badgeColor: '#C9A84C', daysOut: 30, duration: 10,
    image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&h=560&fit=crop&q=85',
    desc: 'Multiple airlines daily',
  },
  {
    from: 'LHR', fromCity: 'London',
    to: 'DXB',   toCity: 'Dubai',
    price: 280, currency: 'GBP',
    badge: 'Hot Deal', badgeColor: '#EF4444', daysOut: 35, duration: 7,
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&h=560&fit=crop&q=85',
    desc: 'Emirates & flydubai',
  },
  {
    from: 'LHR', fromCity: 'London',
    to: 'JFK',   toCity: 'New York',
    price: 380, currency: 'GBP',
    badge: 'Popular', badgeColor: '#3B82F6', daysOut: 90, duration: 7,
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&h=560&fit=crop&q=85',
    desc: 'BA, Virgin & more',
  },
  {
    from: 'LHR', fromCity: 'London',
    to: 'ACC',   toCity: 'Accra',
    price: 620, currency: 'GBP',
    badge: 'Direct', badgeColor: '#10B981', daysOut: 60, duration: 10,
    image: 'https://images.unsplash.com/photo-1528277342758-f1d7613953a2?w=800&h=560&fit=crop&q=85',
    desc: 'British Airways direct',
  },
  {
    from: 'YYZ', fromCity: 'Toronto',
    to: 'LOS',   toCity: 'Lagos',
    price: 750, currency: 'CAD',
    badge: 'Popular', badgeColor: '#3B82F6', daysOut: 45, duration: 14,
    image: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&h=560&fit=crop&q=85',
    desc: 'Via London or Doha',
  },
  {
    from: 'LHR', fromCity: 'London',
    to: 'NBO',   toCity: 'Nairobi',
    price: 520, currency: 'GBP',
    badge: 'New', badgeColor: '#8B5CF6', daysOut: 120, duration: 12,
    image: 'https://images.unsplash.com/photo-1611348524140-53c9a25263d6?w=800&h=560&fit=crop&q=85',
    desc: 'Kenya Airways & BA',
  },
]

type Route = typeof ROUTES[number]

export function PopularRoutes() {
  const [hovered, setHovered] = useState<string | null>(null)
  const [routes,  setRoutes]  = useState<Route[]>(ROUTES)

  useEffect(() => {
    fetch('/api/public/popular-routes')
      .then(r => r.ok ? r.json() : null)
      .then((d: { routes?: Route[] } | null) => {
        if (d?.routes && Array.isArray(d.routes) && d.routes.length > 0) setRoutes(d.routes)
      })
      .catch(() => {})
  }, [])

  return (
    <section id="popular-routes" className="bg-white py-20 lg:py-28 px-5 sm:px-8">
      <div className="container-walz">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.3em] uppercase mb-3">Our Most Booked</p>
            <h2 className="font-display text-4xl lg:text-5xl font-bold text-[#0B1F3A] leading-tight">
              Popular Routes
            </h2>
            <p className="text-[#0B1F3A]/40 text-sm mt-2">Hand-picked from our most booked destinations</p>
          </div>
          <a href="/flights/search?from=LHR&to=LOS&adults=1&cabin=ECONOMY&trip=one-way"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] hover:text-[#C9A84C] transition-colors group">
            All routes
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>

        {/* Uniform 3×2 grid — all cards same height */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {routes.map((route) => {
            const key = `${route.from}-${route.to}`
            const isHovered = hovered === key
            return (
              <a
                key={key}
                href={routeHref(route.from, route.to, route.daysOut, route.duration)}
                className="relative rounded-2xl overflow-hidden block cursor-pointer group"
                style={{ height: '320px' }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Photo */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={route.image}
                  alt={`${route.fromCity} to ${route.toCity}`}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
                  style={{ transform: isHovered ? 'scale(1.06)' : 'scale(1)' }}
                  loading="lazy"
                />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

                {/* Badge */}
                <div className="absolute top-4 left-4">
                  <span className="text-[10px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: `${route.badgeColor}25`,
                      color: route.badgeColor,
                      border: `1px solid ${route.badgeColor}45`,
                      backdropFilter: 'blur(8px)',
                    }}>
                    {route.badge}
                  </span>
                </div>

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <p className="text-white/50 text-xs mb-0.5">{route.fromCity}</p>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-display text-2xl font-bold text-white leading-none">{route.toCity}</p>
                    <svg className={`w-4 h-4 text-[#C9A84C] transition-transform duration-300 ${isHovered ? 'translate-x-1' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  <p className="text-white/35 text-[11px] mb-4">{route.desc} · {routeDates(route.daysOut, route.duration)}</p>

                  <div className={`flex items-center justify-between py-2.5 px-4 rounded-xl transition-all duration-300 ${isHovered ? 'bg-[#C9A84C]' : 'bg-white/10 backdrop-blur-sm'}`}>
                    <div>
                      <p className={`text-[10px] transition-colors ${isHovered ? 'text-[#0B1F3A]/60' : 'text-white/40'}`}>From</p>
                      <p className={`font-display text-lg font-bold leading-none transition-colors ${isHovered ? 'text-[#0B1F3A]' : 'text-white'}`}>
                        {route.currency === 'CAD' ? 'CA$' : '£'}{route.price}
                      </p>
                    </div>
                    <span className={`text-xs font-bold transition-colors ${isHovered ? 'text-[#0B1F3A]' : 'text-white/70'}`}>
                      Book now →
                    </span>
                  </div>
                </div>
              </a>
            )
          })}
        </div>

        {/* Mobile view all */}
        <div className="mt-8 text-center sm:hidden">
          <a href="/flights/search?from=LHR&to=LOS&adults=1&cabin=ECONOMY&trip=one-way"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#0B1F3A]/15 text-sm font-semibold text-[#0B1F3A] hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all">
            View all routes →
          </a>
        </div>
      </div>
    </section>
  )
}
