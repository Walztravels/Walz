'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plane, Hotel, MapPin, Zap, Globe, Utensils, Car,
  Trash2, Loader2, ShoppingCart, ArrowRight, RefreshCw, X,
  AlertCircle, CheckCircle2,
} from 'lucide-react'
import { useCart }                           from '@/lib/context/CartContext'
import { cn }                                from '@/lib/utils'
import { groupTripTotalsByCurrency }         from '@/lib/trips/currency'
import { TripRecommendations }               from '@/components/trips/TripRecommendations'
import type { CartItem }                     from '@/lib/context/CartContext'

const SESSION_KEY = 'walz_cart_session_id'
const TRIP_KEY    = 'walz_trip_id'

function getSessionId() {
  try { return localStorage.getItem(SESSION_KEY) } catch { return null }
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  FLIGHT:     { label: 'Flight',    icon: <Plane     className="w-4 h-4" />, color: 'text-blue-600'   },
  HOTEL:      { label: 'Hotel',     icon: <Hotel     className="w-4 h-4" />, color: 'text-indigo-600' },
  ACTIVITY:   { label: 'Activity',  icon: <MapPin    className="w-4 h-4" />, color: 'text-emerald-600'},
  TRANSFER:   { label: 'Transfer',  icon: <Car       className="w-4 h-4" />, color: 'text-amber-600'  },
  TRANSPORT:  { label: 'Transport', icon: <Car       className="w-4 h-4" />, color: 'text-amber-600'  },
  ESIM:       { label: 'eSIM',      icon: <Globe     className="w-4 h-4" />, color: 'text-teal-600'   },
  TOUR:       { label: 'Tour',      icon: <MapPin    className="w-4 h-4" />, color: 'text-purple-600' },
  RESTAURANT: { label: 'Dining',    icon: <Utensils  className="w-4 h-4" />, color: 'text-rose-600'   },
  VISA:       { label: 'Visa',      icon: <Globe     className="w-4 h-4" />, color: 'text-cyan-600'   },
  NOTE:       { label: 'Note',      icon: <MapPin    className="w-4 h-4" />, color: 'text-gray-500'   },
  CUSTOM:     { label: 'Item',      icon: <Zap       className="w-4 h-4" />, color: 'text-gray-600'   },
}

interface TripItem {
  id:         string
  type:       string
  title:      string
  cost:       number | null
  currency:   string
  quantity:   number
  imageUrl:   string | null
  location:   string | null
  metadata:   Record<string, unknown>
  sourceType: string | null
  confirmed:  boolean
}

interface Trip {
  id:          string
  title:       string
  destination: string
  origin:      string | null
  currency:    string
  adults:      number
  children:    number
  infants:     number
  status:      string
  items:       TripItem[]
}

// Items that can be moved to cart (all types that have checkout revalidation)
const CART_TYPES = new Set(['ACTIVITY', 'TRANSFER', 'TRANSPORT', 'HOTEL', 'FLIGHT'])

// Maps TripItemType → CartItem.type.
// TRANSPORT is a legacy alias for TRANSFER — map cleanly without as any.
function tripItemTypeToCartType(type: string): CartItem['type'] | null {
  switch (type.toUpperCase()) {
    case 'ACTIVITY':  return 'activity'
    case 'TRANSFER':
    case 'TRANSPORT': return 'transfer'
    case 'TOUR':      return 'tour'
    case 'HOTEL':     return 'hotel'
    case 'FLIGHT':    return 'flight'
    default:          return null
  }
}

type RevalDialogType =
  | 'price_changed'
  | 'sold_out'
  | 'revalidation_failed'
  | 'hotel_price_changed'
  | 'hotel_sold_out'
  | 'flight_expired'

interface RevalDialog {
  type:          RevalDialogType
  item:          TripItem
  previousPrice?: number
  latestPrice?:  number
  currency:      string
}

