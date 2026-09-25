import type { Metadata } from 'next'
import SmsConsentForm from './SmsConsentForm'

export const metadata: Metadata = {
  title: 'SMS Customer Care Updates — Opt In',
  description:
    'Opt in to receive customer-care and service SMS updates from Walz Travels about your enquiries, bookings, payments, itineraries and visa services.',
  alternates: { canonical: 'https://www.walztravels.com/sms-consent' },
}

const smsConsentJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'SMS Customer Care Updates — Opt In',
  description:
    'Opt in to receive customer-care and service SMS updates from Walz Travels about your enquiries, bookings, payments, itineraries and visa services.',
  url: 'https://www.walztravels.com/sms-consent',
  isPartOf: { '@type': 'WebSite', name: 'Walz Travels', url: 'https://www.walztravels.com' },
  publisher: { '@type': 'Organization', name: 'Walz Travels', url: 'https://www.walztravels.com' },
}

// Public, static page.
export default function SmsConsentPage() {
  return (
    <main className="min-h-screen bg-[#060f1e] px-4 pb-20 pt-28 sm:px-5 sm:pt-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(smsConsentJsonLd) }} />
      <div className="mx-auto w-full max-w-2xl">
        <SmsConsentForm />
      </div>
    </main>
  )
}
