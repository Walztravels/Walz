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
      <WhyWalz />
      <JadeMilesSection />
      <AiAssistantTeaser />
    </main>
  )
}
