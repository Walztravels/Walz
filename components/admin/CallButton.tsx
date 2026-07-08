'use client'

import { Phone } from 'lucide-react'

interface CallButtonProps {
  phoneNumber: string
  label?:      string
  className?:  string
}

// Uses tel: so the Aircall Chrome extension intercepts clicks and pre-fills
// the dialer. On mobile it opens the native dialer directly.
export function CallButton({ phoneNumber, label, className }: CallButtonProps) {
  return (
    <a
      href={`tel:${phoneNumber}`}
      className={`inline-flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors active:scale-95 ${className ?? ''}`}
    >
      <Phone className="w-3 h-3" strokeWidth={1.5} />
      {label ?? 'Call'}
    </a>
  )
}
