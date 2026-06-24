import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Walz Travels | Your Trusted Travel Agency',
  description: 'Walz Travels is a premium travel agency. Flights, hotels, visas and private tours across six global markets.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.com/about',
    title: 'About Walz Travels',
    description:
      'Connecting the African diaspora to every destination on earth since 2019.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Walz Travels — Your Gateway to the World',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Walz Travels',
    description: 'Connecting the African diaspora to every destination on earth.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/about',
  },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
