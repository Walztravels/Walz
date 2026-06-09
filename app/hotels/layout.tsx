import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Book Hotels',
  description:
    'Find and book hotels worldwide with Walz Travels. Compare rates, read reviews, and book luxury stays with expert guidance and 24/7 support.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.com/hotels',
    title: 'Book Hotels | Walz Travels',
    description:
      'Find and book hotels worldwide with Walz Travels. Compare rates, read reviews, and book luxury stays with expert guidance and 24/7 support.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Book Hotels with Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book Hotels | Walz Travels',
    description:
      'Compare rates and book luxury hotels worldwide — expert support from Walz Travels.',
  },
}

export default function HotelsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
