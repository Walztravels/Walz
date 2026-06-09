import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'
import { PublicShell } from '@/components/common/PublicShell'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { LenisProvider } from '@/components/providers/LenisProvider'
import dynamic from 'next/dynamic'

const Cursor = dynamic(() => import('@/components/ui/Cursor'), { ssr: false })

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  // Only load weights that are actually rendered (400 = body, 700 = bold headings)
  weight: ['400', '700'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  // Drop 300 (light) — not used in the design system
  weight: ['400', '500', '600', '700'],
})

export const viewport = {
  themeColor: '#0B1F3A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

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
    url: 'https://www.walztravels.com',
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
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico',   sizes: '16x16 32x32 48x64 128x256', type: 'image/x-icon' },
      { url: '/walz-logo.png', sizes: '512x512',                   type: 'image/png'    },
    ],
    shortcut: '/favicon.ico',
    apple:    { url: '/walz-logo.png', sizes: '180x180', type: 'image/png' },
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
      <head>
        {/* Speed up image loading — preconnect to the CDN we hit on every page */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://bxacijnrgqgmyqyfgumg.supabase.co" />
      </head>
      <body className="font-sans bg-walz-off-white text-walz-deep-navy antialiased min-h-screen flex flex-col">
        <SessionProvider>
          <LenisProvider>
            <Cursor />
            <PublicShell>
              {children}
            </PublicShell>
          </LenisProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
