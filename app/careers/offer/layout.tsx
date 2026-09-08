import type { Metadata } from 'next'
import { privateMetadata } from '@/lib/seo'

// Token-gated candidate offer. Generic title only — no candidate name,
// reference or token in metadata; never indexed.
export const metadata: Metadata = privateMetadata('Your Offer')

export default function OfferLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
