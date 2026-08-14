import type { Metadata } from 'next'
import { CharterForm }   from './CharterForm'

export const metadata: Metadata = {
  title: 'Private Jet Charter — Walz Concierge',
  description: 'Private jet, turboprop and helicopter charter arranged by your personal Walz specialist. Tailored options and pricing within hours.',
  alternates: { canonical: 'https://www.walztravels.com/concierge/private-aviation' },
  openGraph: {
    title:       'Private Jet Charter — Walz Concierge',
    description: 'Private aviation arranged by your personal specialist.',
    url:         'https://www.walztravels.com/concierge/private-aviation',
    type:        'website',
    siteName:    'Walz Travels',
    images: [
      {
        url:    'https://images.unsplash.com/photo-1540339832862-474599807836?w=1200&q=75&auto=format&fit=crop',
        width:  1200,
        height: 630,
        alt:    'Private jet on the tarmac — Walz Private Aviation',
      },
    ],
  },
  twitter: {
    card:  'summary_large_image',
    title: 'Private Jet Charter — Walz Concierge',
  },
}

const privateAviationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Private Jet Charter — Walz Concierge',
  description: 'Private jet, turboprop and helicopter charter arranged by your personal Walz specialist.',
  url: 'https://www.walztravels.com/concierge/private-aviation',
  provider: { '@type': 'Organization', name: 'Walz Travels', url: 'https://www.walztravels.com' },
  serviceType: 'Private Aviation Charter',
  areaServed: 'Worldwide',
}

export default function PrivateAviationPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(privateAviationSchema) }} />
      <CharterForm />
    </>
  )
}
