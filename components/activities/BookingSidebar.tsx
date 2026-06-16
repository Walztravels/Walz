'use client'

import { useState } from 'react'
import { Loader2, CreditCard, MapPin, Clock, Users, Star } from 'lucide-react'
import { JadeChat } from '@/components/ui/JadeChat'
import { AddToCartButton } from '@/components/activities/AddToCartButton'

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', NGN: '₦', GHS: '₵', AED: 'AED ',
}

interface ActivityInfo {
  slug: string
  title: string
  location: string
  duration: string
  price: number
  currency: string
  badge?: string | null
}

export function BookingSidebar({ activity }: { activity: ActivityInfo }) {
  const sym      = SYM[activity.currency] ?? ''
  const priceStr = `${activity.currency} ${sym}${Number(activity.price).toLocaleString()}`

  const jadeContext = {
    source:      'activity_page',
    pageTitle:   activity.title,
    pageUrl:     `/activities/${activity.slug}`,
    price:       priceStr,
    location:    activity.location,
    enquiryType: 'activity_booking',
  }

  const [adults,        setAdults]        = useState(1)
  const [travelDate,    setTravelDate]    = useState('')
  const [checkingOut,   setCheckingOut]   = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  async function handleStripeCheckout() {
    setCheckingOut(true)
    setCheckoutError('')
    try {
      const res = await fetch('/api/stripe/activity-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activitySlug:     activity.slug,
          activityTitle:    activity.title,
          activityLocation: activity.location,
          activityDuration: activity.duration,
          price:            activity.price,
          currency:         activity.currency,
          adults,
          travelDate,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError(data.error ?? 'Checkout failed. Please try again.')
        setCheckingOut(false)
      }
    } catch {
      setCheckoutError('Something went wrong. Please try again.')
      setCheckingOut(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm sticky top-6">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">From</p>
      <p className="text-3xl font-bold text-[#0B1F3A] mb-0.5">
        {sym}{Number(activity.price).toLocaleString()}
      </p>
      <p className="text-gray-400 text-xs mb-5">
        {activity.currency} per person · {activity.duration}
      </p>

      {/* Guest count */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Guests
        </label>
        <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5">
          <button
            onClick={() => setAdults(a => Math.max(1, a - 1))}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center
              text-gray-500 hover:bg-[#C9A84C]/20 font-bold text-lg leading-none"
          >−</button>
          <span className="flex-1 text-center font-semibold text-[#0B1F3A]">
            {adults} {adults === 1 ? 'adult' : 'adults'}
          </span>
          <button
            onClick={() => setAdults(a => Math.min(20, a + 1))}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center
              text-gray-500 hover:bg-[#C9A84C]/20 font-bold text-lg leading-none"
          >+</button>
        </div>
      </div>

      {/* Travel date */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Travel date (optional)
        </label>
        <input
          type="date"
          value={travelDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={e => setTravelDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
            text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C]"
        />
      </div>

      {/* Total (shown when > 1 guest) */}
      {adults > 1 && (
        <div className="flex justify-between items-center text-sm mb-5 bg-[#F5F0E8] rounded-xl px-4 py-2.5">
          <span className="text-gray-500">Total ({adults} guests)</span>
          <span className="font-bold text-[#0B1F3A]">
            {sym}{(activity.price * adults).toLocaleString()} {activity.currency}
          </span>
        </div>
      )}

      {checkoutError && (
        <p className="text-red-500 text-xs mb-3 text-center">{checkoutError}</p>
      )}

      {/* Primary CTA — Add to Cart */}
      <div className="mb-3">
        <AddToCartButton
          activity={activity}
          date={travelDate}
          adults={adults}
        />
      </div>

      {/* Secondary CTA — Stripe direct checkout */}
      <button
        onClick={handleStripeCheckout}
        disabled={checkingOut}
        className="w-full flex items-center justify-center gap-2 bg-[#0B1F3A] text-white
          font-bold py-3.5 rounded-2xl hover:bg-[#162d52] transition-colors mb-3
          disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {checkingOut
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <CreditCard className="w-4 h-4" />
        }
        {checkingOut
          ? 'Redirecting…'
          : `Book & Pay ${sym}${(activity.price * adults).toLocaleString()}`
        }
      </button>

      {/* Tertiary CTA — Jade chat */}
      <JadeChat
        context={jadeContext}
        label="Chat with Jade Instead"
        className="w-full mb-3 py-3"
        variant="outline"
      />

      {/* Trust signals */}
      <div className="space-y-3 pt-4 border-t border-gray-100">
        {[
          { icon: Clock,  text: activity.duration },
          { icon: MapPin, text: activity.location },
          { icon: Users,  text: `${adults} ${adults === 1 ? 'adult' : 'adults'}` },
          { icon: Star,   text: activity.badge ?? 'Walz Curated Experience' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm text-gray-500">
            <item.icon className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
            {item.text}
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100 text-center space-y-1">
        <p className="text-xs text-gray-400">🔒 Secure payment via Stripe</p>
        <p className="text-xs text-gray-400">Instant confirmation · Easy cancellation</p>
      </div>
    </div>
  )
}
