import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo'

// Transactional flow: purpose-specific title; not indexed so it never competes with the marketing page, but links are followed.
export const metadata: Metadata = transactionalMetadata('Activity Search Results', 'Compare tours and activities for your destination.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
