import type { Metadata } from 'next'
import { privateMetadata } from '@/lib/seo'

// Private/personal route family: generic title, never indexed, archived or snippeted.
export const metadata: Metadata = privateMetadata('Trip Request', 'Private trip request page.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
