import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset Password — Walz Travels',
  description: 'Reset your Walz Travels account password.',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
