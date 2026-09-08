import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo'

// Transactional flow: purpose-specific title; not indexed so it never competes with the marketing page, but links are followed.
export const metadata: Metadata = transactionalMetadata('Book Your Trip', 'Book your trip with Walz Travels.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
