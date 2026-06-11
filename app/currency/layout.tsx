import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Currency Converter',
  description:
    'Convert between USD, GBP, CAD, NGN, GHS, AED and more. Live rates for international travellers — updated every hour.',
  alternates: {
    canonical: 'https://www.walztravels.com/currency',
  },
}

export default function CurrencyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
