import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help Centre',
  description:
    'Get answers to your questions about flights, hotels, visas, eSIMs and bookings. Contact the Walz Travels team via WhatsApp anytime.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/help',
    title: 'Help Centre | Walz Travels',
    description:
      'Get answers to your questions about flights, hotels, visas and bookings. 24/7 WhatsApp support.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Walz Travels Help Centre',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help Centre | Walz Travels',
    description: 'Answers to all your travel questions — 24/7 WhatsApp support available.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/help',
  },
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
