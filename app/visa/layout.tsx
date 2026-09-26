import type { Metadata } from 'next'
import { StructuredData } from '@/components/StructuredData'
import { visaSocialMetadata } from '@/lib/seo/visa-social'

export const metadata: Metadata = {
  title: 'Visa Assistance Services',
  description: '90%+ visa approval rate. Expert visa processing for UK, Canada, UAE, USA and Schengen visas.',
  ...visaSocialMetadata({
    url: 'https://www.walztravels.com/visa',
    title: 'Visa Assistance Services | Walz Travels',
    description:
      'Check visa requirements for any passport and destination instantly. 90%+ approval rate with expert preparation and document coaching.',
  }),
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
