'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { JADE_FOCUS_RING } from '@/lib/jade-club/ui'

// Customer-triggered QR rotation — invalidates every previously issued QR
// for this membership (see lib/jade-club/qr-token.ts). Session-scoped API
// route; no userId is ever sent from the client.
export function RotateQrButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRotate() {
    if (!confirm('Generate a new QR code? Any previously issued QR for this card will stop working immediately.')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/club/qr/rotate', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to rotate QR code')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleRotate}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-[#C9A84C] text-sm font-semibold rounded-xl hover:bg-[#C9A84C]/15 transition-colors disabled:opacity-50 ${JADE_FOCUS_RING}`}>
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {loading ? 'Generating…' : 'Generate new QR code'}
      </button>
      {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
    </div>
  )
}
