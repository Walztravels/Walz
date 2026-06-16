'use client'

import Image                         from 'next/image'
import Link                          from 'next/link'
import { useState }                  from 'react'
import { useCart }                   from '@/lib/context/CartContext'
import { useRouter }                 from 'next/navigation'
import {
  ArrowLeft, Clock, MapPin, Star, Check, X,
  ShoppingCart, Loader2, MessageCircle,
} from 'lucide-react'

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AED: 'AED ', NGN: '₦',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ActivityDetailClient({ activity }: { activity: any }) {
  const { addItem } = useCart()
  const router      = useRouter()
  const [added, setAdded] = useState(false)

  function handleAddToCart() {
    addItem({
      id:       activity.id ?? activity.slug,
      type:     'activity',
      title:    activity.title,
      price:    activity.price > 0 ? activity.price : 50,
      currency: activity.currency ?? 'USD',
      quantity: 1,
      meta: {
        location: activity.location ?? '',
        duration: activity.duration ?? '',
      },
    })
    setAdded(true)
    setTimeout(() => { setAdded(false); router.push('/cart') }, 1500)
  }

  const included    = activity.included    ?? activity.inclusions  ?? []
  const notIncluded = activity.notIncluded ?? activity.exclusions  ?? []
  const highlights  = activity.highlights  ?? []

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* Hero */}
      <div className="relative h-80 md:h-[420px] bg-white/5">
        {activity.image ? (
          <Image
            src={activity.image} alt={activity.title} fill
            className="object-cover" unoptimized
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#0B1F3A] to-[#1C3557]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/30 to-transparent" />

        <Link
          href="/activities/results"
          className="absolute top-6 left-6 bg-black/40 backdrop-blur-sm text-white
            p-2.5 rounded-full hover:bg-black/60 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          {activity.category && (
            <span className="bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold
              uppercase tracking-wider px-3 py-1 rounded-full mb-3 inline-block capitalize">
              {activity.category}
            </span>
          )}
          <h1 className="text-white font-bold text-2xl md:text-4xl leading-tight max-w-3xl">
            {activity.title}
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">

            {/* Quick info bar */}
            <div className="flex flex-wrap gap-4 bg-white/5 rounded-2xl p-4">
              {activity.duration && (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Clock className="w-4 h-4 text-[#C9A84C]" />{activity.duration}
                </div>
              )}
              {activity.location && (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <MapPin className="w-4 h-4 text-[#C9A84C]" />{activity.location}
                </div>
              )}
              {activity.rating > 0 && (
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-white font-semibold text-sm">
                    {Number(activity.rating).toFixed(1)}
                  </span>
                </div>
              )}
              {activity.freeCancel && (
                <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                  <Check className="w-4 h-4" /> Free Cancellation
                </div>
              )}
            </div>

            {/* Description */}
            {(activity.description || activity.shortDesc) && (
              <div className="bg-white/5 rounded-2xl p-5">
                <h2 className="text-white font-bold text-lg mb-3">About this experience</h2>
                <p className="text-white/60 text-sm leading-relaxed">
                  {activity.description || activity.shortDesc}
                </p>
              </div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="bg-white/5 rounded-2xl p-5">
                <h2 className="text-white font-bold text-lg mb-3">Highlights</h2>
                <ul className="space-y-2">
                  {highlights.map((h: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" />{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Included / Not included */}
            {(included.length > 0 || notIncluded.length > 0) && (
              <div className="bg-white/5 rounded-2xl p-5">
                <h2 className="text-white font-bold text-lg mb-3">What&apos;s included</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {included.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />{item}
                    </div>
                  ))}
                  {notIncluded.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-white/40">
                      <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />{item}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Booking sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 sticky top-24">

              {/* Price */}
              <div className="text-center mb-5 pb-5 border-b border-white/10">
                {activity.price > 0 ? (
                  <>
                    <p className="text-white/40 text-xs mb-1">From</p>
                    <p className="text-3xl font-bold text-white">
                      {SYM[activity.currency] ?? activity.currency}
                      {Number(activity.price).toLocaleString()}
                    </p>
                    <p className="text-white/40 text-xs">per person</p>
                  </>
                ) : (
                  <p className="text-[#C9A84C] font-semibold text-sm">Price on request</p>
                )}
              </div>

              {/* Add to cart */}
              <button
                onClick={handleAddToCart}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all
                  flex items-center justify-center gap-2 mb-3 ${
                  added
                    ? 'bg-green-500 text-white'
                    : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f]'
                }`}
              >
                {added
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Added! Going to cart…</>
                  : <><ShoppingCart className="w-4 h-4" /> Add to Cart</>
                }
              </button>

              {/* WhatsApp help */}
              <div className="pt-4 border-t border-white/10 text-center">
                <p className="text-white/30 text-xs mb-2">Need help choosing?</p>
                <a
                  href="https://wa.me/447398753797"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-[#C9A84C]
                    hover:underline font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Ask Jade on WhatsApp
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
