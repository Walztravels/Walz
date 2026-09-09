import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { z } from 'zod'


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

    // Authoritative pricing — browser money fields are accepted for
    // backward compatibility but never used for the charge or metadata.
    const { priceTour, TourPricingError } = await import('@/lib/tours/pricing')
    let pricing
    try {
      pricing = await priceTour(d.tourId, d.groupSize, d.addons.map(a => a.id))
    } catch (e) {
      if (e instanceof TourPricingError) return NextResponse.json({ error: e.message }, { status: e.status })
      throw e
    }

    // Build readable description for the Stripe invoice line
    const addonNames = pricing.selectedAddons.map((a) => a.name).join(', ')
    const description = [
      `${d.groupSize} ${d.groupSize === 1 ? 'person' : 'people'}`,
      addonNames ? `Add-ons: ${addonNames}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    // Store ALL booking data in Stripe metadata so we can recreate the booking on return
    const metadata: Record<string, string> = {
      tour_id: pricing.tour.id,
      tour_name: pricing.tour.name.slice(0, 300),
      tour_slug: pricing.tour.slug,
      tour_location: pricing.tour.location.slice(0, 100),
      date: d.date,
      group_size: String(d.groupSize),
      currency: pricing.currency,
      base_price: String(pricing.basePrice),
      addons_total: String(pricing.addonsTotal),
      total_amount: String(pricing.total),
      first_name: d.firstName.slice(0, 100),
      last_name: d.lastName.slice(0, 100),
      email: d.email.slice(0, 200),
      whatsapp: d.whatsapp.slice(0, 30),
      country: d.country.slice(0, 100),
      requirements: d.requirements.slice(0, 450),
      message: d.message.slice(0, 450),
      addons_json: JSON.stringify(pricing.selectedAddons.map(a => ({ id: a.id, name: a.name, price: a.price }))).slice(0, 490),
    }

    const images: string[] = []
    if (d.imageUrl && d.imageUrl.startsWith('https://')) images.push(d.imageUrl)

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: d.email,
      line_items: [
        {
          price_data: {
            currency: pricing.currency.toLowerCase(),
            product_data: {
              name: `${pricing.tour.name} — Private Tour`,
              description,
              ...(images.length > 0 ? { images } : {}),
            },
            unit_amount: Math.round(pricing.total * 100), // Stripe works in pence/cents
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
