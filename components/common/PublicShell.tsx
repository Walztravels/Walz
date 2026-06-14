'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

// Currency converter floating widget — defer for same reason
const CurrencyConverter = dynamic(
  () => import('./CurrencyConverter').then(m => ({ default: m.CurrencyConverter })),
  { ssr: false },
)

/**
 * Wraps public pages with Navbar, Footer, and CurrencyConverter.
 * Admin pages bypass all public chrome — the admin layout handles its own shell.
 * Chat is handled by the Chatwoot widget (loaded via layout.tsx script).
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isAdmin = pathname.startsWith('/admin')

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CurrencyConverter />
    </>
  )
}
