import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FlightsPageContent } from '@/components/flights/FlightsPageContent'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Book Flights — Cheap Flights from Lagos, Accra & UK | Walz Travels',
  description: 'Book cheap flights from Lagos, Accra and the UK to worldwide destinations. Compare Emirates, British Airways, Qatar Airways fares. Visa + flight packages available.',
  keywords: [
    'cheap flights Lagos London',
    'flights Accra London',
    'Lagos to London flights',
    'Nigeria to UK flights',
    'Ghana UK flights',
    'cheap flights Nigeria',
    'book flights Nigeria',
    'Lagos Heathrow LHR',
    'Accra Heathrow LHR',
    'Nigeria Canada flights',
    'Lagos Dubai flights',
    'African diaspora flights',
    'travel agent Nigeria',
    'Walz Travels flights',
  ],
  openGraph: {
    title: 'Book Flights — Cheap Flights from Lagos, Accra & UK | Walz Travels',
    description: 'Compare Emirates, British Airways, Qatar Airways. Best fares on Nigeria, Ghana and UK routes. Book online or via WhatsApp.',
    images: [{
      url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&h=630&fit=crop',
      width: 1200,
      height: 630,
      alt: 'Book cheap flights with Walz Travels',
    }],
  },
  alternates: { canonical: 'https://www.walztravels.com/flights' },
  other: { 'ai-content-type': 'travel-service' },
}

function LoadingSpinner() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-walz-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function FlightsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <FlightsPageContent />
    </Suspense>
  )
}
