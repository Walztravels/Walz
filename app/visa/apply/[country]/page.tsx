import type { Metadata } from 'next'
import { Suspense } from 'react'
import { visaSocialMetadata } from '@/lib/seo/visa-social'
import VisaApplyClient from './VisaApplyClient'

const SLUG_DISPLAY: Record<string, string> = {
  'united-kingdom': 'UK',
  'canada':         'Canada',
  'usa':            'USA',
  'schengen':       'Schengen Area',
  'uae':            'UAE',
  'australia':      'Australia',
  'nigeria':        'Nigeria',
  'ghana':          'Ghana',
  'germany':        'Germany',
  'france':         'France',
  'netherlands':    'Netherlands',
  'turkey':         'Turkey',
  'india':          'India',
  'china':          'China',
  'south-africa':   'South Africa',
  'brazil':         'Brazil',
}

function getDisplayName(slug: string): string {
  return SLUG_DISPLAY[slug.toLowerCase()] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function generateMetadata({ params }: { params: { country: string } }): Promise<Metadata> {
  const name = getDisplayName(params.country)
  return {
    title: `Apply for ${name} Visa`,
    description: `Start your ${name} visa application online. Expert document preparation, fast processing and dedicated support from Walz Travels.`,
    alternates: { canonical: `https://www.walztravels.com/visa/apply/${params.country}` },
    ...visaSocialMetadata({
      title: `Apply for ${name} Visa — Walz Travels`,
      description: `Start your ${name} visa application with Walz Travels — expert preparation and dedicated support.`,
      url: `https://www.walztravels.com/visa/apply/${params.country}`,
    }),
  }
}

export default function VisaApplyPage({ params }: { params: { country: string } }) {
  const name = getDisplayName(params.country)
  return (
    <>
      <h1 className="sr-only">Apply for {name} Visa — Walz Travels</h1>
      <Suspense>
        <VisaApplyClient />
      </Suspense>
    </>
  )
}
