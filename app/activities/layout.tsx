import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Activities & Tours | Walz Travels',
  description: 'Book tours, excursions, and activities worldwide with Walz Travels. Discover experiences at your destination — from city tours to adventure sports.',
  openGraph: {
    type:        'website',
    url:         'https://walztravels.com/activities',
    title:       'Activities & Tours | Walz Travels',
    description: 'Book tours, excursions, and activities worldwide with Walz Travels.',
  },
  alternates: { canonical: 'https://www.walztravels.com/activities' },
}

export default function ActivitiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
