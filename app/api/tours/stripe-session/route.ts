import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

const schema = z.object({
  tourId: z.string().min(1),
  tourName: z.string().min(1),
  tourSlug: z.string().min(1),
  tourLocation: z.string().optional().default(''),
  date: z.string().min(1),
  groupSize: z.number().int().min(1),
  currency: z.string().length(3),
  addons: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })),
  basePrice: z.number().min(0),
  addonsTotal: z.number().min(0),
  totalAmount: z.number().min(0),
  imageUrl: z.string().nullable().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  whatsapp: z.string().min(7),
  country: z.string().min(1),
  requirements: z.string().optional().default(''),
  message: z.string().optional().default(''),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    const d = parsed.data
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

    // Build readable description for the Stripe invoice line
    const addonNames = d.addons.map((a) => a.name).join(', ')
    const description = [
      `${d.groupSize} ${d.groupSize === 1 ? 'person' : 'people'}`,
      addonNames ? `Add-ons: ${addonNames}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    // Store ALL booking data in Stripe metadata so we can recreate the booking on return
    const metadata: Record<string, string> = {
      tour_id: d.tourId,
      tour_name: d.tourName.slice(0, 300),
      tour_slug: d.tourSlug,
      tour_location: (d.tourLocation ?? '').slice(0, 100),
      date: d.date,
      group_size: String(d.groupSize),
      currency: d.currency,
      base_price: String(d.basePrice),
      addons_total: String(d.addonsTotal),
      total_amount: String(d.totalAmount),
      first_name: d.firstName.slice(0, 100),
      last_name: d.lastName.slice(0, 100),
      email: d.email.slice(0, 200),
      whatsapp: d.whatsapp.slice(0, 30),
      country: d.country.slice(0, 100),
      requirements: d.requirements.slice(0, 450),
      message: d.message.slice(0, 450),
      addons_json: JSON.stringify(d.addons).slice(0, 490),
    }

    const images: string[] = []
    if (d.imageUrl && d.imageUrl.startsWith('https://')) images.push(d.imageUrl)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: d.email,
      line_items: [
        {
          price_data: {
            currency: d.currency.toLowerCase(),
            product_data: {
              name: `${d.tourName} — Private Tour`,
              description,
              ...(images.length > 0 ? { images } : {}),
            },
            unit_amount: Math.round(d.totalAmount * 100), // Stripe works in pence/cents
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/tours/book/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/tours/book?slug=${d.tourSlug}`,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[Stripe Session]', err)
    return NextResponse.json({ error: 'Failed to create payment session' }, { status: 500 })
  }
}
