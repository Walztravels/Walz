import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Private Tours & Experiences | Walz Travels',
  description: 'Exclusive private tours and group packages with expert local guides worldwide.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/tours',
    title: 'Private Tours | Walz Travels',
    description:
      'Discover and book private tours around the world with Walz Travels. Curated itineraries, expert guides and bespoke experiences tailored to your group.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Private Tours with Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Private Tours | Walz Travels',
    description:
      'Curated private tours worldwide — bespoke itineraries and expert local guides.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/tours',
  },
}

export default function ToursLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
