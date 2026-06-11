import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Travel Insurance',
  description:
    'Comprehensive travel insurance from Walz Travels — medical cover, trip cancellation, baggage protection and 24/7 emergency assistance.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/insurance',
    title: 'Travel Insurance | Walz Travels',
    description:
      'Comprehensive travel insurance — medical cover, trip cancellation, baggage protection.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Travel Insurance — Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Travel Insurance | Walz Travels',
    description: 'Full travel protection — medical, cancellation, baggage and 24/7 assistance.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/insurance',
  },
}

export default function InsuranceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
