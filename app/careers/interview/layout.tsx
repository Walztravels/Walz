import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo'

// Token-gated candidate interview. The title is deliberately generic — no
// applicant name, application reference or token ever appears in metadata —
// and `absolute` skips the brand template so it reads exactly as specified.
export const metadata: Metadata = {
  title: { absolute: 'Walz Travels Interview' },
  description: 'Private interview page for an invited candidate.',
  robots: PRIVATE_ROBOTS,
}

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
