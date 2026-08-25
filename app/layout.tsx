import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import Script from 'next/script'
import { BUSINESS } from '@/lib/config/business'
import './globals.css'
import { PublicShell } from '@/components/common/PublicShell'
import { JadeChatWidget } from '@/components/common/JadeChatWidget'
import CookieConsent from '@/components/cookie-consent/CookieConsent'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { LenisProvider } from '@/components/providers/LenisProvider'
import { CurrencyProvider } from '@/lib/context/CurrencyContext'
import { CartProvider }    from '@/lib/context/CartContext'
import { getSiteSettings } from '@/lib/site-settings'
import { SettingsProvider } from '@/lib/settings-context'


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
}

export const metadata: Metadata = {
  // FIX 2 — updated title
  title: {
    default: 'Walz Travels | Expert Visas, Flights & Tours — UK, Canada & UAE',
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
    'Nigeria to UK visa',
    'Ghana to Canada visa',
    'Lagos to London flights',
    'Accra to London flights',
    'travel agent Nigeria',
    'visa processing Nigeria',
    'dummy ticket visa',
    'onward ticket',
    'cheap flights Lagos',
    'cheap flights Accra',
    'flight booking Nigeria',
    'UK visa Nigeria',
    'Canada visa Nigeria',
    'Schengen visa Nigeria',
  ],
  authors: [{ name: 'Walz Travels Ltd' }],
  creator: 'Walz Travels Ltd',
  publisher: 'Walz Travels Ltd',
  alternates: {
    canonical: 'https://www.walztravels.com',
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://www.walztravels.com',
    siteName: 'Walz Travels',
    title: 'Walz Travels | Flights, Visas & Tours',
    description: 'Expert visa processing, flight bookings, hotels and private tours across UK, Canada, UAE and beyond.',
    images: [
      {
        url: 'https://us.chat-img.sintra.ai/aeb90658-6cce-491a-8a0f-bfc14a8cdc69/e2fd6df1-f938-441d-a8d8-37a20caa465b/walz-travels-og-share-image.png',
        width: 1200,
        height: 630,
        alt: 'Walz Travels — Trusted Travel Agency',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Walz Travels | Flights, Visas & Tours',
    description: 'Expert visa processing, flight bookings, hotels and private tours across UK, Canada, UAE and beyond.',
    creator: '@walztravels',
    images: ['https://us.chat-img.sintra.ai/aeb90658-6cce-491a-8a0f-bfc14a8cdc69/e2fd6df1-f938-441d-a8d8-37a20caa465b/walz-travels-og-share-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico',       sizes: 'any',    type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16',  type: 'image/png'    },
      { url: '/favicon-32x32.png', sizes: '32x32',  type: 'image/png'    },
      { url: '/favicon-48x48.png', sizes: '48x48',  type: 'image/png'    },
      { url: '/icon-192x192.png',  sizes: '192x192', type: 'image/png'   },
      { url: '/icon-512x512.png',  sizes: '512x512', type: 'image/png'   },
    ],
    shortcut: '/favicon.ico',
    apple:    { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const settings = await getSiteSettings()
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Critical preconnects — resolved before the browser parses body, shaving ~100–300 ms off first requests */}
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://bxacijnrgqgmyqyfgumg.supabase.co" crossOrigin="anonymous" />
        {/* Analytics — preconnect so gtag/js and fbevents.js load without a cold DNS lookup */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />

        {/* Organisation schema lives on homepage (app/page.tsx) — not root layout.
            Emitting TravelAgency on every URL causes structured-data warnings on
            parameterised search pages. Dead block intentionally removed. */}
        {/* REMOVED: {false && <script .../>} — dead code, never rendered, still compiled.
            Moved to app/page.tsx as a live <script type="application/ld+json"> block. */}

        {/* Google Consent Mode v2 */}
        <Script
          id="google-consent-mode"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                wait_for_update: 500,
              });
              try {
                var stored = localStorage.getItem('walz_cookie_consent');
                if (stored) {
                  var c = JSON.parse(stored);
                  gtag('consent', 'update', {
                    analytics_storage:  c.analytics ? 'granted' : 'denied',
                    ad_storage:         c.marketing ? 'granted' : 'denied',
                    ad_user_data:       c.marketing ? 'granted' : 'denied',
                    ad_personalization: c.marketing ? 'granted' : 'denied',
                  });
                }
              } catch(e) {}
            `,
          }}
        />

        {/* Meta Pixel — loads library but gates init behind marketing consent */}
        <Script
          id="fb-pixel"
          strategy="lazyOnload"
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
              function _walzInitFbPixel() {
                if (window._walzFbInit) return;
                fbq('init', '841406678690648');
                fbq('track', 'PageView');
                window._walzFbInit = true;
              }
              try {
                var c = JSON.parse(localStorage.getItem('walz_cookie_consent') || 'null');
                if (c && c.marketing) _walzInitFbPixel();
              } catch(e) {}
              window._walzInitFbPixel = _walzInitFbPixel;
            `,
          }}
        />
        {/* End Meta Pixel */}

        {/* Google Analytics 4 — Consent Mode v2 blocks tracking until user accepts */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-KJH17JHQST"
          strategy="afterInteractive"
        />
        <Script
          id="ga4"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-KJH17JHQST');
            `,
          }}
        />
        {/* End Google Analytics 4 */}


      </head>
      <body className="font-sans bg-walz-off-white text-walz-deep-navy antialiased min-h-screen flex flex-col">
        <SettingsProvider settings={settings}>
        <SessionProvider>
          <CurrencyProvider>
            <CartProvider>
              <LenisProvider>
                <PublicShell>
                  {children}
                </PublicShell>
                <JadeChatWidget />
                <CookieConsent />
              </LenisProvider>
            </CartProvider>
          </CurrencyProvider>
        </SessionProvider>
        </SettingsProvider>
      </body>
    </html>
  )
}
