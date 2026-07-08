'use client'

import { useEffect } from 'react'
import { Phone } from 'lucide-react'

const WORKSPACE_URL = 'https://workspace.aircall.io'

function openWorkspace() {
  window.open(WORKSPACE_URL, 'aircall-workspace', 'width=400,height=720,noopener,noreferrer')
}

export function AircallWidget() {
  // Listen for openAircallWidget event from desktop header button
  useEffect(() => {
    const handler = () => openWorkspace()
    window.addEventListener('openAircallWidget', handler)
    return () => window.removeEventListener('openAircallWidget', handler)
  }, [])

  return (
    // Mobile FAB — desktop uses the header Phone button via the event above
    <button
      onClick={openWorkspace}
      className="md:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-amber-500 shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      aria-label="Open Aircall"
    >
      <Phone className="w-5 h-5 text-black" strokeWidth={1.5} />
    </button>
  )
}
