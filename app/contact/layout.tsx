import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with the Walz Travels team. We\'re here to help with visa applications, flight bookings, tours and more.',
  alternates: { canonical: 'https://www.walztravels.com/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
