import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Airport Transfers',
  description:
    'Book reliable airport transfers worldwide with Walz Travels. Private vehicles, meet-and-greet service and fixed prices — no hidden fees.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/transfers',
    title: 'Airport Transfers | Walz Travels',
    description:
      'Reliable airport transfers worldwide — private vehicles, fixed prices, no hidden fees.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1474690870753-1b92efa1f2d8?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Airport Transfers — Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Airport Transfers | Walz Travels',
    description: 'Private airport transfers worldwide — fixed prices, meet and greet included.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/transfers',
  },
}

export default function TransfersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
