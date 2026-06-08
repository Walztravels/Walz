'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { JadeChat } from '../jade/JadeChat'

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
    </>
  )
}
