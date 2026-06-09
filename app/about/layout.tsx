import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Walz Travels — connecting the African diaspora to every destination on earth. Our story, our mission, and why thousands of clients trust us.',
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
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
