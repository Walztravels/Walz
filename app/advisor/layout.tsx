import type { Metadata } from 'next'
import { absoluteUrl, socialPreview } from '@/lib/seo'

// Public marketing tool page — indexable with its own identity.
const TITLE = 'AI Travel Advisor'
const DESCRIPTION =
  'Get instant, personalized travel advice from Jade — the Walz Travels AI advisor for visas, flights, hotels and trip planning.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/advisor') },
  ...socialPreview(`${TITLE} | Walz Travels`, DESCRIPTION, absoluteUrl('/advisor')),
}

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
