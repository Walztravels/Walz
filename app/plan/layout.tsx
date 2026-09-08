import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo'

// Transactional flow: purpose-specific title; not indexed so it never competes with the marketing page, but links are followed.
export const metadata: Metadata = transactionalMetadata('Jade Trip Planner', 'Plan your next trip with Jade, the Walz Travels AI planner.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
