import type { Metadata } from 'next'
import { privateMetadataWithVisaSocial } from '@/lib/seo/visa-social'

// Private/personal route family: generic title, never indexed, archived or snippeted.
export const metadata: Metadata = privateMetadataWithVisaSocial('Visa Application Cancelled', 'Private visa application status page.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
