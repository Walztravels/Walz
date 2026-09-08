import type { Metadata } from 'next'

// Client itineraries (proposal, approval, portal) are private. This family
// default guarantees every /itinerary/* page — including client-component
// subpages that cannot export metadata — is never indexed and carries no
// client name, reference, pricing or token in its head.
export const metadata: Metadata = {
  title: { absolute: 'Your Travel Itinerary | Walz Travels' },
  description: 'Review your customized travel itinerary from Walz Travels.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}

export default function ItineraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
