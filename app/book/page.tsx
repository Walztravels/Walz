'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Check, Plane, Package, CreditCard, CheckCircle, Loader2, Mail } from 'lucide-react'
import { PassengerForm } from '@/components/booking/PassengerForm'
import { PaymentForm } from '@/components/booking/PaymentForm'
import { Button } from '@/components/ui/button'
import { formatPrice, generateBookingReference } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { BookingPassenger, BookingAddon, FlightResult, BookingStep } from '@/types/booking'

export const dynamic = 'force-dynamic'

const STEPS: { id: BookingStep; label: string; icon: React.ElementType }[] = [
  { id: 'passengers', label: 'Details', icon: Plane },
  { id: 'addons', label: 'Add-ons', icon: Package },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'confirmation', label: 'Confirmed', icon: CheckCircle },
]

const DEFAULT_ADDONS: BookingAddon[] = [
  { type: 'EXTRA_BAGGAGE', description: 'Extra checked bag (23 kg)', price: 35, currency: 'GBP', selected: false },
  { type: 'TRAVEL_INSURANCE', description: 'Comprehensive travel insurance', price: 18.99, currency: 'GBP', selected: false },
  { type: 'SEAT_SELECTION', description: 'Advance seat selection', price: 12, currency: 'GBP', selected: false },
  { type: 'AIRPORT_TRANSFER', description: 'Airport transfer (each way)', price: 45, currency: 'GBP', selected: false },
]

