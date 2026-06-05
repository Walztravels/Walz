'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plane, Package, CreditCard, CheckCircle, Loader2, AlertTriangle, Mail, Clock, Shield, MapPin } from 'lucide-react'
import { PassengerForm } from '@/components/booking/PassengerForm'
import { PaymentForm } from '@/components/booking/PaymentForm'
import { Button } from '@/components/ui/button'
import { formatPrice, generateBookingReference } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { BookingPassenger, BookingAddon, FlightResult, BookingStep } from '@/types/booking'

export const dynamic = 'force-dynamic'

/** Fixed service fee added to every booking (USD / same currency as flight) */
const SERVICE_FEE = 75

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

/** Compact flight summary card shown on every step */
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
  const [pnr, setPnr] = useState<string | null>(null)
  const [bookingReference, setBookingReference] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentReceived, setPaymentReceived] = useState(false)
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
  const totalPrice = basePrice + addonsSubtotal + SERVICE_FEE

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

  const handlePaymentSuccess = async (transactionId: string, gateway: 'flutterwave' | 'stripe') => {
    setIsConfirming(true)
    setError(null)

    try {
      const res = await fetch('/api/booking/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway,
          ...(gateway === 'flutterwave' ? { transactionId } : { paymentIntentId: transactionId }),
          bookingReference,
          passengers,
          contactEmail,
          contactPhone,
          flight,
          totalAmount: totalPrice,
          serviceFee: SERVICE_FEE,
          addons: addons.filter((a) => a.selected),
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string; paymentReceived?: boolean }
        if (data.paymentReceived) {
          setPaymentReceived(true)
          setError(data.error ?? 'Booking could not be completed. Please contact support.')
        } else {
          throw new Error(data.error || 'Failed to confirm booking')
        }
        return
      }

      const data = await res.json() as { pnr: string }
      setPnr(data.pnr)
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

        {/* Flight summary bar on all steps except confirmation */}
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
                <div className="flex justify-between text-sm">
                  <span className="text-walz-muted">Service fee</span>
                  <span className="font-medium text-walz-deep-navy">+ {formatPrice(SERVICE_FEE, flight.price.currency)}</span>
                </div>
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

              {/* Payment taken but airline booking failed */}
              {paymentReceived ? (
                <div className="text-center py-4 space-y-5">
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-2">Payment Received — Booking Pending</h3>
                    <p className="text-walz-muted text-sm max-w-sm mx-auto">{error}</p>
                  </div>
                  <div className="bg-walz-deep-navy rounded-2xl p-5 inline-block min-w-[240px]">
                    <p className="text-walz-muted text-xs tracking-widest uppercase mb-1">Your Booking Reference</p>
                    <p className="text-walz-gold text-2xl font-bold tracking-widest font-mono">{bookingReference}</p>
                    <p className="text-walz-muted text-xs mt-2">Quote this when you contact us</p>
                  </div>
                  <a
                    href={`mailto:contact@walztravels.com?subject=Booking%20${bookingReference}&body=Hi%2C%20my%20payment%20went%20through%20but%20my%20booking%20(ref%3A%20${bookingReference})%20could%20not%20be%20confirmed.%20Please%20help.`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-walz-gold text-walz-deep-navy font-semibold text-sm hover:bg-walz-gold-light transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Email Support Now
                  </a>
                  <p className="text-xs text-walz-muted">We will resolve this within 2 hours</p>
                </div>

              ) : isConfirming ? (
                <div className="text-center py-12">
                  <Loader2 className="w-10 h-10 text-walz-gold animate-spin mx-auto mb-4" />
                  <p className="text-walz-deep-navy font-semibold">Confirming your booking…</p>
                  <p className="text-walz-muted text-sm mt-1">Creating your reservation with the airline</p>
                </div>
              ) : (
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
              )}

              {error && !paymentReceived && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg text-walz-error text-sm">{error}</div>
              )}
            </div>
          )}

          {/* ── Step 4: Confirmation ───────────────────────────────────────── */}
          {currentStep === 'confirmation' && (
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-11 h-11 text-walz-success" />
              </div>
              <h2 className="font-display text-2xl font-bold text-walz-deep-navy mb-2">Booking Confirmed!</h2>
              <p className="text-walz-muted mb-6">
                Confirmation sent to <span className="text-walz-deep-navy font-medium">{contactEmail}</span>
              </p>

              {pnr && (
                <div className="bg-walz-deep-navy rounded-2xl p-5 mb-6 inline-block min-w-[260px]">
                  <p className="text-walz-muted text-xs tracking-widest uppercase mb-1">Airline Booking Reference (PNR)</p>
                  <p className="text-walz-gold text-3xl font-bold tracking-widest font-mono">{pnr}</p>
                  <p className="text-walz-muted text-xs mt-2">Internal ref: {bookingReference}</p>
                </div>
              )}

              {/* Flight recap */}
              <div className="bg-walz-off-white rounded-xl p-4 mb-6 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm text-walz-deep-navy font-medium">
                  <MapPin className="w-4 h-4 text-walz-gold" />
                  {flight.outbound[0].departureAirport} → {flight.outbound[flight.outbound.length - 1].arrivalAirport}
                </div>
                <div className="flex items-center gap-2 text-sm text-walz-muted">
                  <Clock className="w-4 h-4" />
                  {new Date(flight.outbound[0].departureTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-2 text-sm text-walz-muted">
                  <Shield className="w-4 h-4" />
                  {passengers.length} passenger{passengers.length !== 1 ? 's' : ''} · {formatPrice(totalPrice, flight.price.currency)} paid
                </div>
              </div>

              <div className="space-y-2 text-sm text-walz-muted mb-6 text-left max-w-sm mx-auto">
                {[
                  'Confirmation email sent',
                  'E-ticket to be issued within 24 hours',
                  'Booking visible in your dashboard',
                ].map((line) => (
                  <div key={line} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-walz-success flex-shrink-0" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 justify-center">
                <Button variant="gold" onClick={() => router.push('/dashboard')}>View My Bookings</Button>
                <Button variant="navy" onClick={() => router.push('/')}>Back to Home</Button>
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
