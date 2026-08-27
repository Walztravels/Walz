'use client'

import Image                         from 'next/image'
import Link                          from 'next/link'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useCart }                   from '@/lib/context/CartContext'
import { useRouter }                 from 'next/navigation'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Clock, MapPin, Star, Check, X,
  ShoppingCart, Loader2, MessageCircle, Users, Calendar, AlertCircle,
} from 'lucide-react'
import { AddToTripButton } from '@/components/trips/AddToTripButton'

// Resolve the best image URL from either the new normalized shape or the legacy HB shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveHeroImage(activity: any): string {
  const images: Array<{ url?: string }> = activity.images ?? []
  for (const img of images) {
    if (img.url && img.url.startsWith('https')) return img.url
  }
  if (activity.image && typeof activity.image === 'string' && activity.image.startsWith('http')) {
    return activity.image
  }
  return ''
}

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AED: 'AED ', NGN: '₦',
}

function fmt(currency: string, amount: number) {
  return `${SYM[currency] ?? currency + ' '}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface ViatorLivePricing {
  available: boolean
  reason?: string
  productCode?: string
  productOptionCode?: string
  totalSellingPrice?: number
  breakdown?: Array<{ ageBand: string; count: number; unitSellingPrice: number; subtotal: number }>
  startTimes?: string[]
  currency?: string
}

interface ViatorBasePricing {
  fromSellingPrice: number
  currency: string
  ageBands: Array<{ band: string; sellingPrice: number; rrp: number }>
  productOptionCode?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ActivityDetailClient({ activity }: { activity: any }) {
  const { addItem } = useCart()
  const router      = useRouter()
  const [added, setAdded]               = useState(false)
  const [date, setDate]                 = useState('')
  const [adults, setAdults]             = useState(1)
  const [children, setChildren]         = useState(0)
  const [infants, setInfants]           = useState(0)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [livePricing, setLivePricing]   = useState<ViatorLivePricing | null>(null)
  const [priceWarning, setPriceWarning] = useState<string | null>(null)
  const prevPriceRef                    = useRef<number | null>(null)
  const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lightboxOpen, setLightboxOpen]   = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const heroImage      = resolveHeroImage(activity)
  const galleryImages: Array<{ url: string }> = (
    Array.isArray(activity.images)
      ? (activity.images as Array<{ url?: string }>)
      : []
  ).filter(img => img?.url?.startsWith('https')).map(img => ({ url: img.url as string }))

  function openLightbox(idx: number) { setLightboxIndex(idx); setLightboxOpen(true) }
  function closeLightbox()            { setLightboxOpen(false) }
  function prevImage()                { setLightboxIndex(i => (i - 1 + galleryImages.length) % galleryImages.length) }
  function nextImage()                { setLightboxIndex(i => (i + 1) % galleryImages.length) }
  const isViator       = activity.source === 'viator'
  const viatorPricing: ViatorBasePricing | null = activity.viatorPricing ?? null
  const displayCurrency = livePricing?.currency ?? activity.currency ?? 'GBP'

  // Coerce to strings — defensive against any objects slipping through
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toStr = (arr: any[]): string[] => arr.map(i => typeof i === 'string' ? i : (i?.otherDescription ?? i?.description ?? i?.typeDescription ?? '')).filter(Boolean)
  const included    = toStr(activity.included    ?? activity.inclusions  ?? [])
  const notIncluded = toStr(activity.notIncluded ?? activity.exclusions  ?? [])
  const highlights  = toStr(activity.highlights  ?? [])

  // Fetch live Viator pricing when date or pax changes
  const fetchLivePricing = useCallback(async (newDate: string, a: number, c: number, i: number) => {
    if (!isViator || !activity.supplierProductId || !newDate) {
      setLivePricing(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setPricingLoading(true)
      setPriceWarning(null)
      try {
        const res = await fetch('/api/activities/viator/pricing', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productCode: activity.supplierProductId,
            date:        newDate,
            adults:      a,
            children:    c,
            infants:     i,
            currency:    viatorPricing?.currency ?? 'GBP',
          }),
        })
        const data: ViatorLivePricing = await res.json()
        // Detect price change (if user already had a confirmed price)
        if (prevPriceRef.current !== null && data.available && data.totalSellingPrice &&
            Math.abs((data.totalSellingPrice ?? 0) - prevPriceRef.current) > 0.01) {
          setPriceWarning(
            `Price updated to ${fmt(data.currency ?? displayCurrency, data.totalSellingPrice)}`
          )
        }
        setLivePricing(data)
      } catch {
        setLivePricing({ available: false, reason: 'Could not retrieve pricing' })
      } finally {
        setPricingLoading(false)
      }
    }, 400)
  }, [isViator, activity.supplierProductId, viatorPricing?.currency, displayCurrency])

  useEffect(() => {
    if (!lightboxOpen) return
    const len = galleryImages.length
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     { setLightboxOpen(false); return }
      if (e.key === 'ArrowLeft')  setLightboxIndex(i => (i - 1 + len) % len)
      if (e.key === 'ArrowRight') setLightboxIndex(i => (i + 1) % len)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, galleryImages.length])

  function handleDateChange(newDate: string) {
    setDate(newDate)
    setLivePricing(null)
    if (newDate) fetchLivePricing(newDate, adults, children, infants)
  }
  function handlePaxChange(a: number, c: number, i: number) {
    setAdults(a); setChildren(c); setInfants(i)
    setLivePricing(null)
    if (date) fetchLivePricing(date, a, c, i)
  }

  // Price to use for Add to Cart — must be a confirmed live price for Viator
  const confirmedPrice = isViator
    ? (livePricing?.available ? (livePricing.totalSellingPrice ?? 0) : 0)
    : (activity.price ?? 0)
  const canAddToCart = isViator
    ? (livePricing?.available === true && (livePricing.totalSellingPrice ?? 0) > 0)
    : (confirmedPrice > 0)

  function handleAddToCart() {
    if (!canAddToCart) return
    // Record the price we're adding so we can detect changes
    prevPriceRef.current = confirmedPrice
    addItem({
      id:       activity.id ?? activity.slug,
      type:     'activity',
      title:    activity.title,
      price:    confirmedPrice,
      currency: displayCurrency,
      quantity: 1,
      meta: Object.fromEntries(Object.entries({
        location:          activity.location ?? '',
        duration:          activity.duration ?? '',
        date,
        supplier:          activity.supplier ?? activity.source ?? '',
        productCode:       activity.supplierProductId ?? '',
        productOptionCode: livePricing?.productOptionCode ?? viatorPricing?.productOptionCode ?? '',
        adults:            String(adults),
        children:          String(children),
        infants:           String(infants),
        startTime:         livePricing?.startTimes?.[0] ?? '',
      }).filter(([, v]) => v !== '')) as Record<string, string>,
    })
    setAdded(true)
    setTimeout(() => { setAdded(false); router.push('/cart') }, 1500)
  }

  // Minimum selectable date = tomorrow
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = minDate.toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* Hero */}
      <div className="relative h-80 md:h-[420px] bg-white/5">
        {heroImage ? (
          <Image
            src={heroImage} alt={activity.title} fill
            className="object-cover" sizes="100vw" priority
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

      {/* Image Gallery — only when 2+ valid images */}
      {galleryImages.length >= 2 && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 mt-2">

          {/* Desktop: Airbnb-style grid — first image large (2×2), up to 4 smaller alongside */}
          <div className="hidden md:grid grid-cols-4 gap-2 h-[320px] overflow-hidden rounded-2xl">
            <button
              className="col-span-2 row-span-2 relative focus:outline-none focus:ring-2
                focus:ring-[#C9A84C] overflow-hidden"
              onClick={() => openLightbox(0)}
              aria-label="View image 1"
            >
              <Image
                src={galleryImages[0].url} alt="" fill
                className="object-cover hover:scale-105 transition-transform duration-500"
                sizes="50vw"
              />
            </button>
            {galleryImages.slice(1, 5).map((img, i) => (
              <button
                key={i}
                className="relative focus:outline-none focus:ring-2 focus:ring-[#C9A84C] overflow-hidden"
                onClick={() => openLightbox(i + 1)}
                aria-label={`View image ${i + 2}`}
              >
                <Image
                  src={img.url} alt="" fill
                  className="object-cover hover:scale-105 transition-transform duration-500"
                  sizes="25vw"
                />
                {i === 3 && galleryImages.length > 5 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center
                    justify-center pointer-events-none">
                    <span className="text-white font-semibold text-sm">
                      +{galleryImages.length - 5} more
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Mobile: horizontal swipeable row */}
          <div
            className="md:hidden flex gap-3 overflow-x-auto pb-3"
            style={{ scrollbarWidth: 'none' }}
          >
            {galleryImages.slice(0, 6).map((img, i) => (
              <button
                key={i}
                className="flex-shrink-0 w-64 h-44 relative rounded-2xl overflow-hidden
                  focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                onClick={() => openLightbox(i)}
                aria-label={`View image ${i + 1}`}
              >
                <Image src={img.url} alt="" fill className="object-cover" sizes="256px" />
              </button>
            ))}
          </div>
        </div>
      )}

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
              {(activity.rating ?? 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-white font-semibold text-sm">
                    {Number(activity.rating).toFixed(1)}
                  </span>
                  {activity.reviewCount ? (
                    <span className="text-white/40 text-xs">({activity.reviewCount.toLocaleString()})</span>
                  ) : null}
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
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 sticky top-24 space-y-4">

              {/* Base "From" price */}
              <div className="text-center pb-4 border-b border-white/10">
                {activity.price > 0 ? (
                  <>
                    <p className="text-white/40 text-xs mb-1">From</p>
                    <p className="text-3xl font-bold text-white">
                      {fmt(activity.currency ?? 'GBP', activity.price)}
                    </p>
                    <p className="text-white/40 text-xs">per adult</p>
                  </>
                ) : (
                  <p className="text-[#C9A84C] font-semibold text-sm">Price on request</p>
                )}
              </div>

              {/* Viator date + pax selector */}
              {isViator && (
                <div className="space-y-3">

                  {/* Date picker */}
                  <div>
                    <label className="block text-white/50 text-xs mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Travel date
                    </label>
                    <input
                      type="date"
                      min={minDateStr}
                      value={date}
                      onChange={e => handleDateChange(e.target.value)}
                      className="w-full bg-white/10 text-white rounded-xl px-3 py-2.5 text-sm
                        border border-white/10 focus:border-[#C9A84C] focus:outline-none
                        [color-scheme:dark]"
                    />
                  </div>

                  {/* Adults */}
                  <div>
                    <label className="block text-white/50 text-xs mb-1 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Travellers
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Adults',   val: adults,   set: (n: number) => handlePaxChange(n, children, infants), min: 1 },
                        { label: 'Children', val: children, set: (n: number) => handlePaxChange(adults, n, infants),   min: 0 },
                        { label: 'Infants',  val: infants,  set: (n: number) => handlePaxChange(adults, children, n), min: 0 },
                      ].map(({ label, val, set, min }) => (
                        <div key={label} className="text-center">
                          <p className="text-white/40 text-[10px] mb-1">{label}</p>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => set(Math.max(min, val - 1))}
                              className="w-6 h-6 rounded-lg bg-white/10 text-white text-sm
                                hover:bg-white/20 transition-colors flex items-center justify-center"
                            >−</button>
                            <span className="text-white text-sm font-semibold w-5 text-center">{val}</span>
                            <button
                              onClick={() => set(val + 1)}
                              className="w-6 h-6 rounded-lg bg-white/10 text-white text-sm
                                hover:bg-white/20 transition-colors flex items-center justify-center"
                            >+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live pricing result */}
                  {pricingLoading && (
                    <div className="flex items-center gap-2 text-white/50 text-xs py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking latest price…
                    </div>
                  )}

                  {priceWarning && (
                    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30
                      rounded-xl p-3 text-amber-400 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {priceWarning}
                    </div>
                  )}

                  {!pricingLoading && livePricing && (
                    <div className="bg-white/5 rounded-xl p-3 space-y-2">
                      {livePricing.available ? (
                        <>
                          {/* Breakdown */}
                          {(livePricing.breakdown ?? []).map((b, i) => (
                            <div key={i} className="flex justify-between text-xs text-white/60">
                              <span>{b.ageBand.charAt(0) + b.ageBand.slice(1).toLowerCase()} × {b.count}</span>
                              <span>{fmt(livePricing.currency ?? displayCurrency, b.subtotal)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
                            <span>Total</span>
                            <span>{fmt(livePricing.currency ?? displayCurrency, livePricing.totalSellingPrice ?? 0)}</span>
                          </div>
                          {/* Time slots if multiple */}
                          {(livePricing.startTimes ?? []).length > 1 && (
                            <p className="text-white/40 text-xs">
                              Times: {livePricing.startTimes!.join(', ')}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-red-400 text-xs">
                          <X className="w-3.5 h-3.5 flex-shrink-0" />
                          {livePricing.reason === 'Date unavailable or sold out'
                            ? 'No availability for this date. Try another date.'
                            : (livePricing.reason ?? 'Not available')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prompt before date selected */}
                  {!date && !pricingLoading && (
                    <p className="text-white/30 text-xs text-center">
                      Select a date to see exact pricing
                    </p>
                  )}
                </div>
              )}

              {/* Add to cart */}
              <button
                onClick={handleAddToCart}
                disabled={!canAddToCart || added}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all
                  flex items-center justify-center gap-2 ${
                  added
                    ? 'bg-green-500 text-white'
                    : canAddToCart
                      ? 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f]'
                      : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                {added
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Added! Going to cart…</>
                  : isViator && !canAddToCart
                    ? <><Calendar className="w-4 h-4" /> Select date &amp; check price</>
                    : <><ShoppingCart className="w-4 h-4" /> Add to Cart</>
                }
              </button>

              {/* Save to Trip */}
              {process.env.NEXT_PUBLIC_TRIP_BUILDER_ENABLED === 'true' && (
                <AddToTripButton
                  size="sm"
                  label="Save to My Trip"
                  className="w-full justify-center"
                  item={{
                    type:        'ACTIVITY',
                    title:       activity.title,
                    cost:        confirmedPrice || (activity.price ?? undefined),
                    currency:    displayCurrency,
                    imageUrl:    resolveHeroImage(activity) || undefined,
                    location:    activity.location ?? undefined,
                    description: activity.description ?? undefined,
                    sourceType:  activity.source ?? activity.supplier ?? undefined,
                    sourceId:    activity.supplierProductId ?? activity.id ?? undefined,
                  }}
                />
              )}

              {/* WhatsApp help */}
              <div className="pt-2 border-t border-white/10 text-center">
                <p className="text-white/30 text-xs mb-2">Need help choosing?</p>
                <a
                  href="https://wa.me/12317902336"
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

      {/* Lightbox — full-screen modal with keyboard navigation */}
      {lightboxOpen && galleryImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Image gallery lightbox"
        >
          {/* Close button — receives autoFocus for focus trapping */}
          <button
            className="absolute top-5 right-5 bg-white/10 hover:bg-white/20 text-white
              rounded-full p-2.5 transition-colors focus:outline-none focus:ring-2
              focus:ring-[#C9A84C] z-10"
            onClick={closeLightbox}
            aria-label="Close gallery"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          >
            <X className="w-5 h-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60
            text-sm select-none pointer-events-none">
            {lightboxIndex + 1} / {galleryImages.length}
          </div>

          {/* Previous */}
          {galleryImages.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10
                hover:bg-white/20 text-white rounded-full p-3 transition-colors
                focus:outline-none focus:ring-2 focus:ring-[#C9A84C] z-10"
              onClick={prevImage}
              aria-label="Previous image"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Current image */}
          <div className="w-full h-full flex items-center justify-center px-20 py-16">
            <div className="relative w-full h-full max-w-5xl">
              {galleryImages[lightboxIndex] && (
                <Image
                  src={galleryImages[lightboxIndex].url}
                  alt={`Gallery image ${lightboxIndex + 1}`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              )}
            </div>
          </div>

          {/* Next */}
          {galleryImages.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10
                hover:bg-white/20 text-white rounded-full p-3 transition-colors
                focus:outline-none focus:ring-2 focus:ring-[#C9A84C] z-10"
              onClick={nextImage}
              aria-label="Next image"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
