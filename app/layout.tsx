import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { PublicShell } from '@/components/common/PublicShell'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { LenisProvider } from '@/components/providers/LenisProvider'
import { CurrencyProvider } from '@/lib/context/CurrencyContext'
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
  // FIX 2 — updated title
  title: {
    default: 'Walz Travels | Flights, Visas and Tours — Trusted Travel Agency',
    template: '%s | Walz Travels',
  },
  // FIX 3 — under 155 chars, no IATA claim
  description:
    'Walz Travels — expert visa processing, flight bookings, hotels and private tours across UK, Canada, UAE and beyond. Travel with confidence.',
  keywords: [
    'travel agency',
    'flight booking',
    'hotel booking',
    'private tours',
    'visa assistance',
    'walz travels',
    'African diaspora travel',
    'Canada visa',
    'UK visa',
    'UAE visa',
  ],
  authors: [{ name: 'Walz Travels Ltd' }],
  creator: 'Walz Travels Ltd',
  publisher: 'Walz Travels Ltd',
  // FIX 4 — root canonical
  // FIX 6 — hreflang for all markets served
  alternates: {
    canonical: 'https://www.walztravels.com',
    languages: {
      'en-GB':    'https://www.walztravels.com',
      'en-CA':    'https://www.walztravels.com',
      'en-NG':    'https://www.walztravels.com',
      'en-GH':    'https://www.walztravels.com',
      'en-AE':    'https://www.walztravels.com',
      'x-default':'https://www.walztravels.com',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://www.walztravels.com',
    siteName: 'Walz Travels',
    title: 'Walz Travels | Flights, Visas and Tours — Trusted Travel Agency',
    description: 'Expert visa processing, flight bookings, hotels and private tours across UK, Canada, UAE and beyond.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Walz Travels — Trusted Travel Agency',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Walz Travels | Flights, Visas and Tours — Trusted Travel Agency',
    description: 'Expert visa processing, flight bookings, hotels and private tours across UK, Canada, UAE and beyond.',
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
      {/* FIX 5 — Organisation / LocalBusiness schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': ['TravelAgency', 'LocalBusiness'],
            name: 'Walz Travels',
            alternateName: 'THE WALZ TRAVELS INC',
            description:
              'Global travel and visa consultancy serving the African diaspora across Canada, United Kingdom, UAE, Nigeria and Ghana.',
            url: 'https://www.walztravels.com',
            logo: 'https://www.walztravels.com/walz-logo.png',
            telephone: '+447398753797',
            email: 'contact@walztravels.com',
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Toronto',
              addressRegion: 'Ontario',
              addressCountry: 'CA',
            },
            areaServed: [
              'Canada',
              'United Kingdom',
              'United Arab Emirates',
              'Nigeria',
              'Ghana',
            ],
            serviceType: [
              'Visa Processing',
              'Flight Booking',
              'Hotel Reservation',
              'Private Tours',
              'Travel Insurance',
              'Airport Transfers',
            ],
            priceRange: '$$',
            openingHours: 'Mo-Fr 09:00-18:00',
            sameAs: [
              'https://instagram.com/walz_travels',
              'https://facebook.com/walztravels',
              'https://linkedin.com/company/walztravels',
            ],
          }),
        }}
      />
      <head>
        {/* Speed up image loading — preconnect to the CDN we hit on every page */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://bxacijnrgqgmyqyfgumg.supabase.co" />

        {/* Meta Pixel */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '841406678690648');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=841406678690648&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        {/* End Meta Pixel */}

        {/* Google Analytics 4 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){ dataLayer.push(arguments); }
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}', {
                page_path: window.location.pathname,
              });
            `,
          }}
        />
        {/* End Google Analytics 4 */}
      </head>
      <body className="font-sans bg-walz-off-white text-walz-deep-navy antialiased min-h-screen flex flex-col">
        <SessionProvider>
          <CurrencyProvider>
            <LenisProvider>
              <Cursor />
              <PublicShell>
                {children}
              </PublicShell>
            </LenisProvider>
          </CurrencyProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
