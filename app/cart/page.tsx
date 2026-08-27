'use client'
import { useCart }              from '@/lib/context/CartContext'
import { Trash2, ShoppingCart, CreditCard, Loader2, AlertCircle } from 'lucide-react'
import { useState, useEffect }  from 'react'
import Link                     from 'next/link'
import { TripRecommendations }  from '@/components/trips/TripRecommendations'

const TYPE_ICONS: Record<string, string> = {
  activity: '🎭', transfer: '🚗', tour: '🗺️', hotel: '🏨', flight: '✈️',
}

const TRIP_KEY = 'walz_trip_id'

export default function CartPage() {
  const { items, removeItem, clearCart, total, itemCount, sessionId } = useCart()
  const [paying,     setPaying]     = useState(false)
  const [gateway,    setGateway]    = useState<'stripe' | 'flutterwave'>('stripe')
  const [checkoutErr,setCheckoutErr]= useState<string | null>(null)
  const [tripId,     setTripId]     = useState<string | null>(null)

  useEffect(() => {
    try { setTripId(localStorage.getItem(TRIP_KEY)) } catch {}
  }, [])

  async function handleCheckout() {
    if (!items.length) return
    setPaying(true)
    setCheckoutErr(null)
    try {
      const res = await fetch('/api/checkout/cart', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items, gateway, sessionId }),
      })
      const data = await res.json()

      if (data.error === 'MIXED_CURRENCY') {
        setCheckoutErr(data.message ?? 'Your cart contains items in multiple currencies. Please keep items in a single currency.')
        return
      }
      if (data.error === 'PRICE_CHANGED') {
        const summary = data.changes?.map((c: { title: string; previousPrice: number; latestPrice: number; currency: string }) =>
          `${c.title}: ${c.currency} ${c.previousPrice} → ${c.latestPrice}`
        ).join('\n')
        setCheckoutErr(`One or more activity prices have changed. Please return to your trip and accept the new prices.\n\n${summary ?? ''}`)
        return
      }
      if (data.error === 'ITEMS_SOLD_OUT') {
        const names = data.items?.map((i: { title: string }) => i.title).join(', ')
        setCheckoutErr(`Some items are no longer available: ${names}. Please remove them before continuing.`)
        return
      }
      if (data.error === 'REVALIDATION_FAILED') {
        setCheckoutErr('We could not confirm the latest price for some activities. Please try again.')
        return
      }
      if (data.url) { window.location.href = data.url; return }
      setCheckoutErr(data.error ?? 'Checkout failed. Please try again.')
    } catch { setCheckoutErr('Checkout failed. Please try again.') }
    finally { setPaying(false) }
  }

  // Build a minimal trip context for cross-sell if no trip is active
  const cartTrip = tripId ? null : {
    id:          'cart',
    destination: items[0]?.meta?.location ?? '',
    origin:      null,
    adults:      Number(items[0]?.meta?.adults ?? 1),
    children:    Number(items[0]?.meta?.children ?? 0),
    infants:     0,
    items:       items.map(i => ({ type: i.type.toUpperCase(), metadata: {} })),
  }

  if (itemCount === 0) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <div className="text-center">
        <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[#0B1F3A] mb-2">Your cart is empty</h2>
        <p className="text-gray-400 text-sm mb-6">Add activities, transfers or tours to get started</p>
        <Link href="/activities"
          className="bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-xl text-sm">
          Browse Activities
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F0E8] py-12">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-8">
          Your Cart <span className="text-[#C9A84C]">({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
        </h1>

        <div className="space-y-3 mb-6">
          {items.map(item => (
            <div key={item.id}
              className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <span className="text-3xl">{TYPE_ICONS[item.type] ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#0B1F3A] text-sm">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{item.type}</p>
                {item.meta.date && (
                  <p className="text-xs text-gray-400">{item.meta.date}</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-[#0B1F3A]">
                  {item.currency} {(item.price * item.quantity).toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">
                  {item.currency} {item.price} × {item.quantity}
                </p>
              </div>
              <button onClick={() => removeItem(item.id)}
                className="text-gray-300 hover:text-red-400 transition-colors ml-2">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Subtotal</span>
            <span className="font-semibold text-[#0B1F3A]">USD {total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-4 pb-4 border-b border-gray-100">
            <span className="text-gray-400">Booking fee</span>
            <span className="text-green-600 font-semibold">Free</span>
          </div>
          <div className="flex justify-between font-bold text-lg">
            <span className="text-[#0B1F3A]">Total</span>
            <span className="text-[#C9A84C]">USD {total.toFixed(2)}</span>
          </div>
        </div>

        {/* Mixed-currency / checkout error */}
        {checkoutErr && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 whitespace-pre-line">{checkoutErr}</p>
          </div>
        )}

        {/* Payment gateway selector */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Payment Method
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'stripe',      label: 'Card / Apple Pay',  sub: 'Visa, Mastercard, Amex'    },
              { id: 'flutterwave', label: 'Flutterwave',       sub: 'Cards, Bank, Mobile Money' },
            ] as const).map(g => (
              <button key={g.id} onClick={() => setGateway(g.id)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  gateway === g.id
                    ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-bold text-[#0B1F3A] text-sm">{g.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{g.sub}</p>
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleCheckout} disabled={paying}
          className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-2xl
            text-base hover:bg-[#b8973f] transition-colors flex items-center
            justify-center gap-2 disabled:opacity-50">
          {paying
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
            : <><CreditCard className="w-5 h-5" /> Pay USD {total.toFixed(2)}</>
          }
        </button>

        <button onClick={clearCart}
          className="w-full mt-3 text-gray-400 text-sm hover:text-red-400 transition-colors py-2">
          Clear cart
        </button>

        {/* Cross-sell recommendations below checkout */}
        {process.env.NEXT_PUBLIC_CROSS_SELL_ENABLED !== 'false' && cartTrip && cartTrip.items.length > 0 && (
          <div className="mt-8 pt-8 border-t border-gray-200">
            <TripRecommendations trip={cartTrip} />
          </div>
        )}
      </div>
    </div>
  )
}
