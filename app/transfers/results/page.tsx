'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter }    from 'next/navigation'
import Link                              from 'next/link'
import {
  ArrowLeft, Car, Users, Briefcase,
  Clock, Loader2, MessageCircle,
} from 'lucide-react'

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultsContent() {
  const searchParams = useSearchParams()
  useRouter()
  const from     = searchParams.get('from')     ?? ''
  const to       = searchParams.get('to')       ?? ''
  const date     = searchParams.get('date')     ?? ''
  const time     = searchParams.get('time')     ?? '10:00'
  const adults   = searchParams.get('adults')   ?? '2'
  const children = searchParams.get('children') ?? '0'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [transfers, setTransfers] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (!from || !to || !date) { setLoading(false); return }
    const qs = new URLSearchParams({ from, to, date, time, adults, children })
    fetch(`/api/transfers/search?${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error && !d.transfers?.length) setError(d.error)
        setTransfers(d.transfers ?? [])
        setLoading(false)
      })
      .catch(() => { setError('Search failed. Please try again.'); setLoading(false) })
  }, [from, to, date, time, adults, children])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function bookWhatsApp(transfer: any) {
    const msg = encodeURIComponent(
      `Hi Walz Travels! I'd like to book a transfer:\n` +
      `From: ${from}\nTo: ${to}\nDate: ${date} at ${time}\n` +
      `Vehicle: ${transfer.name}\nPassengers: ${adults} adults, ${children} children\n` +
      `Price: ${SYM[transfer.currency] ?? transfer.currency}${transfer.price}`
    )
    window.open(`https://wa.me/447398753797?text=${msg}`, '_blank')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin mx-auto mb-4" />
        <p className="text-white/60 text-sm">Searching live transfer options…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F2EE]">
      {/* Header */}
      <div className="bg-[#0B1F3A] px-5 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/transfers" className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Search
          </Link>
          <div className="text-center">
            <p className="text-white text-sm font-semibold">{from} → {to}</p>
            <p className="text-white/40 text-xs">
              {date} at {time} · {adults} adults{Number(children) > 0 ? `, ${children} children` : ''}
            </p>
          </div>
          <div className="w-28" />
        </div>
      </div>

      {/* Results */}
      <div className="max-w-4xl mx-auto px-5 py-8">
        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 text-center">
            <p className="text-amber-800 font-semibold text-sm mb-1">Live search unavailable</p>
            <p className="text-amber-600 text-xs mb-4">{error}</p>
            <a
              href={`https://wa.me/447398753797?text=${encodeURIComponent(`Hi Walz Travels! I need a transfer from ${from} to ${to} on ${date} at ${time} for ${adults} adults.`)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white font-bold px-6 py-2.5 rounded-full text-sm"
            >
              <MessageCircle className="w-4 h-4" /> Book via WhatsApp
            </a>
          </div>
        )}

        {!error && transfers.length === 0 && (
          <div className="text-center py-16">
            <Car className="w-12 h-12 text-gray-300 mx-auto mb-4" strokeWidth={1} />
            <p className="text-gray-500 font-semibold mb-1">No transfers found</p>
            <p className="text-gray-400 text-sm mb-6">Try different locations or dates</p>
            <a
              href={`https://wa.me/447398753797?text=${encodeURIComponent(`Hi Walz Travels! I need a transfer from ${from} to ${to} on ${date} at ${time}.`)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-2.5 rounded-full text-sm"
            >
              <MessageCircle className="w-4 h-4" /> Get Quote via WhatsApp
            </a>
          </div>
        )}

        {transfers.length > 0 && (
          <>
            <p className="text-[#0B1F3A] font-semibold mb-5 text-sm">
              {transfers.length} transfer option{transfers.length !== 1 ? 's' : ''} available
            </p>
            <div className="space-y-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {transfers.map((t: any) => {
                const sym = SYM[t.currency] ?? (t.currency + ' ')
                return (
                  <div key={t.id ?? t.rateKey}
                    className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-5 flex flex-col sm:flex-row gap-4">
                      <div className="w-16 h-16 rounded-xl bg-[#F5F2EE] flex items-center justify-center flex-shrink-0">
                        {t.image
                          ? <img src={t.image} alt={t.name} className="w-12 h-12 object-contain" />
                          : <Car className="w-8 h-8 text-[#C9A84C]" />
                        }
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="font-bold text-[#0B1F3A] text-base">{t.name}</p>
                            {t.category && <p className="text-xs text-gray-400">{t.category}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-[#0B1F3A]">{sym}{t.price.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">total for your journey</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 mt-3">
                          {t.passengers && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Users className="w-3.5 h-3.5 text-[#C9A84C]" /> Up to {t.passengers} passengers
                            </span>
                          )}
                          {t.bags && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Briefcase className="w-3.5 h-3.5 text-[#C9A84C]" /> {t.bags} bags
                            </span>
                          )}
                          {t.duration && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3.5 h-3.5 text-[#C9A84C]" /> ~{t.duration}
                            </span>
                          )}
                          {t.type && (
                            <span className="text-xs bg-[#F5F2EE] text-[#0B1F3A] px-2.5 py-1 rounded-full font-medium">
                              {t.type === 'PRIVATE' ? '🔒 Private' : t.type === 'SHARED' ? '👥 Shared' : t.type}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 px-5 py-3">
                      <button
                        onClick={() => bookWhatsApp(t)}
                        className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A]
                          font-bold py-2.5 rounded-xl text-sm hover:bg-[#b8973f] transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Book via WhatsApp
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function TransferResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin" />
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
