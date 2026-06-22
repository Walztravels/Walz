'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'walz-pwa-install-dismissed'

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISSED_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!visible || !deferredPrompt) return null

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setVisible(false)
    setDeferredPrompt(null)
  }

  function dismiss() {
    setVisible(false)
    setDeferredPrompt(null)
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* noop */ }
  }

  return (
    <div className="md:hidden fixed bottom-[68px] left-3 right-3 z-[49] bg-[#0B1F3A] border border-white/15 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#C9A84C] flex items-center justify-center flex-shrink-0">
        <Download className="w-4 h-4 text-[#0B1F3A]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold leading-tight">Add Walz Staff to Home Screen</p>
        <p className="text-white/40 text-[10px] leading-tight mt-0.5">Open instantly, like a native app</p>
      </div>
      <button
        onClick={install}
        className="flex-shrink-0 px-3 py-1.5 bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold rounded-lg"
      >
        Install
      </button>
      <button onClick={dismiss} className="flex-shrink-0 p-1 text-white/30 hover:text-white/60">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
