import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import Script from 'next/script'
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
        {/* Speed up image loading — preconnect to the CDN we hit on every page */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://bxacijnrgqgmyqyfgumg.supabase.co" />

        {/* Organisation schema lives on homepage (app/page.tsx) only — not root layout.
            Emitting TravelAgency on every URL (including /flights/search?...) causes
            Semrush "invalid structured data" warnings on parameterised search pages. */}
        {false && <script
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
                  telephone: '+12317902336',
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
                    'https://tiktok.com/@walztravels',
                    'https://snapchat.com/add/walztravels',
                    'https://linkedin.com/company/walztravels',
                    'https://youtube.com/@walztravels',
                    'https://x.com/walztravels',
                  ],
                  contactPoint: {
                    '@type': 'ContactPoint',
                    telephone: '+12317902336',
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
                // FAQPage — triggers Google FAQ rich results in SERP
                {
                  '@type': 'FAQPage',
                  '@id': 'https://www.walztravels.com/#faq',
                  mainEntity: [
                    {
                      '@type': 'Question',
                      name: 'How much does a UK visa cost from Nigeria?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'The UK Standard Visitor Visa fee is £115 (approx ₦150,000–₦180,000). Walz Travels charges a service fee from £75 for full UK visa processing — document review, form completion and application submission included. Contact us for a personalised quote.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'How long does UK visa processing take from Nigeria?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Standard UK visa processing from Nigeria takes 3–8 weeks. Priority and super-priority services are available through the UK Visa Application Centre in Lagos, reducing processing to 5 business days or 24 hours respectively. Walz Travels monitors your application throughout and advises on the fastest option for your situation.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'What are the cheapest flights from Lagos to London?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'The cheapest flights from Lagos (LOS) to London (LHR) typically route via Addis Ababa on Ethiopian Airlines, Dubai on Emirates, or Doha on Qatar Airways. Return economy fares start from approximately £400–£600. Walz Travels compares 400+ airlines to find the best available fare — search our flights page for live prices.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'Does Walz Travels offer both visa processing and flight booking?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes. Walz Travels is a full-service travel consultancy handling UK, Canada, Schengen, USA, and UAE visa applications alongside international flight bookings, hotel reservations, private tour packages, and travel insurance. Our visa + flight bundle is popular with clients from Nigeria, Ghana, and the African diaspora in Canada and the UK.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'What documents are required for a Canada visa from Nigeria?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Canada Temporary Resident Visa requirements from Nigeria include: valid passport (6+ months), 6-month bank statements, proof of employment or business, travel itinerary, hotel bookings, travel insurance, and a cover letter explaining the purpose of visit. Walz Travels reviews and prepares your complete application package.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'Can I get an onward ticket or dummy ticket for my visa application?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes. Walz Travels generates verifiable flight itineraries (onward/dummy tickets) for visa applications. These are real airline booking references verifiable on the airline\'s website, valid 24–72 hours — sufficient for a visa appointment. We also offer Duffel-verified real airline holds for embassies requiring confirmed reservations.',
                      },
                    },
                  ],
                },
                // WebSite with SearchAction — enables Google Sitelinks searchbox in SERP
                {
                  '@type': 'WebSite',
                  '@id': 'https://www.walztravels.com/#website',
                  url: 'https://www.walztravels.com',
                  name: 'Walz Travels',
                  description: 'Premium travel agency for visa processing, international flights, hotels and tours for the African diaspora and global travellers.',
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                      '@type': 'EntryPoint',
                      urlTemplate: 'https://www.walztravels.com/flights?from={from}&to={to}&depart={depart}',
                    },
                    'query-input': 'required name=from required name=to required name=depart',
                  },
                },
              ],
            }),
          }}
        />}

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

        {/* Trustpilot bootstrap — lazyOnload so it never blocks LCP */}
        <Script
          src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
          strategy="afterInteractive"
        />

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
