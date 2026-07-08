'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Car, Users, Briefcase,
  Clock, Loader2, MessageCircle, ShoppingCart,
} from 'lucide-react'
import { useCart } from '@/lib/context/CartContext'

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦',
}

interface Transfer {
  id?: string; rateKey?: string; name: string; category?: string
  vehicle?: string; type?: string; image?: string
  passengers?: number; bags?: number; duration?: string
  price: number; currency: string
}

interface TransferCardProps {
  t: Transfer
  from: string; to: string; date: string; time: string
  adults: string; children: string
}

function TransferCard({ t, from, to, date, time, adults, children }: TransferCardProps) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  const sym          = SYM[t.currency] ?? (t.currency + ' ')
  const vehicleEmoji = t.type === 'SHARED' ? '🚌'
    : t.vehicle?.toLowerCase().includes('van') ? '🚐' : '🚗'

  function bookWhatsApp() {
    const msg = encodeURIComponent(
      `Hi Walz Travels! I'd like to book a transfer:\n` +
      `From: ${from}\nTo: ${to}\nDate: ${date} at ${time}\n` +
      `Vehicle: ${t.name}\nPassengers: ${adults} adults, ${children} children\n` +
      `Price: ${sym}${t.price}`
    )
    window.open(`https://wa.me/12317902336?text=${msg}`, '_blank')
  }

  function handleAddToCart() {
    addItem({
      id:       t.id ?? t.rateKey ?? t.name,
      type:     'transfer',
      title:    t.name,
      price:    t.price,
      currency: t.currency ?? 'GBP',
      quantity: 1,
      meta: {
        from,
        to,
        date,
        passengers: adults,
        vehicle:    t.vehicle ?? '',
      },
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#F5F2EE] flex items-center justify-center flex-shrink-0 text-3xl">
          {t.image
            ? <img src={t.image} alt={t.name} className="w-10 h-10 object-contain" />
            : vehicleEmoji
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-[#0B1F3A] text-sm truncate">{t.name}</p>
              {t.category && <p className="text-xs text-gray-400">{t.category}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl font-bold text-[#0B1F3A]">{sym}{t.price.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400">total</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {t.passengers && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Users className="w-3 h-3 text-[#C9A84C]" /> {t.passengers} pax
              </span>
            )}
            {t.bags && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Briefcase className="w-3 h-3 text-[#C9A84C]" /> {t.bags} bags
              </span>
            )}
            {t.duration && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3 text-[#C9A84C]" /> ~{t.duration}
              </span>
            )}
            {t.type && (
              <span className="text-xs bg-[#F5F2EE] text-[#0B1F3A] px-2 py-0.5 rounded-full font-medium">
                {t.type === 'PRIVATE' ? '🔒 Private' : t.type === 'SHARED' ? '👥 Shared' : t.type}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5 flex gap-2">
        <button
          onClick={handleAddToCart}
          className={`flex-1 flex items-center justify-center gap-1.5 font-bold py-2.5 rounded-xl text-sm transition-colors ${
            added
              ? 'bg-green-500 text-white'
              : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f]'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          {added ? 'Added!' : 'Add to Cart'}
        </button>
        <button
          onClick={bookWhatsApp}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600
            text-sm font-bold hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>
      </div>
    </div>
  )
}

function ResultsContent() {
  const searchParams = useSearchParams()
  const from     = searchParams.get('from')     ?? ''
  const to       = searchParams.get('to')       ?? ''
  const toType   = searchParams.get('toType')   ?? 'IATA'
  const date     = searchParams.get('date')     ?? ''
  const time     = searchParams.get('time')     ?? '10:00'
  const adults   = searchParams.get('adults')   ?? '2'
  const children = searchParams.get('children') ?? '0'

  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (!from || !to || !date) { setLoading(false); return }
    const qs = new URLSearchParams({ from, to, toType, date, time, adults, children })
    fetch(`/api/transfers/search?${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error && !d.transfers?.length) setError(d.error)
        setTransfers(d.transfers ?? [])
        setLoading(false)
      })
      .catch(() => { setError('Search failed. Please try again.'); setLoading(false) })
  }, [from, to, toType, date, time, adults, children])

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
      <div className="max-w-3xl mx-auto px-5 py-8">
        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 text-center">
            <p className="text-amber-800 font-semibold text-sm mb-1">Live search unavailable</p>
            <p className="text-amber-600 text-xs mb-4">{error}</p>
            <a
              href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi Walz Travels! I need a transfer from ${from} to ${to} on ${date} at ${time} for ${adults} adults.`)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white font-bold px-6 py-2.5 rounded-full text-sm"
            >
              <MessageCircle className="w-4 h-4" /> Book via WhatsApp
            </a>
          </div>
        )}

        {!error && transfers.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🚗</div>
            <p className="text-gray-500 font-semibold mb-1">No transfers found</p>
            <p className="text-gray-400 text-sm mb-6">Try different locations or dates</p>
            <a
              href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi Walz Travels! I need a transfer from ${from} to ${to} on ${date} at ${time}.`)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-2.5 rounded-full text-sm"
            >
              <MessageCircle className="w-4 h-4" /> Get Quote via WhatsApp
            </a>
          </div>
        )}

        {transfers.length > 0 && (
          <>
            <p className="text-[#0B1F3A] font-semibold mb-4 text-sm">
              {transfers.length} transfer option{transfers.length !== 1 ? 's' : ''} available
            </p>
            <div className="space-y-3">
              {transfers.map(t => (
                <TransferCard
                  key={t.id ?? t.rateKey ?? t.name}
                  t={t}
                  from={from} to={to} date={date} time={time}
                  adults={adults} children={children}
                />
              ))}
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
