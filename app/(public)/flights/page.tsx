import type { Metadata } from 'next'
import { FlightsHero }        from '@/components/flights/FlightsHero'
import { FlightSearchWidget } from '@/components/flights/FlightSearchWidget'
import { FlightPriceAlert }   from '@/components/FlightPriceAlert'
import { TrustStrip }         from '@/components/flights/TrustStrip'
import { PopularRoutes }      from '@/components/flights/PopularRoutes'
import { WhyWalz }            from '@/components/flights/WhyWalz'
import { JadeMilesSection }   from '@/components/flights/JadeMilesSection'
import { AiAssistantTeaser }  from '@/components/flights/AiAssistantTeaser'

export const metadata: Metadata = {
  title:       'Book Flights Worldwide | Walz Travels',
  description: 'Search and book flights on 900+ airlines. Business class, first class and economy fares with 24/7 expert support and Jade AI concierge. IATA partner.',
  keywords: [
    'cheap flights Lagos London', 'flights Accra London', 'Nigeria UK flights',
    'Ghana UK flights', 'book flights Nigeria', 'book flights Ghana',
    'Lagos Dubai flights', 'Walz Travels flights', 'business class Africa',
    'Jade Miles loyalty', 'AI flight booking',
  ],
  openGraph: {
    title:       'Fly Higher. Further. Better. — Walz Travels',
    description: 'Premium flight booking on 900+ airlines with Jade AI concierge and 24/7 expert support.',
    images: [{ url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&h=630&fit=crop', width: 1200, height: 630, alt: 'Book flights with Walz Travels' }],
  },
  alternates: { canonical: 'https://www.walztravels.com/flights' },
}

export default function FlightsPage() {
  return (
    <main className="min-h-screen bg-[#FAF7F2]">
      {/* Cinematic hero + search widget */}
      <section className="relative min-h-[95vh] flex flex-col">
        <FlightsHero />
        <div className="relative z-20 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-auto -mb-20 pb-0">
          <FlightSearchWidget />
        </div>
      </section>

      {/* Spacer for overlapping widget */}
      <div className="h-24 bg-white" />

      {/* Price alert widget — below search form */}
      <div className="mt-8 max-w-2xl mx-auto px-4">
        <FlightPriceAlert />
      </div>

      <TrustStrip />
      <PopularRoutes />
      <AllRoutesGrid />
      <WhyWalz />
      <JadeMilesSection />
      <AiAssistantTeaser />
    </main>
  )
}

const ALL_ROUTES = [
  { slug: 'los-lhr', label: 'Lagos → London' },
  { slug: 'acc-lhr', label: 'Accra → London' },
  { slug: 'los-dxb', label: 'Lagos → Dubai' },
  { slug: 'los-jfk', label: 'Lagos → New York' },
  { slug: 'acc-jfk', label: 'Accra → New York' },
  { slug: 'los-yyz', label: 'Lagos → Toronto' },
  { slug: 'acc-yyz', label: 'Accra → Toronto' },
  { slug: 'los-nbo', label: 'Lagos → Nairobi' },
  { slug: 'los-jnb', label: 'Lagos → Johannesburg' },
  { slug: 'los-bom', label: 'Lagos → Mumbai' },
  { slug: 'acc-dxb', label: 'Accra → Dubai' },
  { slug: 'acc-nbo', label: 'Accra → Nairobi' },
  { slug: 'los-cdg', label: 'Lagos → Paris' },
  { slug: 'los-fra', label: 'Lagos → Frankfurt' },
  { slug: 'acc-cdg', label: 'Accra → Paris' },
  { slug: 'los-ams', label: 'Lagos → Amsterdam' },
  { slug: 'acc-ams', label: 'Accra → Amsterdam' },
  { slug: 'los-iad', label: 'Lagos → Washington DC' },
  { slug: 'los-atl', label: 'Lagos → Atlanta' },
]

function AllRoutesGrid() {
  return (
    <section className="bg-[#FAF7F2] py-16 px-5 sm:px-8">
      <div className="container-walz">
        <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.3em] uppercase mb-3">All Destinations</p>
        <h2 className="font-display text-3xl font-bold text-[#0B1F3A] mb-8">Browse All Flight Routes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {ALL_ROUTES.map(r => (
            <a
              key={r.slug}
              href={`/flights/${r.slug}`}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#0B1F3A]/10 bg-white hover:border-[#C9A84C] hover:text-[#C9A84C] text-[#0B1F3A] text-sm font-medium transition-all group"
            >
              <span className="text-[#C9A84C] text-xs">✈</span>
              {r.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
