import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'

import './globals.css'
import { Navbar } from '@/components/common/Navbar'
import { Footer } from '@/components/common/Footer'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { JadeChat } from '@/components/jade/JadeChat'

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Walz Travels — Luxury Travel Agency',
    template: '%s | Walz Travels',
  },
  description:
    'Walz Travels is your trusted IATA-certified luxury travel agency. Book flights, hotels, private tours and visa services with expert guidance and the best available fares via Sabre GDS.',
  keywords: [
    'luxury travel agency',
    'flight booking',
    'hotel booking',
    'private tours Dublin',
    'private tours London',
    'visa assistance',
    'IATA certified',
    'Sabre GDS',
    'walz travels',
  ],
  authors: [{ name: 'Walz Travels Ltd' }],
  creator: 'Walz Travels Ltd',
  publisher: 'Walz Travels Ltd',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://walztravels.com',
    siteName: 'Walz Travels',
    title: 'Walz Travels — Luxury Travel Agency',
    description: 'Book flights, hotels and private tours with IATA-certified luxury travel experts.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Walz Travels — Luxury Travel Agency',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Walz Travels — Luxury Travel Agency',
    description: 'Book flights, hotels and private tours with IATA-certified luxury travel experts.',
    creator: '@walztravels',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans bg-walz-off-white text-walz-deep-navy antialiased min-h-screen flex flex-col">
        <SessionProvider>
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
          <JadeChat />
        </SessionProvider>
      </body>
    </html>
  )
}
