'use client'

import { useState, useEffect } from 'react'
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Shield, Lock, CreditCard, Loader2, Smartphone, Building2 } from 'lucide-react' // Building2 kept for Flutterwave panel
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Singleton — initialised once at module level so it's never recreated on re-render
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

// ── Inner Stripe form — must live inside <Elements> ───────────────────────────
function StripeInnerForm({
  amount,
  currency,
  onSuccess,
  onError,
}: {
  amount: number
  currency: string
  onSuccess: (paymentIntentId: string) => void
  onError: (err: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setIsProcessing(true)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (error) {
      onError(error.message ?? 'Payment failed. Please try again.')
      setIsProcessing(false)
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id)
    } else {
      onError('Payment was not completed. Please try again.')
      setIsProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        variant="gold"
        size="xl"
        disabled={!stripe || !elements || isProcessing}
        className="w-full mt-2"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Lock className="w-5 h-5 mr-2" />
            Pay {formatPrice(amount, currency.toUpperCase())} with Card
          </>
        )}
      </Button>
    </form>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface PaymentFormProps {
  txRef: string
  amount: number
  currency: string
  customerEmail: string
  customerName: string
  customerPhone?: string
  bookingReference?: string
  onSuccess: (transactionId: string | number, gateway: 'flutterwave' | 'stripe') => void
  onError: (error: string) => void
}

export function PaymentForm({
  txRef,
  amount,
  currency,
  customerEmail,
  customerName,
  customerPhone,
  bookingReference,
  onSuccess,
  onError,
}: PaymentFormProps) {
  const [gateway, setGateway] = useState<'stripe' | 'flutterwave'>('stripe')
  const [isFlwProcessing, setIsFlwProcessing] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoadingStripe, setIsLoadingStripe] = useState(false)

  // ── Flutterwave config (hook must always be called — React rules) ──────────
  const flwConfig = {
    public_key: process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY!,
    tx_ref: txRef,
    amount,
    currency: currency.toUpperCase(),
    payment_options: 'card,banktransfer,ussd,mobilemoney',
    customer: {
      email: customerEmail,
      phone_number: customerPhone ?? '',
      name: customerName,
    },
    customizations: {
      title: 'Walz Travels',
      description: bookingReference
        ? `Flight Booking · Ref: ${bookingReference}`
        : 'Flight Booking',
      logo: 'https://walz-travels.vercel.app/logo.png',
    },
  }

  const handleFlutterPayment = useFlutterwave(flwConfig)

  // ── Switch to Stripe — lazily fetches clientSecret ─────────────────────────
  const handleSwitchToStripe = async () => {
    setGateway('stripe')
    if (clientSecret) return // already fetched for this session

    setIsLoadingStripe(true)
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          bookingReference: bookingReference ?? txRef,
          contactEmail: customerEmail,
          gateway: 'stripe',
        }),
      })
      const data = await res.json() as { clientSecret?: string; error?: string }
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? 'Failed to initialise Stripe. Please use Flutterwave.')
      }
      setClientSecret(data.clientSecret)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Stripe unavailable. Please use Flutterwave.')
      setGateway('flutterwave')
    } finally {
      setIsLoadingStripe(false)
    }
  }

  // Auto-load Stripe on mount since it is the default gateway
  useEffect(() => {
    handleSwitchToStripe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Flutterwave launch ─────────────────────────────────────────────────────
  const handleFlwPay = () => {
    setIsFlwProcessing(true)
    handleFlutterPayment({
      callback: (response) => {
        closePaymentModal()
        if (response.status === 'successful' || response.status === 'completed') {
          onSuccess(String(response.transaction_id), 'flutterwave')
        } else {
          setIsFlwProcessing(false)
          onError(`Payment ${response.status}. Please try again.`)
        }
      },
      onClose: () => setIsFlwProcessing(false),
    })
  }

  return (
    <div className="space-y-6">
      {/* Security badge */}
      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
        <Shield className="w-5 h-5 text-walz-success flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-walz-success">Secure Payment</p>
          <p className="text-xs text-green-600">256-bit SSL encrypted · PCI DSS compliant</p>
        </div>
      </div>

      {/* Amount summary */}
      <div className="p-4 bg-walz-deep-navy rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-walz-muted text-sm">Total Amount</p>
            {bookingReference && (
              <p className="text-walz-muted text-xs mt-0.5">Ref: {bookingReference}</p>
            )}
          </div>
          <p className="text-walz-gold text-2xl font-bold">
            {formatPrice(amount, currency.toUpperCase())}
          </p>
        </div>
      </div>

      {/* Gateway selector */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-walz-off-white rounded-xl border border-walz-border">
        <button
          type="button"
          onClick={handleSwitchToStripe}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all',
            gateway === 'stripe'
              ? 'bg-white shadow-sm text-walz-deep-navy border border-walz-border'
              : 'text-walz-muted hover:text-walz-deep-navy'
          )}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Card (Stripe)
        </button>
        <button
          type="button"
          onClick={() => setGateway('flutterwave')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all',
            gateway === 'flutterwave'
              ? 'bg-white shadow-sm text-walz-deep-navy border border-walz-border'
              : 'text-walz-muted hover:text-walz-deep-navy'
          )}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Flutterwave
        </button>
      </div>

      {/* ── Flutterwave panel ── */}
      {gateway === 'flutterwave' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: CreditCard, label: 'Card' },
              { icon: Building2, label: 'Bank Transfer' },
              { icon: Smartphone, label: 'Mobile Money' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-walz-border bg-walz-off-white"
              >
                <Icon className="w-5 h-5 text-walz-gold" />
                <span className="text-xs text-walz-muted font-medium">{label}</span>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="gold"
            size="xl"
            disabled={isFlwProcessing}
            className="w-full"
            onClick={handleFlwPay}
          >
            {isFlwProcessing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Opening payment…
              </>
            ) : (
              <>
                <Lock className="w-5 h-5 mr-2" />
                Pay {formatPrice(amount, currency.toUpperCase())} Securely
              </>
            )}
          </Button>

          <p className="text-center text-xs text-walz-muted">
            Powered by Flutterwave · Cards, Bank Transfer, USSD, Mobile Money
          </p>
        </div>
      )}

      {/* ── Stripe panel ── */}
      {gateway === 'stripe' && (
        <div className="space-y-4">
          {isLoadingStripe ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-walz-gold animate-spin mr-3" />
              <span className="text-walz-muted text-sm">Setting up secure payment…</span>
            </div>
          ) : clientSecret && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#C9A84C',
                    colorBackground: '#ffffff',
                    borderRadius: '10px',
                    fontFamily: 'inherit',
                  },
                },
              }}
            >
              <StripeInnerForm
                amount={amount}
                currency={currency}
                onSuccess={(id) => onSuccess(id, 'stripe')}
                onError={onError}
              />
            </Elements>
          ) : (
            <div className="text-center py-8 space-y-2">
              <CreditCard className="w-8 h-8 mx-auto text-walz-muted/40" />
              <p className="text-sm text-walz-muted">
                Stripe is not configured. Please use Flutterwave or contact support.
              </p>
            </div>
          )}

          {!isLoadingStripe && (
            <p className="text-center text-xs text-walz-muted">
              Powered by Stripe · All major credit &amp; debit cards accepted
            </p>
          )}
        </div>
      )}

      {/* Trust row */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-walz-muted">
          <Shield className="w-3.5 h-3.5" />
          <span>Secured</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-walz-muted">
          <Lock className="w-3.5 h-3.5" />
          <span>256-bit SSL</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-walz-muted">
          <CreditCard className="w-3.5 h-3.5" />
          <span>All major cards</span>
        </div>
      </div>
    </div>
  )
}
