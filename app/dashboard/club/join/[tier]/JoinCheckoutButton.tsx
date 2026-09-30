'use client'

// JoinCheckoutButton.tsx — Jade Travel Club Release 2B: "Continue to
// payment". Sends ONLY { tier, market, currency } to the server — never a
// price. The server resolves and charges the authoritative amount.

import { useState } from 'react'

export default function JoinCheckoutButton({ tier, market, currency }: { tier: string; market: string; currency: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/jade-club/purchase/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, market, currency }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? 'Could not start checkout. Please try again.')
        setLoading(false)
        return
      }
      window.location.href = data.checkoutUrl
    } catch {
      setError('Could not start checkout. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="mt-5">
      <button
        onClick={startCheckout}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#C9A84C] to-[#a87e38] text-[#0B1F3A] font-bold text-sm disabled:opacity-50"
      >
        {loading ? 'Starting checkout…' : 'Continue to payment'}
      </button>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
