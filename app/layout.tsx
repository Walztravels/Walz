import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { PublicShell } from '@/components/common/PublicShell'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { LenisProvider } from '@/components/providers/LenisProvider'
import { CurrencyProvider } from '@/lib/context/CurrencyContext'
import { CartProvider }    from '@/lib/context/CartContext'
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
    default: 'Walz Travels | Flights, Visas & Tours',
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

        {/* Organisation / LocalBusiness schema — single canonical instance in head */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': ['TravelAgency', 'LocalBusiness'],
                  '@id': 'https://www.walztravels.com/#organization',
                  name: 'Walz Travels',
                  legalName: 'THE WALZ TRAVELS INC',
                  url: 'https://www.walztravels.com',
                  logo: {
                    '@type': 'ImageObject',
                    url: 'https://www.walztravels.com/walz-logo.png',
                    width: 1350,
                    height: 1350,
                  },
                  image: 'https://www.walztravels.com/og-image.png',
                  description:
                    'Walz Travels is a premium global travel and visa consultancy offering international flight bookings, visa processing for UK, Canada, Schengen, USA and UAE, luxury tour packages, hotel bookings and bespoke travel itineraries for individuals, families and corporate clients worldwide.',
                  telephone: '+447398753797',
                  email: 'contact@walztravels.com',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'CA',
                    addressRegion: 'Ontario',
                    addressLocality: 'Toronto',
                  },
                  areaServed: [
                    { '@type': 'Country', name: 'Canada' },
                    { '@type': 'Country', name: 'United Kingdom' },
                    { '@type': 'Country', name: 'United Arab Emirates' },
                    { '@type': 'Country', name: 'Nigeria' },
                    { '@type': 'Country', name: 'Ghana' },
                    { '@type': 'Country', name: 'United States' },
                  ],
                  hasOfferCatalog: {
                    '@type': 'OfferCatalog',
                    name: 'Travel Services',
                    itemListElement: [
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Schengen Visa Processing' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'UK Visa Processing' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Canada Visa Processing' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'USA Visa Processing' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'UAE Visa Processing' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'International Flight Bookings' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Luxury Tour Packages' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Hotel Bookings' } },
                      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Corporate Travel Management' } },
                    ],
                  },
                  sameAs: [
                    'https://instagram.com/walz_travels',
                    'https://facebook.com/walztravels',
                    'https://linkedin.com/company/walztravels',
                    'https://youtube.com/@walztravels',
                    'https://x.com/walztravels',
                  ],
                  contactPoint: {
                    '@type': 'ContactPoint',
                    telephone: '+447398753797',
                    contactType: 'customer service',
                    availableLanguage: ['English'],
                    areaServed: ['CA', 'GB', 'AE', 'NG', 'GH', 'US'],
                  },
                  openingHoursSpecification: {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    opens: '00:00',
                    closes: '23:59',
                  },
                  priceRange: '$$',
                },
              ],
            }),
          }}
        />

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

        {/* Google Analytics 4 — ID hardcoded (GA4 measurement IDs are public) */}
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

        {/* ── Chatwoot live chat (Walz branded) ─────────────────── */}
        <Script
          id="chatwoot-sdk"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  if (window.location.pathname.startsWith('/admin')) return;

  window.chatwootSettings = {
    hideMessageBubble: false,
    position:          'right',
    locale:            'en',
    type:              'standard',
    darkMode:          'auto',
    launcherTitle:     'Chat with Jade',
  };

  var BASE_URL = "${process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL || 'https://chat.walztravels.com'}";
  var TOKEN    = "${process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN || 'xEmkV63FyRkBYXTjzYPxyWCx'}";

  var g = document.createElement('script');
  g.src   = BASE_URL + '/packs/js/sdk.js';
  g.defer = true;
  g.async = true;
  g.onload = function() {
    if (window.chatwootSDK) {
      window.chatwootSDK.run({ websiteToken: TOKEN, baseUrl: BASE_URL });
    }
  };
  g.onerror = function() {
    // SDK failed — inject WhatsApp fallback bubble (desktop only; mobile uses the FAB in PublicShell)
    if (window.innerWidth < 1024) return;
    var btn = document.createElement('a');
    btn.href   = 'https://wa.me/447398753797?text=Hi%20Jade%2C%20I%20need%20help%20with%20my%20travel%20plans';
    btn.target = '_blank';
    btn.rel    = 'noopener noreferrer';
    btn.setAttribute('aria-label', 'Chat on WhatsApp');
    btn.style.cssText = [
      'position:fixed','bottom:20px','right:20px','z-index:9999',
      'width:60px','height:60px','border-radius:50%',
      'background:#25D366','display:flex',
      'align-items:center','justify-content:center',
      'box-shadow:0 4px 20px rgba(37,211,102,0.4)',
      'text-decoration:none','transition:transform 0.2s',
    ].join(';');
    btn.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    btn.addEventListener('mouseenter', function() { btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', function() { btn.style.transform = 'scale(1)'; });
    document.body.appendChild(btn);
  };

  document.head.appendChild(g);
})();
            `,
          }}
        />
        {/* ── End Chatwoot ──────────────────────────────────────── */}
      </head>
      <body className="font-sans bg-walz-off-white text-walz-deep-navy antialiased min-h-screen flex flex-col">
        <SessionProvider>
          <CurrencyProvider>
            <CartProvider>
              <LenisProvider>
                <Cursor />
                <PublicShell>
                  {children}
                </PublicShell>
              </LenisProvider>
            </CartProvider>
          </CurrencyProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
