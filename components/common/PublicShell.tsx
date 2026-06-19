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

function JadeChatIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01" strokeWidth="2.5" />
      <path d="M12 10h.01" strokeWidth="2.5" />
      <path d="M16 10h.01" strokeWidth="2.5" />
    </svg>
  )
}

function openChatwoot() {
  if (typeof window === 'undefined') return

  if (window.$chatwoot) {
    window.$chatwoot.toggle('open')
    return
  }

  let attempts = 0
  const poll = setInterval(() => {
    attempts++
    if (window.$chatwoot) {
      clearInterval(poll)
      window.$chatwoot.toggle('open')
    } else if (attempts >= 40) {
      clearInterval(poll)
      window.open(
        'https://wa.me/447398753797?text=Hi%20Jade%2C%20I%20need%20help%20with%20my%20travel%20plans',
        '_blank',
        'noopener,noreferrer',
      )
    }
  }, 200)
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isAdmin  = pathname.startsWith('/admin')

  if (isAdmin) return <>{children}</>

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CurrencyConverter />

      {/* Jade chat FAB — mobile only (Chatwoot renders its own launcher on desktop) */}
      <button
        onClick={openChatwoot}
        aria-label="Chat with Jade"
        className={[
          'fixed bottom-5 right-5 z-[9000]',
          'w-14 h-14 rounded-full',
          'bg-[#0B1F3A]',
          'ring-2 ring-[#C9A84C]',
          'flex items-center justify-center',
          'shadow-xl shadow-[#0B1F3A]/40',
          'hover:bg-[#162d52] hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer',
          'lg:hidden',
        ].join(' ')}
      >
        <JadeChatIcon />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[#C9A84C] animate-ping opacity-20"
        />
      </button>

      <ExitIntentPopup />
    </>
  )
}