function StepIndicator({ currentStep }: { currentStep: BookingStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
  return (
    <div className="flex items-center justify-center gap-0 mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, index) => {
        const Icon = step.icon
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                isCompleted ? 'bg-walz-gold border-walz-gold text-walz-deep-navy'
                  : isCurrent ? 'border-walz-gold text-walz-gold bg-white'
                  : 'border-walz-border text-walz-muted bg-white'
              )}>
                {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={cn(
                'text-xs font-medium whitespace-nowrap',
                isCurrent ? 'text-walz-gold' : isCompleted ? 'text-walz-deep-navy' : 'text-walz-muted'
              )}>{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={cn('w-12 lg:w-20 h-0.5 mx-2 mb-5 transition-all duration-300', index < currentIndex ? 'bg-walz-gold' : 'bg-walz-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FlightSummaryBar({ flight, totalPrice, paxCount }: { flight: FlightResult; totalPrice: number; paxCount: number }) {
  const first = flight.outbound[0]
  const last = flight.outbound[flight.outbound.length - 1]
  return (
    <div className="bg-walz-deep-navy rounded-2xl p-4 lg:p-5 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg walz-gold-gradient flex items-center justify-center flex-shrink-0">
            <Plane className="w-4 h-4 text-walz-deep-navy" />
          </div>
          <div className="min-w-0">
            <div className="text-walz-white font-semibold text-sm truncate">
              {first.departureAirport} → {last.arrivalAirport}
            </div>
            <div className="text-walz-muted text-xs truncate">
              {first.airline} · {flight.cabinClass}
              {flight.inbound && ' · Return'} · {paxCount} pax
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-walz-gold font-bold text-lg">{formatPrice(totalPrice, flight.price.currency)}</div>
          <div className="text-walz-muted text-xs">incl. all fees</div>
        </div>
      </div>
    </div>
  )
}

function BookPageContent() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<BookingStep>('passengers')
  const [passengers, setPassengers] = useState<BookingPassenger[]>([])
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [addons, setAddons] = useState<BookingAddon[]>(DEFAULT_ADDONS)
  const [txRef, setTxRef] = useState<string | null>(null)
  const [bookingReference, setBookingReference] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flight, setFlight] = useState<FlightResult | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('pendingFlight')
    if (stored) {
      try {
        setFlight(JSON.parse(stored))
        sessionStorage.removeItem('pendingFlight')
      } catch {
        router.push('/flights')
      }
    } else {
      router.push('/flights')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const basePrice = flight?.price.amount ?? 0
  const addonsTotal = addons.filter((a) => a.selected).reduce((s, a) => s + a.price, 0)
  const addonsSubtotal = addonsTotal * Math.max(passengers.length, 1)
  const totalPrice = basePrice + addonsSubtotal

  const handlePassengersSubmit = (paxData: BookingPassenger[], email: string, phone: string) => {
    setPassengers(paxData)
    setContactEmail(email)
    setContactPhone(phone)
    setCurrentStep('addons')
  }

  const handleAddonsSubmit = () => {
    const ref = generateBookingReference()
    setBookingReference(ref)
    setTxRef(`walz-${ref}-${Date.now()}`)
    setCurrentStep('payment')
  }

  const handlePaymentSuccess = async (transactionId: string | number, gateway: 'flutterwave' | 'stripe' | 'helcim') => {
    setIsConfirming(true)
    setError(null)

    try {
      const res = await fetch('/api/booking/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway,
          ...(gateway === 'flutterwave'
            ? { transactionId: String(transactionId) }
            : gateway === 'helcim'
              ? { helcimTransactionId: transactionId }
              : { paymentIntentId: String(transactionId) }),
          bookingReference,
          passengers,
          contactEmail,
          contactPhone,
          flight,
          totalAmount: totalPrice,
          addons: addons.filter((a) => a.selected),
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || 'Failed to confirm booking')
      }

      setCurrentStep('confirmation')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsConfirming(false)
    }
  }

  if (!flight) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-walz-gold animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-walz-off-white py-8">
      <div className="container-walz max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy">
            Complete Your Booking
          </h1>
          <p className="text-walz-muted mt-1 text-sm">Secure checkout · Flutterwave &amp; Stripe</p>
        </div>

        <StepIndicator currentStep={currentStep} />

        {/* Flight summary bar — hidden on confirmation */}
        {currentStep !== 'confirmation' && (
          <FlightSummaryBar flight={flight} totalPrice={totalPrice} paxCount={Math.max(passengers.length, 1)} />
        )}

        <div className="bg-white rounded-2xl border border-walz-border overflow-hidden shadow-card">

          {/* ── Step 1: Passengers ─────────────────────────────────────────── */}
          {currentStep === 'passengers' && (
            <div className="p-5 lg:p-6">
              <h2 className="font-display text-xl font-bold text-walz-deep-navy mb-1">Passenger Details</h2>
              <p className="text-walz-muted text-sm mb-5">All names must match your passport exactly</p>
              <PassengerForm initialPassengerCount={1} onSubmit={handlePassengersSubmit} />
            </div>
          )}

          {/* ── Step 2: Add-ons ────────────────────────────────────────────── */}
          {currentStep === 'addons' && (
            <div className="p-5 lg:p-6">
              <h2 className="font-display text-xl font-bold text-walz-deep-navy mb-1">Enhance Your Journey</h2>
              <p className="text-walz-muted text-sm mb-5">Optional extras to make your trip even better</p>

              <div className="space-y-3 mb-6">
                {addons.map((addon, i) => (
                  <div
                    key={addon.type}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer',
                      addon.selected ? 'border-walz-gold bg-walz-gold/5' : 'border-walz-border hover:border-walz-gold/50'
                    )}
                    onClick={() => {
                      const updated = [...addons]
                      updated[i] = { ...addon, selected: !addon.selected }
                      setAddons(updated)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all', addon.selected ? 'bg-walz-gold border-walz-gold' : 'border-walz-border')}>
                        {addon.selected && <Check className="w-3 h-3 text-walz-deep-navy" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-walz-deep-navy">{addon.description}</div>
                        <div className="text-xs text-walz-muted">Per passenger, per trip</div>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-walz-gold">+ {formatPrice(addon.price, addon.currency)}</div>
                  </div>
                ))}
              </div>

              {/* Price breakdown */}
              <div className="border border-walz-border rounded-xl p-4 mb-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-walz-muted">Flight price</span>
                  <span className="font-medium text-walz-deep-navy">{formatPrice(basePrice, flight.price.currency)}</span>
                </div>
                {addonsSubtotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-walz-muted">Add-ons</span>
                    <span className="font-medium text-walz-deep-navy">+ {formatPrice(addonsSubtotal, 'GBP')}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-walz-border">
                  <span className="font-semibold text-walz-deep-navy">Total</span>
                  <span className="font-bold text-xl text-walz-gold">{formatPrice(totalPrice, flight.price.currency)}</span>
                </div>
              </div>

              {error && <div className="p-3 bg-red-50 rounded-lg text-walz-error text-sm mb-4">{error}</div>}

              <div className="flex gap-3">
                <Button variant="navy" onClick={() => setCurrentStep('passengers')} className="flex-1">Back</Button>
                <Button variant="gold" onClick={handleAddonsSubmit} className="flex-1">
                  <CreditCard className="w-4 h-4 mr-2" /> Proceed to Payment
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Payment ────────────────────────────────────────────── */}
          {currentStep === 'payment' && txRef && (
            <div className="p-5 lg:p-6">
              <h2 className="font-display text-xl font-bold text-walz-deep-navy mb-5">Secure Payment</h2>

              {isConfirming ? (
                <div className="text-center py-12">
                  <Loader2 className="w-10 h-10 text-walz-gold animate-spin mx-auto mb-4" />
                  <p className="text-walz-deep-navy font-semibold">Saving your booking…</p>
                  <p className="text-walz-muted text-sm mt-1">Please wait, do not close this page</p>
                </div>
              ) : (
                <>
                  <PaymentForm
                    txRef={txRef}
                    amount={totalPrice}
                    currency={flight.price.currency || 'GBP'}
                    customerEmail={contactEmail}
                    customerName={passengers[0] ? `${passengers[0].firstName} ${passengers[0].lastName}` : contactEmail}
                    customerPhone={contactPhone}
                    onSuccess={(id, gw) => handlePaymentSuccess(id, gw)}
                    onError={(err) => setError(err)}
                    bookingReference={bookingReference}
                  />
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg text-walz-error text-sm">{error}</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 4: Confirmation ───────────────────────────────────────── */}
          {currentStep === 'confirmation' && (
            <div>

              {/* Green banner */}
              <div className="bg-green-500 px-5 py-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-white flex-shrink-0" />
                <p className="text-white font-semibold text-sm">
                  Booking Confirmed — Your ticket will be issued within 2 hours
                </p>
              </div>

              <div className="p-6 lg:p-8 space-y-6">

                {/* Check icon + heading */}
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-11 h-11 text-green-500" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-2">Booking Confirmed!</h2>
                  <p className="text-gray-500 text-sm">
                    A confirmation has been sent to{' '}
                    <span className="text-[#0B1F3A] font-semibold">{contactEmail}</span>
                  </p>
                </div>

                {/* Booking reference */}
                <div className="bg-[#0B1F3A] rounded-2xl p-5 text-center">
                  <p className="text-[#8B9BAE] text-xs tracking-widest uppercase mb-1">Booking Reference</p>
                  <p className="text-[#C9A84C] text-3xl font-bold tracking-widest font-mono">{bookingReference}</p>
                </div>

                {/* Flight summary */}
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wider mb-3">Flight Summary</p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-center min-w-[52px]">
                      <p className="text-2xl font-bold text-[#0B1F3A]">{flight.outbound[0].departureAirport}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-1">
                      <div className="flex-1 h-px bg-[#C9A84C]/40" />
                      <Plane className="w-4 h-4 text-[#C9A84C]" />
                      <div className="flex-1 h-px bg-[#C9A84C]/40" />
                    </div>
                    <div className="text-center min-w-[52px]">
                      <p className="text-2xl font-bold text-[#0B1F3A]">
                        {flight.outbound[flight.outbound.length - 1].arrivalAirport}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-gray-400 text-xs block">Date</span>
                      <p className="font-medium text-[#0B1F3A]">
                        {new Date(flight.outbound[0].departureTime).toLocaleDateString('en-GB', {
                          weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block">Airline</span>
                      <p className="font-medium text-[#0B1F3A]">
                        {flight.outbound[0].airline} {flight.outbound[0].flightNumber}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block">Passenger</span>
                      <p className="font-medium text-[#0B1F3A]">
                        {passengers[0]?.firstName} {passengers[0]?.lastName}
                        {passengers.length > 1 && ` +${passengers.length - 1} more`}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block">Total Paid</span>
                      <p className="font-bold text-[#C9A84C] text-base">
                        {formatPrice(totalPrice, flight.price.currency)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Next steps message */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                  <p className="text-sm font-semibold text-[#0B1F3A] mb-1">
                    Your ticket will be issued within 2 hours.
                  </p>
                  <p className="text-xs text-gray-500">
                    Our team will contact you via WhatsApp and email to confirm your ticket.
                  </p>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href={`https://wa.me/447398753797?text=Hi%2C%20I%20just%20booked%20(ref%3A%20${bookingReference}).%20Looking%20forward%20to%20my%20ticket!`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z"/>
                    </svg>
                    WhatsApp Us
                  </a>
                  <a
                    href="mailto:contact@walztravels.com"
                    className="flex items-center justify-center gap-2 px-5 py-3 border border-gray-200 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 rounded-xl text-sm font-semibold text-[#0B1F3A] transition-colors"
                  >
                    <Mail className="w-4 h-4 text-[#C9A84C]" />
                    contact@walztravels.com
                  </a>
                </div>

              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 bg-[#0B1F3A] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Image
                  src="/walz-logo.png"
                  alt="Walz Travels"
                  width={140}
                  height={97}
                  className="h-8 w-auto object-contain"
                />
                <p className="text-[#8B9BAE] text-xs">
                  © {new Date().getFullYear()} Walz Travels · Luxury Travel Agency
                </p>
                <button
                  onClick={() => router.push('/')}
                  className="text-[#C9A84C] hover:text-[#d4b45f] text-xs font-semibold transition-colors"
                >
                  Back to Home
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-walz-gold border-t-transparent rounded-full animate-spin" /></div>}>
      <BookPageContent />
    </Suspense>
  )
}