export default function MyTripPage() {
  const params   = useParams()
  const tripId   = params?.id as string
  const { addItem, sessionId: cartSessionId, items: cartItems } = useCart()

  const [trip,         setTrip]         = useState<Trip | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [removing,     setRemoving]     = useState<string | null>(null)
  const [movingToCart, setMovingToCart] = useState<string | null>(null)
  const [revalDialog,  setRevalDialog]  = useState<RevalDialog | null>(null)
  const [acceptingPrice, setAcceptingPrice] = useState(false)

  const sessionId = cartSessionId ?? getSessionId()

  const fetchTrip = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers: HeadersInit = {}
      if (sessionId) headers['x-walz-session-id'] = sessionId
      const res = await fetch(`/api/trips/${tripId}`, { headers })
      if (!res.ok) { setError('Trip not found'); return }
      const { trip } = await res.json()
      setTrip(trip)
    } catch {
      setError('Could not load trip')
    } finally {
      setLoading(false)
    }
  }, [tripId, sessionId])

  useEffect(() => { fetchTrip() }, [fetchTrip])

  async function removeItem(itemId: string) {
    if (removing) return
    setRemoving(itemId)
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (sessionId) headers['x-walz-session-id'] = sessionId
      await fetch(`/api/trips/${tripId}/items`, {
        method: 'DELETE',
        headers,
        body:   JSON.stringify({ id: itemId }),
      })
      setTrip(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev)
    } finally {
      setRemoving(null)
    }
  }

  function doAddToCart(item: TripItem, priceOverride?: number) {
    const cartType = tripItemTypeToCartType(item.type)
    if (!cartType) return
    addItem({
      id:       item.id,
      type:     cartType,
      title:    item.title,
      price:    priceOverride ?? item.cost ?? 0,
      currency: item.currency,
      quantity: item.quantity,
      meta:     (item.metadata ?? {}) as Record<string, string>,
    })
  }

  async function moveToCart(item: TripItem) {
    if (movingToCart) return
    setMovingToCart(item.id)
    try {
      // ── Flight: check offer expiry before adding to cart ──────────────────
      if (item.type === 'FLIGHT') {
        const expiresAt = item.metadata?.offerExpiresAt as string | undefined
        if (expiresAt && new Date(expiresAt) <= new Date()) {
          setRevalDialog({ type: 'flight_expired', item, currency: item.currency })
          return
        }
      }

      // ── Hotel: check-rate revalidation before adding to cart ──────────────
      const isHotel  = item.type === 'HOTEL' && item.sourceType?.toLowerCase() === 'hotelbeds'
      // ── Activity: Viator revalidation ─────────────────────────────────────
      const isViator = item.sourceType?.toLowerCase() === 'viator' && item.type === 'ACTIVITY'

      if (isHotel || isViator) {
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (sessionId) headers['x-walz-session-id'] = sessionId
        const res = await fetch(`/api/trips/${tripId}/revalidate-item`, {
          method: 'POST',
          headers,
          body:   JSON.stringify({ itemId: item.id }),
        })
        if (!res.ok) {
          setRevalDialog({
            type:     isHotel ? 'revalidation_failed' : 'revalidation_failed',
            item,
            currency: item.currency,
          })
          return
        }
        const reval = await res.json()

        if (reval.status === 'SOLD_OUT') {
          setRevalDialog({ type: isHotel ? 'hotel_sold_out' : 'sold_out', item, currency: reval.currency })
          return
        }
        if (reval.status === 'PRICE_CHANGED') {
          setRevalDialog({
            type:          isHotel ? 'hotel_price_changed' : 'price_changed',
            item,
            previousPrice: reval.previousPrice,
            latestPrice:   reval.latestPrice,
            currency:      reval.currency,
          })
          return
        }
        if (reval.status === 'REVALIDATION_FAILED') {
          setRevalDialog({ type: 'revalidation_failed', item, currency: reval.currency })
          return
        }
        // UNCHANGED or NOT_APPLICABLE → add at current price
      }

      doAddToCart(item)
    } finally {
      setMovingToCart(null)
    }
  }

  async function acceptNewPrice() {
    if (!revalDialog || revalDialog.type !== 'price_changed' || !revalDialog.latestPrice) return
    setAcceptingPrice(true)
    try {
      const { item, latestPrice } = revalDialog
      // Update the stored cost snapshot on the server
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (sessionId) headers['x-walz-session-id'] = sessionId
      await fetch(`/api/trips/${tripId}/items`, {
        method: 'PATCH',
        headers,
        body:   JSON.stringify({ id: item.id, cost: latestPrice }),
      })
      // Update local state
      setTrip(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === item.id ? { ...i, cost: latestPrice } : i),
      } : prev)
      doAddToCart(item, latestPrice)
      setRevalDialog(null)
    } finally {
      setAcceptingPrice(false)
    }
  }

  const currencyTotals = groupTripTotalsByCurrency(trip?.items ?? [])
  const currencyEntries = Object.entries(currencyTotals)
  const hasCartableItems = (trip?.items ?? []).some(i => CART_TYPES.has(i.type))

  if (loading) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
    </div>
  )

  if (error || !trip) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 mb-4">{error ?? 'Trip not found'}</p>
        <Link href="/" className="text-[#C9A84C] font-semibold hover:underline">Back to home</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Header */}
      <div className="bg-[#0B1F3A] text-white">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-widest mb-1">My Trip</p>
              <h1 className="text-2xl font-bold">{trip.title}</h1>
              {trip.destination && (
                <p className="text-white/60 text-sm mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {trip.origin && <>{trip.origin} → </>}{trip.destination}
                </p>
              )}
              <p className="text-white/50 text-xs mt-2">
                {trip.adults} adult{trip.adults !== 1 ? 's' : ''}
                {trip.children > 0 && `, ${trip.children} child${trip.children !== 1 ? 'ren' : ''}`}
                {trip.infants > 0 && `, ${trip.infants} infant${trip.infants !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={fetchTrip}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">

        {trip.items.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <p className="text-gray-400 mb-2">No items in your trip yet</p>
            <p className="text-sm text-gray-300">Browse flights, hotels, and activities and save them here</p>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <Link href="/flights"    className="text-sm bg-[#0B1F3A] text-white px-4 py-2 rounded-lg">Flights</Link>
              <Link href="/hotels"     className="text-sm bg-[#0B1F3A] text-white px-4 py-2 rounded-lg">Hotels</Link>
              <Link href="/activities" className="text-sm bg-[#0B1F3A] text-white px-4 py-2 rounded-lg">Activities</Link>
            </div>
          </div>
        ) : (
          <>
            {trip.items.map(item => {
              const meta        = TYPE_META[item.type] ?? TYPE_META.CUSTOM
              const canAddToCart = CART_TYPES.has(item.type)
              return (
                <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex items-start gap-4 p-4">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('flex items-center gap-1 text-xs font-medium', meta.color)}>
                          {meta.icon}{meta.label}
                        </span>
                        {item.confirmed && (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Confirmed</span>
                        )}
                      </div>
                      <p className="font-semibold text-[#0B1F3A] text-sm leading-tight">{item.title}</p>
                      {item.location && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.location}</p>
                      )}
                      {item.cost !== null && (
                        <p className="text-sm font-bold text-[#C9A84C] mt-1">
                          {item.currency} {(item.cost * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {item.quantity > 1 && (
                            <span className="text-xs text-gray-400 font-normal ml-1">
                              ({item.quantity} × {item.currency} {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canAddToCart && (
                        <button
                          onClick={() => moveToCart(item)}
                          disabled={movingToCart === item.id}
                          title="Add to cart"
                          className="p-2 rounded-lg hover:bg-[#C9A84C]/10 text-[#C9A84C] transition-colors"
                        >
                          {movingToCart === item.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <ShoppingCart className="w-4 h-4" />
                          }
                        </button>
                      )}
                      <button
                        onClick={() => removeItem(item.id)}
                        disabled={removing === item.id}
                        title="Remove"
                        className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        {removing === item.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Total + actions */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mt-6">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                Estimated Total
              </p>
              {currencyEntries.length === 0 ? (
                <p className="text-gray-300 text-sm">No priced items</p>
              ) : currencyEntries.length === 1 ? (
                <p className="text-2xl font-bold text-[#0B1F3A]">
                  {currencyEntries[0][0]}{' '}
                  {currencyEntries[0][1].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              ) : (
                <div className="space-y-1">
                  {currencyEntries.map(([currency, amount]) => (
                    <div key={currency} className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-[#0B1F3A]">
                        {currency} {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                    <AlertCircle className="w-3 h-3" />
                    Items are in multiple currencies — totals shown separately.
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3 mb-5">
                Prices are indicative. Final price confirmed at checkout after live rate check.
              </p>
              {hasCartableItems && cartItems.length > 0 && (
                <Link
                  href="/cart"
                  className="flex items-center justify-center gap-2 w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl text-sm hover:bg-[#b8963e] transition-colors"
                >
                  Go to Cart
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </>
        )}

        {/* Cross-sell recommendations */}
        {process.env.NEXT_PUBLIC_CROSS_SELL_ENABLED !== 'false' && (
          <TripRecommendations trip={trip} />
        )}
      </div>

      {/* Revalidation dialogs */}
      {revalDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">

            {revalDialog.type === 'price_changed' && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                  <h3 className="font-bold text-[#0B1F3A] text-lg">Price Updated</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">{revalDialog.item.title}</p>
                <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Previous</span>
                    <span className="line-through text-gray-400">
                      {revalDialog.currency} {revalDialog.previousPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-[#0B1F3A]">Latest</span>
                    <span className="text-[#C9A84C]">
                      {revalDialog.currency} {revalDialog.latestPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={acceptNewPrice}
                    disabled={acceptingPrice}
                    className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#b8963e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acceptingPrice ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Accept New Price
                  </button>
                </div>
              </>
            )}

            {revalDialog.type === 'sold_out' && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <X className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <h3 className="font-bold text-[#0B1F3A] text-lg">No Longer Available</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">{revalDialog.item.title}</p>
                <p className="text-sm text-gray-500 mb-5">
                  This activity is no longer available for your selected date.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    href="/activities"
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold text-center hover:bg-[#0d2547] transition-colors"
                  >
                    Find Similar
                  </Link>
                </div>
              </>
            )}

            {revalDialog.type === 'revalidation_failed' && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-gray-400 flex-shrink-0" />
                  <h3 className="font-bold text-[#0B1F3A] text-lg">Price Check Failed</h3>
                </div>
                <p className="text-sm text-gray-600 mb-5">
                  We couldn't confirm the latest price for <strong>{revalDialog.item.title}</strong> right now. Please try again.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setRevalDialog(null); moveToCart(revalDialog.item) }}
                    className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold hover:bg-[#0d2547] transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </>
            )}

            {revalDialog.type === 'hotel_price_changed' && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                  <h3 className="font-bold text-[#0B1F3A] text-lg">Hotel Price Updated</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">{revalDialog.item.title}</p>
                <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Previous</span>
                    <span className="line-through text-gray-400">
                      {revalDialog.currency} {revalDialog.previousPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-[#0B1F3A]">New Price</span>
                    <span className="text-[#C9A84C]">
                      {revalDialog.currency} {revalDialog.latestPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Link
                    href="/hotels"
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors text-center"
                  >
                    Choose Another Room
                  </Link>
                  <button
                    onClick={acceptNewPrice}
                    disabled={acceptingPrice}
                    className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#b8963e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acceptingPrice ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Accept New Price
                  </button>
                </div>
              </>
            )}

            {revalDialog.type === 'hotel_sold_out' && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <X className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <h3 className="font-bold text-[#0B1F3A] text-lg">Room No Longer Available</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">{revalDialog.item.title}</p>
                <p className="text-sm text-gray-500 mb-5">
                  This room has sold out. Hotel prices change quickly — browse available rooms and find another option.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    href="/hotels"
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold text-center hover:bg-[#0d2547] transition-colors"
                  >
                    View Other Rooms
                  </Link>
                </div>
              </>
            )}

            {revalDialog.type === 'flight_expired' && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <h3 className="font-bold text-[#0B1F3A] text-lg">Flight Offer Expired</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">{revalDialog.item.title}</p>
                <p className="text-sm text-gray-500 mb-5">
                  This flight offer has expired. Flight prices change quickly — search again for the latest fare.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    href="/flights"
                    onClick={() => setRevalDialog(null)}
                    className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold text-center hover:bg-[#0d2547] transition-colors"
                  >
                    Search Flights
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
