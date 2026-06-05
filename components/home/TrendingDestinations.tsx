import Link from 'next/link'
import { MapPin, TrendingUp } from 'lucide-react'

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
    <section className="py-16 lg:py-24 bg-walz-off-white">
      <div className="container-walz">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-walz-gold" />
              <span className="text-walz-gold text-sm font-semibold tracking-wider uppercase">
                Trending Now
              </span>
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-walz-deep-navy leading-tight">
              Popular Destinations
            </h2>
            <div className="divider-gold mt-3" />
          </div>
          <Link
            href="/flights"
            className="text-sm font-medium text-walz-gold hover:text-walz-gold-light transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            View all flights
            <span className="ml-1">→</span>
          </Link>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {destinations.map((dest, index) => (
            <Link
              key={dest.code}
              href={`/flights?to=${dest.code}`}
              className={`group relative overflow-hidden rounded-2xl cursor-pointer block ${
                index === 0 ? 'sm:row-span-2 sm:col-span-1' : ''
              }`}
              style={{ minHeight: index === 0 ? '420px' : '200px' }}
            >
              {/* Background Image */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url('${dest.image}')` }}
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-walz-deep-navy/90 via-walz-deep-navy/20 to-transparent" />

              {/* Tag */}
              <div className="absolute top-4 left-4">
                <span className="badge-gold text-[11px] shadow-sm">{dest.tag}</span>
              </div>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-5 transform translate-y-0 group-hover:-translate-y-1 transition-transform duration-300">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-white text-xl lg:text-2xl font-bold leading-tight">
                      {dest.city}
                    </h3>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-walz-gold flex-shrink-0" />
                      <span className="text-walz-muted text-xs">{dest.country}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-walz-muted text-xs mb-0.5">From</div>
                    <div className="text-walz-gold font-bold text-lg">
                      £{dest.price}
                    </div>
                  </div>
                </div>

                {/* Hover CTA */}
                <div className="overflow-hidden max-h-0 group-hover:max-h-10 transition-all duration-300 mt-0 group-hover:mt-3">
                  <div className="flex items-center gap-2 text-walz-gold text-sm font-medium">
                    <span>Search flights</span>
                    <span className="transform group-hover:translate-x-1 transition-transform">→</span>
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
