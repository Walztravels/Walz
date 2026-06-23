'use client'

import { useState } from 'react'
import { Bell, Loader2, CheckCircle, X } from 'lucide-react'

interface Props {
  defaultOrigin?:      string
  defaultDestination?: string
  compact?:            boolean
}

export function FlightPriceAlert({ defaultOrigin = '', defaultDestination = '', compact = false }: Props) {
  const [origin,      setOrigin]      = useState(defaultOrigin)
  const [destination, setDestination] = useState(defaultDestination)
  const [email,       setEmail]       = useState('')
  const [name,        setName]        = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')
  const [dismissed,   setDismissed]   = useState(false)

  if (dismissed) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/alerts/flight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name:        name || undefined,
          origin:      origin.trim().toUpperCase(),
          destination: destination.trim().toUpperCase(),
          targetPrice: targetPrice ? parseFloat(targetPrice) : null,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to set alert'); return }
      setSuccess(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="relative bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-green-800 text-sm">Price alert set!</p>
          <p className="text-green-700 text-sm mt-0.5">
            We&apos;ll email you at <strong>{email}</strong> when prices drop for <strong>{origin} → {destination}</strong>.
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="ml-auto text-green-400 hover:text-green-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-[#0B1F3A] px-5 py-3 flex items-center gap-2">
        <Bell className="w-4 h-4 text-[#C9A84C]" />
        <p className="text-white font-bold text-sm">Get Price Alerts</p>
        <p className="text-white/50 text-xs ml-1 hidden sm:block">We&apos;ll notify you when prices drop</p>
      </div>

      <form onSubmit={handleSubmit} className="p-5">
        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
          {/* From / To */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From</label>
            <input
              type="text" value={origin} onChange={e => setOrigin(e.target.value)} required
              placeholder="e.g. LHR or London"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">To</label>
            <input
              type="text" value={destination} onChange={e => setDestination(e.target.value)} required
              placeholder="e.g. LOS or Lagos"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
            />
          </div>

          {/* Email */}
          <div className={compact ? '' : 'sm:col-span-2'}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@email.com"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
            />
          </div>

          {/* Target price (optional) */}
          <div className={compact ? '' : 'sm:col-span-2'}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Target Price <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
              <input
                type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)}
                placeholder="400"
                className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-red-600 text-xs mt-3">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="mt-4 w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-2.5 rounded-xl text-sm hover:bg-[#b8973e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          {loading ? 'Setting alert…' : '🔔 Set Price Alert'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-2">No spam — just price drops. Unsubscribe any time.</p>
      </form>
    </div>
  )
}
