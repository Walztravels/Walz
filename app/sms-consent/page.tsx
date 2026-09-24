import type { Metadata } from 'next'
import SmsConsentForm from './SmsConsentForm'

export const metadata: Metadata = {
  title: 'SMS Customer Care Updates — Opt In',
  description:
    'Opt in to receive customer-care and service SMS updates from Walz Travels about your enquiries, bookings, payments, itineraries and visa services.',
  alternates: { canonical: 'https://www.walztravels.com/sms-consent' },
}

// Public, static page.
export default function SmsConsentPage() {
  return (
    <main className="min-h-screen bg-[#060f1e] px-4 pb-20 pt-28 sm:px-5 sm:pt-32">
      <div className="mx-auto w-full max-w-2xl">
        <SmsConsentForm />
      </div>
    </main>
  )
}
