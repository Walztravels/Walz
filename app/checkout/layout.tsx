import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo'

// Transactional flow: purpose-specific title; not indexed so it never competes with the marketing page, but links are followed.
export const metadata: Metadata = transactionalMetadata('Checkout', 'Complete your Walz Travels booking securely online.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
