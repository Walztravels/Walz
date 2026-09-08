import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo'

// Transactional flow: purpose-specific title; not indexed so it never competes with the marketing page, but links are followed.
export const metadata: Metadata = transactionalMetadata('Transfer Search Results', 'Compare airport transfer options for your trip.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
