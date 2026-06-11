'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

// JadeChat is a floating widget — defer it so it never blocks first paint
const JadeChat = dynamic(
  () => import('../jade/JadeChat').then(m => ({ default: m.JadeChat })),
  { ssr: false },
)

// Currency converter floating widget — defer for same reason
const CurrencyConverter = dynamic(
  () => import('./CurrencyConverter').then(m => ({ default: m.CurrencyConverter })),
  { ssr: false },
)

/**
 * Wraps public pages with Navbar, Footer, JadeChat.
 * Admin pages bypass all public chrome — the admin layout handles its own shell.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isAdmin = pathname.startsWith('/admin')

  if (isAdmin) {
    // Admin layout handles its own shell — render children bare
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <JadeChat />
      <CurrencyConverter />
    </>
  )
}
