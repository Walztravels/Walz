import Link from 'next/link'
import { Users, Clock, MapPin, Star, ArrowRight } from 'lucide-react'

const tours = [
  {
    id: 'dublin-private-day-tour',
    title: 'Dublin Private Day Tour',
    subtitle: 'Full Day · 8 Hours',
    description:
      'Explore the vibrant Irish capital with a private guide. Trinity College, Guinness Storehouse, St. Patrick\'s Cathedral, and Temple Bar.',
    price: 295,
    groupSize: '1–8 people',
    duration: '8 hours',
    rating: 4.9,
    reviewCount: 124,
    highlights: ['Trinity College & Book of Kells', 'Guinness Storehouse', 'Traditional Irish lunch'],
    image: 'https://images.unsplash.com/photo-1564959130747-897fb406b9af?w=800&q=80',
    badge: 'Best Seller',
    badgeColor: 'gold',
  },
  {
    id: 'london-private-day-tour',
    title: 'London Private Day Tour',
    subtitle: 'Full Day · 9 Hours',
    description:
      'Discover London\'s royal heritage with a blue-badge guide. Buckingham Palace, Tower of London, Westminster, and Borough Market.',
    price: 350,
    groupSize: '1–8 people',
    duration: '9 hours',
    rating: 4.9,
    reviewCount: 98,
    highlights: ['Buckingham Palace', 'Tower of London & Crown Jewels', 'Borough Market lunch'],
    image: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80',
    badge: 'Top Rated',
    badgeColor: 'navy',
  },
]

export function ToursHighlight() {
  return (
    <section className="py-16 lg:py-24 bg-walz-off-white">
      <div className="container-walz">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-walz-gold" />
              <span className="text-walz-gold text-sm font-semibold tracking-wider uppercase">
                Private Tours
              </span>
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-walz-deep-navy">
              Exclusive City Experiences
            </h2>
            <div className="divider-gold mt-3" />
          </div>
          <Link
            href="/tours"
            className="text-sm font-medium text-walz-gold hover:text-walz-gold-light transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            All tours
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {/* Tours Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {tours.map((tour) => (
            <div
              key={tour.id}
              className="card-luxury group overflow-hidden"
            >
              {/* Image */}
              <div className="relative h-56 lg:h-64 overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url('${tour.image}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-walz-deep-navy/60 to-transparent" />

                {/* Badge */}
                <div className="absolute top-4 left-4">
                  <span className={tour.badgeColor === 'gold' ? 'badge-gold' : 'badge-navy'}>
                    {tour.badge}
                  </span>
                </div>

                {/* Rating */}
                <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-xs font-bold text-walz-deep-navy">{tour.rating}</span>
                  <span className="text-xs text-walz-muted">({tour.reviewCount})</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 lg:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-display text-xl font-bold text-walz-deep-navy leading-tight">
                      {tour.title}
                    </h3>
                    <p className="text-walz-muted text-sm mt-0.5">{tour.subtitle}</p>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-xs text-walz-muted">From</div>
                    <div className="text-2xl font-bold text-walz-gold">£{tour.price}</div>
                    <div className="text-xs text-walz-muted">per group</div>
                  </div>
                </div>

                <p className="text-walz-muted text-sm leading-relaxed mb-4">
                  {tour.description}
                </p>

                {/* Highlights */}
                <div className="space-y-1.5 mb-5">
                  {tour.highlights.map((highlight) => (
                    <div key={highlight} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-walz-gold flex-shrink-0" />
                      <span className="text-sm text-walz-slate">{highlight}</span>
                    </div>
                  ))}
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-walz-muted mb-5">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-walz-gold" />
                    <span>{tour.groupSize}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-walz-gold" />
                    <span>{tour.duration}</span>
                  </div>
                </div>

                {/* CTA */}
                <Link
                  href={`/tours#${tour.id}`}
                  className="btn-gold w-full flex items-center justify-center gap-2 text-sm"
                >
                  <span>Enquire Now</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
