'use client'
import { useCart } from '@/lib/context/CartContext'
import { Trash2, ShoppingCart, CreditCard, Loader2 } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

const TYPE_ICONS: Record<string, string> = {
  activity: '🎭', transfer: '🚗', tour: '🗺️', hotel: '🏨', flight: '✈️',
}

export default function CartPage() {
  const { items, removeItem, clearCart, total, itemCount } = useCart()
  const [paying,  setPaying]  = useState(false)
  const [gateway, setGateway] = useState<'stripe' | 'flutterwave'>('stripe')

  async function handleCheckout() {
    if (!items.length) return
    setPaying(true)
    try {
      const res = await fetch('/api/checkout/cart', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items, gateway }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert(data.error ?? 'Checkout failed. Please try again.')
    } catch { alert('Checkout failed. Please try again.') }
    finally { setPaying(false) }
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

        {/* Payment gateway selector */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Payment Method
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'stripe',       label: 'Card / Apple Pay',  sub: 'Visa, Mastercard, Amex'    },
              { id: 'flutterwave',  label: 'Flutterwave',       sub: 'Cards, Bank, Mobile Money' },
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
      </div>
    </div>
  )
}
