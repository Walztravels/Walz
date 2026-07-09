import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Visa Application — Walz Travels',
  description: 'Apply for your visa with Walz Travels. Expert end-to-end visa processing — documents, submission, and real-time tracking.',
}

export default function VisaApplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
