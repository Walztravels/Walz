import type { Metadata } from 'next'
import { privateMetadata } from '@/lib/seo'

// Private/personal route family: generic title, never indexed, archived or snippeted.
export const metadata: Metadata = privateMetadata('Invoice Payment', 'Private invoice payment page.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
