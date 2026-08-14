import type { Metadata } from 'next'
import ActivitiesPageClient from './ActivitiesPageClient'

export const metadata: Metadata = {
  title: 'Tours & Activities — Walz Travels',
  description: '12,000+ curated experiences across 150 countries. Safaris, cultural tours, adventure sports, helicopter flights and more — booked by Walz Travels.',
  alternates: { canonical: 'https://www.walztravels.com/activities' },
  openGraph: {
    title: 'Tours & Activities — Walz Travels',
    description: '12,000+ curated experiences across 150 countries. Safaris, cultural tours, adventure sports and more.',
    url: 'https://www.walztravels.com/activities',
    images: [{ url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&h=630&fit=crop&q=80', width: 1200, height: 630, alt: 'Tours and Activities — Walz Travels' }],
  },
}

const activitiesSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Tours & Activities — Walz Travels',
  description: '12,000+ curated experiences across 150 countries.',
  url: 'https://www.walztravels.com/activities',
  provider: { '@type': 'Organization', name: 'Walz Travels', url: 'https://www.walztravels.com' },
}

export default function ActivitiesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(activitiesSchema) }} />
      <ActivitiesPageClient />
    </>
  )
}
