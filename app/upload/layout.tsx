import type { Metadata } from 'next'
import { privateMetadata } from '@/lib/seo'

// Private/personal route family: generic title, never indexed, archived or snippeted.
export const metadata: Metadata = privateMetadata('Secure Document Upload', 'Private, secure document upload for Walz Travels clients.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
