import type { Metadata } from 'next'
import { StructuredData } from '@/components/StructuredData'

export const metadata: Metadata = {
  title: 'Visa Assistance | UK, Canada, UAE & Schengen | Walz Travels',
  description: '90%+ visa approval rate. Expert visa processing for UK, Canada, UAE, USA and Schengen visas.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/visa',
    title: 'Visa Intelligence | Walz Travels',
    description:
      'Check visa requirements for any passport and destination instantly. 90%+ approval rate with expert preparation and document coaching.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Visa Intelligence — Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Visa Intelligence | Walz Travels',
    description:
      'Instant visa requirement checks + 90%+ approval rate from our specialist team.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/visa',
  },
}

export default function VisaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StructuredData type="visa" breadcrumbs={[
        { name: 'Home',          url: 'https://www.walztravels.com' },
        { name: 'Visa Services', url: 'https://www.walztravels.com/visa' },
      ]} />
      {children}
    </>
  )
}
