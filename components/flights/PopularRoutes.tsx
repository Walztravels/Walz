'use client'

import { formatPrice } from '@/lib/flights/utils'

function futureDate(daysFromNow: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getRouteHref(from: string, to: string, daysOut: number, duration: number): string {
  const dep = futureDate(daysOut)
  const ret = futureDate(daysOut + duration)
  return `/flights/search?from=${from}&to=${to}&depart=${isoDate(dep)}&return=${isoDate(ret)}&trip=round-trip&cabin=ECONOMY&adults=1&children=0`
}

function getRouteDates(daysOut: number, duration: number): string {
  return `${displayDate(futureDate(daysOut))} – ${displayDate(futureDate(daysOut + duration))}`
}

const ROUTES = [
  { from: 'LHR', fromCity: 'London',  to: 'LOS', toCity: 'Lagos',    price: 680,  currency: 'GBP', label: 'Hot Deal', daysOut: 30,  duration: 10, image: '🇳🇬', span2: true  },
  { from: 'YYZ', fromCity: 'Toronto', to: 'LOS', toCity: 'Lagos',    price: 750,  currency: 'CAD', label: 'Popular',  daysOut: 45,  duration: 14, image: '🇳🇬', span2: false },
  { from: 'LHR', fromCity: 'London',  to: 'ACC', toCity: 'Accra',    price: 620,  currency: 'GBP', label: 'Direct',   daysOut: 60,  duration: 10, image: '🇬🇭', span2: false },
  { from: 'LHR', fromCity: 'London',  to: 'DXB', toCity: 'Dubai',    price: 280,  currency: 'GBP', label: 'Hot Deal', daysOut: 35,  duration: 7,  image: '🇦🇪', span2: false },
  { from: 'LHR', fromCity: 'London',  to: 'JFK', toCity: 'New York', price: 380,  currency: 'GBP', label: 'Popular',  daysOut: 90,  duration: 7,  image: '🇺🇸', span2: false },
  { from: 'YYZ', fromCity: 'Toronto', to: 'ACC', toCity: 'Accra',    price: 890,  currency: 'CAD', label: 'New',      daysOut: 120, duration: 14, image: '🇬🇭', span2: false },
]

const LABEL_STYLE: Record<string, string> = {
  'Hot Deal': 'bg-red-100 text-red-700',
  'Direct':   'bg-blue-100 text-blue-700',
  'New':      'bg-purple-100 text-purple-700',
  'Popular':  'bg-[#C9A84C]/15 text-[#8B6914]',
}

export function PopularRoutes() {
  return (
    <section id="popular-routes" className="py-16 lg:py-20 px-5 sm:px-8 bg-[#FAF7F2]">
      <div className="container-walz">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold tracking-[0.2em] uppercase mb-2">Featured Flights</p>
            <h2 className="font-display text-3xl font-bold text-[#0B1F3A]">Popular routes</h2>
            <p className="text-[#0B1F3A]/50 text-sm mt-1">Hand-picked from our most booked routes</p>
          </div>
          <a href="/flights" className="text-sm font-semibold text-[#C9A84C] hover:underline hidden sm:block">
            View all routes →
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ROUTES.map((route, i) => (
            <a key={`${route.from}-${route.to}-${i}`}
              href={getRouteHref(route.from, route.to, route.daysOut, route.duration)}
              className={`group relative rounded-2xl overflow-hidden bg-white border border-black/5 hover:shadow-xl hover:-translate-y-1 transition-all duration-200${route.span2 ? ' sm:col-span-2' : ''}`}>
              <div className="p-5 flex items-start justify-between">
                <div>
                  {route.label && (
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3 ${LABEL_STYLE[route.label] ?? 'bg-gray-100 text-gray-600'}`}>
                      {route.label}
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-display text-xl font-bold text-[#0B1F3A]">{route.fromCity}</p>
                    <svg className="w-4 h-4 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                    <p className="font-display text-xl font-bold text-[#0B1F3A]">{route.image} {route.toCity}</p>
                  </div>
                  <p className="text-xs text-[#0B1F3A]/40">{getRouteDates(route.daysOut, route.duration)} · Round trip</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-xs text-[#0B1F3A]/40 mb-0.5">From</p>
                  <p className="text-xl font-bold text-[#0B1F3A]">{formatPrice(route.price, route.currency)}</p>
                  <div className="mt-3 px-4 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold group-hover:bg-[#C9A84C] group-hover:text-[#0B1F3A] transition-all">
                    Search →
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
