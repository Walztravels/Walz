'use client'

import { useEffect, useState } from 'react'
import { Phone, X } from 'lucide-react'

// phone.aircall.io allows iframe embedding; workspace.aircall.io does NOT (X-Frame-Options blocks it)
const AIRCALL_PHONE_URL = 'https://phone.aircall.io?integration=generic'

export function AircallWidget() {
  const [isOpen, setIsOpen] = useState(false)

  // Listen for openAircallWidget event from desktop header button
  useEffect(() => {
    const handler = () => setIsOpen(true)
    window.addEventListener('openAircallWidget', handler)
    return () => window.removeEventListener('openAircallWidget', handler)
  }, [])

  // Request mic permission when panel opens (Chrome/PWA requirement)
  useEffect(() => {
    if (!isOpen) return
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => {})
  }, [isOpen])

  return (
    <>
      {/* Mobile FAB — desktop uses the header Phone button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-amber-500 shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Open Aircall phone"
        >
          <Phone className="w-5 h-5 text-black" strokeWidth={1.5} />
        </button>
      )}

      {/* Phone panel — always in DOM so iframe stays loaded; hidden with display:none when closed */}
      <div
        className="fixed z-50 bottom-20 left-0 right-0 md:bottom-6 md:right-6 md:left-auto md:w-80 bg-[#0a1628] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', display: isOpen ? 'flex' : 'none' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0d1e35] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
            <span className="text-white text-sm font-medium">Aircall Phone</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/40 hover:text-white/70 p-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <iframe
          src={AIRCALL_PHONE_URL}
          allow="microphone; autoplay; clipboard-read; clipboard-write"
          style={{
            height: 'min(540px, calc(100vh - 120px))',
            width: '100%',
            border: 'none',
            flexShrink: 0,
            display: 'block',
          }}
          title="Aircall Phone"
        />
      </div>
    </>
  )
}
