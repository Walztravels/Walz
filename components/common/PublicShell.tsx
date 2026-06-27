'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { ExitIntentPopup } from './ExitIntentPopup'

const CurrencyConverter = dynamic(
  () => import('./CurrencyConverter').then(m => ({ default: m.CurrencyConverter })),
  { ssr: false },
)


export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isAdmin  = pathname.startsWith('/admin')
  const isForm   = ['/trip-request/', '/itinerary/', '/visa/apply/', '/visa/form/', '/payment/'].some(p => pathname.startsWith(p))

  if (isAdmin || isForm) return <>{children}</>

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CurrencyConverter />

      <ExitIntentPopup />
    </>
  )
}

