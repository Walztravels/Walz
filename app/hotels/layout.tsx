import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hotel Booking Services',
  description: 'Find and book hotels worldwide. Best rate guarantee and free cancellation available.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/hotels',
    title: 'Hotel Booking Services | Walz Travels',
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
    title: 'Hotel Booking Services | Walz Travels',
    description:
      'Compare rates and book luxury hotels worldwide — expert support from Walz Travels.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/hotels',
  },
}

export default function HotelsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
