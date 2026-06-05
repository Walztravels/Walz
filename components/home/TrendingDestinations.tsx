import Link from 'next/link'
import { MapPin, TrendingUp, ArrowUpRight } from 'lucide-react'

const destinations = [
  {
    city: 'Dubai',
    country: 'United Arab Emirates',
    code: 'DXB',
    price: 399,
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80',
    tag: 'Popular',
  },
  {
    city: 'London',
    country: 'United Kingdom',
    code: 'LHR',
    price: 89,
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
    tag: 'City Break',
  },
  {
    city: 'New York',
    country: 'United States',
    code: 'JFK',
    price: 349,
    image: 'https://images.unsplash.com/photo-1499092346302-2c6c9d8e1b25?w=800&q=80',
    tag: 'City Break',
  },
  {
    city: 'Maldives',
    country: 'Republic of Maldives',
    code: 'MLE',
    price: 899,
    image: 'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800&q=80',
    tag: 'Luxury',
  },
  {
    city: 'Tokyo',
    country: 'Japan',
    code: 'NRT',
    price: 649,
    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80',
    tag: 'Culture',
  },
  {
    city: 'Paris',
    country: 'France',
    code: 'CDG',
    price: 129,
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
    tag: 'Romantic',
  },
]

export function TrendingDestinations() {
  return (
    <section className="py-20 lg:py-28 bg-walz-off-white">
      <div className="container-walz">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <div className="section-label mb-3">
              <TrendingUp className="w-4 h-4" />
              <span>Trending Now</span>
            </div>
            <h2 className="section-title text-balance">
              Popular Destinations
            </h2>
            <p className="text-walz-muted mt-3 max-w-md">
              Explore our most sought-after destinations, handpicked for unforgettable experiences.
            </p>
          </div>
          <Link
            href="/flights"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-walz-deep-navy hover:text-walz-gold transition-colors self-start sm:self-auto px-4 py-2 rounded-full border border-walz-border hover:border-walz-gold"
          >
            View all flights
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {destinations.map((dest, index) => (
            <Link
              key={dest.code}
              href={`/flights?to=${dest.code}`}
              className={`group relative overflow-hidden rounded-2xl cursor-pointer block shadow-card hover:shadow-luxury transition-shadow duration-500 ${
                index === 0 ? 'sm:row-span-2 sm:col-span-1' : ''
              }`}
              style={{ minHeight: index === 0 ? '440px' : '210px' }}
            >
              {/* Background Image */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ backgroundImage: `url('${dest.image}')` }}
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-walz-deep-navy/95 via-walz-deep-navy/30 to-transparent" />

              {/* Tag */}
              <div className="absolute top-4 left-4">
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-walz-white/95 backdrop-blur-sm text-walz-deep-navy text-[11px] font-semibold shadow-sm">
                  {dest.tag}
                </span>
              </div>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6 transform translate-y-0 group-hover:-translate-y-1 transition-transform duration-300">
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="font-display text-white text-xl lg:text-2xl font-bold leading-tight">
                      {dest.city}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-walz-gold flex-shrink-0" />
                      <span className="text-walz-white/70 text-sm">{dest.country}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-walz-white/60 text-xs mb-1">From</div>
                    <div className="text-walz-gold font-bold text-xl">
                      £{dest.price}
                    </div>
                  </div>
                </div>

                {/* Hover CTA */}
                <div className="overflow-hidden max-h-0 group-hover:max-h-12 transition-all duration-300 mt-0 group-hover:mt-4">
                  <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-walz-gold/90 backdrop-blur-sm text-walz-deep-navy text-sm font-semibold">
                    <span>Search flights</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
