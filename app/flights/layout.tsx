import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Book Flights',
  description:
    'Search and book flights worldwide with Walz Travels. Direct access to Sabre GDS gives you real-time inventory across 400+ airlines and the lowest available fares.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.us/flights',
    title: 'Book Flights | Walz Travels',
    description:
      'Search and book flights worldwide with Walz Travels. Direct access to Sabre GDS gives you real-time inventory across 400+ airlines and the lowest available fares.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Book Flights with Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book Flights | Walz Travels',
    description:
      'Search 400+ airlines with Sabre GDS — best available fares, expert support.',
  },
}

export default function FlightsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
