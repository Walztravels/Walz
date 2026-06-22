'use client'

import { Phone } from 'lucide-react'

interface CallButtonProps {
  phoneNumber: string
  label?:      string
  className?:  string
}

export function CallButton({ phoneNumber, label, className }: CallButtonProps) {
  function handleCall() {
    const dial = (window as unknown as Record<string, unknown>).walzDialNumber
    if (typeof dial === 'function') {
      ;(dial as (n: string) => void)(phoneNumber)
    }
  }

  return (
    <button
      onClick={handleCall}
      className={`inline-flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors active:scale-95 ${className ?? ''}`}
    >
      <Phone className="w-3 h-3" strokeWidth={1.5} />
      {label ?? 'Call'}
    </button>
  )
}
