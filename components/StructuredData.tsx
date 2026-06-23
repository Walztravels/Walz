// Schema.org structured data for Walz Travels pages.
// Renders <script type="application/ld+json"> — never adds visible HTML.
import type { BreadcrumbItem } from '@/lib/types/structured-data'

const BASE = 'https://www.walztravels.com'

const baseOrg = {
  '@context': 'https://schema.org',
  '@type':    'TravelAgency',
  name:       'Walz Travels',
  url:         BASE,
  logo:        `${BASE}/walz-logo.png`,
  description:
    'Expert visa processing, flight bookings, private tours and hotel reservations. UK, Canada, Schengen, UAE and USA visas.',
  telephone:          '+19843880110',
  email:              'contact@walztravels.com',
  priceRange:         '££',
  currenciesAccepted: 'GBP, USD, EUR, NGN, GHS',
  paymentAccepted:    'Credit Card, Debit Card, Bank Transfer',
  areaServed:         ['Nigeria', 'Ghana', 'United Kingdom', 'Canada', 'United States'],
  serviceType:        ['Visa Processing', 'Flight Booking', 'Private Tours', 'Hotel Reservations', 'Group Travel'],
  aggregateRating: {
    '@type':       'AggregateRating',
    ratingValue:   '4.9',
    reviewCount:   '200',
    bestRating:    '5',
  },
  openingHoursSpecification: {
    '@type':      'OpeningHoursSpecification',
    dayOfWeek:    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens:        '00:00',
    closes:       '23:59',
  },
  sameAs: [
    'https://www.instagram.com/walz_travels',
    'https://www.facebook.com/walztravels',
    'https://twitter.com/walztravels',
    'https://www.youtube.com/@walztravels',
    'https://www.linkedin.com/company/walztravels',
  ],
}

const schemas: Record<string, object> = {
  home: baseOrg,

  visa: {
    ...baseOrg,
    '@type': ['TravelAgency', 'ProfessionalService'],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name:    'Visa Services',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: 'UK Visitor Visa', description: 'UK visitor visa processing for Nigerian and Ghanaian citizens' },
          price: '120', priceCurrency: 'GBP',
        },
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: 'Canada Visitor Visa', description: 'Canada visitor visa processing (TRV/eTA)' },
        },
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: 'Schengen Visa', description: 'Schengen area visa processing for all European countries' },
        },
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: 'USA B1/B2 Visa', description: 'US visitor and business visa application support' },
        },
        {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: 'UAE Visa', description: 'UAE tourist and transit visa processing' },
        },
      ],
    },
  },

  flights: {
    ...baseOrg,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name:    'Flight Booking Services',
      itemListElement: [{
        '@type': 'Offer',
        itemOffered: {
          '@type':       'Service',
          name:          'International Flight Booking',
          description:   'Book flights on 900+ airlines with real-time fares from Lagos, Accra and beyond',
        },
      }],
    },
  },

  tours: {
    ...baseOrg,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name:    'Private Tours & Packages',
      itemListElement: [{
        '@type': 'Offer',
        itemOffered: {
          '@type':     'Service',
          name:        'Private Tour Packages',
          description: 'Bespoke private tours across Africa, Europe, the Middle East and beyond',
        },
      }],
    },
  },
}

interface Props {
  type?:        'home' | 'visa' | 'flights' | 'tours'
  breadcrumbs?: BreadcrumbItem[]
  data?:        object
}

export function StructuredData({ type = 'home', breadcrumbs, data }: Props) {
  const schemas_to_render: object[] = [data ?? schemas[type] ?? baseOrg]

  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas_to_render.push({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: breadcrumbs.map((b, i) => ({
        '@type':    'ListItem',
        position:   i + 1,
        name:       b.name,
        item:       b.url,
      })),
    })
  }

  return (
    <>
      {schemas_to_render.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Safe: content is our own controlled object, never user input
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  )
}
