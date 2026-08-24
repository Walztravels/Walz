import Stripe from 'stripe'

let _stripe: Stripe | undefined

export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
  return _stripe
}

// Proxy so callers using `stripe.X` keep working without changes.
// The actual Stripe instance is created only on first request (not at module load).
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_t, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver)
  },
})

export async function createStripePaymentIntent(params: {
  amount: number
  currency: string
  metadata?: Record<string, string>
}) {
  return stripe.paymentIntents.create({
    amount: Math.round(params.amount * 100), // Convert to cents
    currency: params.currency,
    metadata: params.metadata ?? {},
    automatic_payment_methods: { enabled: true },
  })
}

export async function constructWebhookEvent(body: string, signature: string) {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  )
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.cancel(paymentIntentId)
}

export async function createRefund(params: {
  paymentIntentId: string
  amount?: number
  reason?: Stripe.RefundCreateParams.Reason
}) {
  return stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    ...(params.amount && { amount: Math.round(params.amount * 100) }),
    ...(params.reason && { reason: params.reason }),
  })
}

// ── Card Pre-Authorization (manual capture) ───────────────────────────────────

export async function createPreAuthIntent(params: {
  amount: number          // in currency units (e.g. 150.00)
  currency: string
  description: string
  customerId?: string
  metadata?: Record<string, string>
}) {
  return stripe.paymentIntents.create({
    amount:         Math.round(params.amount * 100),
    currency:       params.currency,
    capture_method: 'manual',
    description:    params.description,
    ...(params.customerId && { customer: params.customerId }),
    metadata:       params.metadata ?? {},
    automatic_payment_methods: { enabled: true },
  })
}

export async function capturePreAuthIntent(params: {
  paymentIntentId: string
  amountToCapture?: number  // in currency units; omit to capture full hold
}) {
  return stripe.paymentIntents.capture(params.paymentIntentId, {
    ...(params.amountToCapture && {
      amount_to_capture: Math.round(params.amountToCapture * 100),
    }),
  })
}

export async function createStripeCustomer(params: {
  email: string
  name: string
  phone?: string
  metadata?: Record<string, string>
}) {
  return stripe.customers.create({
    email:    params.email,
    name:     params.name,
    ...(params.phone && { phone: params.phone }),
    metadata: params.metadata ?? {},
  })
}
