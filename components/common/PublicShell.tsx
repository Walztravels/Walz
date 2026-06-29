'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { ExitIntentPopup } from './ExitIntentPopup'

const CurrencyConverter = dynamic(
  () => import('./CurrencyConverter').then(m => ({ default: m.CurrencyConverter })),
  { ssr: false },
)


export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isAdmin    = pathname.startsWith('/admin')
  const isForm     = ['/trip-request/', '/itinerary/', '/visa/apply/', '/visa/form/', '/payment/'].some(p => pathname.startsWith(p))
  const isHiveSlug = pathname.startsWith('/plan/group-hive/') || pathname.startsWith('/group-visa/hive/')

  if (isAdmin || isForm) return <>{children}</>

  if (isHiveSlug) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex flex-col">
        <header className="py-4 px-4 border-b border-white/10 flex-shrink-0">
          <div className="max-w-lg mx-auto flex items-center justify-center">
            <Link href="/">
              <Image
                src="/walz-logo.png"
                alt="Walz Travels"
                width={120}
                height={32}
                className="h-8 w-auto"
                priority
              />
            </Link>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
        <footer className="py-5 text-center flex-shrink-0">
          <p className="text-xs text-white/25">
            Powered by{' '}
            <Link href="/" className="text-[#C9A84C] hover:underline transition-colors">
              Walz Travels
            </Link>
            {' '}· Your trusted travel partner
          </p>
        </footer>
      </div>
    )
  }

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
