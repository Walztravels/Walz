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

  return null
}
