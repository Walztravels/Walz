import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Your Cart — Walz Travels',
  description: 'Review and complete your Walz Travels booking — visas, flights, tours, and more.',
  robots: { index: false, follow: false },
}

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
