import type { Metadata } from 'next'
import { privateMetadataWithVisaSocial } from '@/lib/seo/visa-social'

// Private/personal route family: generic title, never indexed, archived or snippeted.
export const metadata: Metadata = privateMetadataWithVisaSocial('Group Visa Planner', 'Private group visa planning session.')

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
