import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const {
      activitySlug,
      activityTitle,
      activityLocation,
      activityDuration,
      price,
      currency,
      adults,
      travelDate,
      clientName,
      clientEmail,
    } = await req.json()

    if (!activityTitle || !price || !currency || !adults) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const zeroDecimalCurrencies = ['bif','clp','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']
    const unitAmount = zeroDecimalCurrencies.includes(currency.toLowerCase())
      ? Math.round(price)
      : Math.round(price * 100)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: adults,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: activityTitle,
              description: `${activityLocation} · ${activityDuration}${travelDate ? ` · Travel date: ${travelDate}` : ''}`,
              metadata: {
                slug:     activitySlug ?? '',
                location: activityLocation ?? '',
                duration: activityDuration ?? '',
              },
            },
          },
        },
      ],
      customer_email: clientEmail || undefined,
      metadata: {
        type:          'activity_booking',
        activitySlug:  activitySlug   ?? '',
        activityTitle: activityTitle  ?? '',
        location:      activityLocation ?? '',
        duration:      activityDuration ?? '',
        travelDate:    travelDate     ?? '',
        adults:        String(adults),
        clientName:    clientName     ?? '',
        clientEmail:   clientEmail    ?? '',
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/activities/booking-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_SITE_URL}/activities/${activitySlug ?? ''}?cancelled=true`,
      payment_intent_data: {
        metadata: {
          source:   'walz_activity_booking',
          activity: activityTitle ?? '',
        },
      },
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Activity Checkout]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
