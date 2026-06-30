import type { Metadata } from 'next'

// Layouts cannot access searchParams — use static metadata.
// noindex prevents search engines from indexing thousands of
// date/passenger/cabin parameter combinations that create
// near-duplicate content at scale.
export const metadata: Metadata = {
  title: 'Flight Search Results | Walz Travels',
  description: 'Compare live flight prices across 400+ airlines. Book with Walz Travels for the best fares and expert support.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://www.walztravels.com/flights/search' },
}

export default function FlightSearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
