import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { rateLimit } from '@/lib/rate-limit'
import { findOfferByToken, respondToOffer, offerExpired } from '@/lib/recruitment/offers'

export const dynamic = 'force-dynamic'

const NOTIFY_TO   = 'contact@walztravels.com'
const NOTIFY_FROM = 'Walz Travels <hello@walztravels.com>'

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// GET — the candidate's view of their offer. Token-gated; exposes only the
// offer content and the candidate's first name.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = rateLimit({ key: `offer-view:${clientIp(req)}`, limit: 60, windowMs: 60 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  try {
    const offer = await findOfferByToken(params.token)
    if (!offer) return NextResponse.json({ error: 'This offer link is not valid' }, { status: 404 })
    if (offer.status === 'sent' && offerExpired(offer)) {
      return NextResponse.json({ error: 'This offer link has expired — contact us' }, { status: 410 })
    }
    const application = await prisma.jobApplication.findUnique({
      where:  { id: offer.applicationId },
      select: { reference: true, candidate: { select: { firstName: true } } },
    })
    return NextResponse.json({
      offer: {
        status: offer.status,
        jobTitle: offer.jobTitle,
        compensationType: offer.compensationType,
        compensationAmount: offer.compensationAmount,
        currency: offer.currency,
        compensationNotes: offer.compensationNotes,
        startDate: offer.startDate,
        terms: offer.terms,
        respondedAt: offer.respondedAt,
      },
      firstName: application?.candidate.firstName ?? '',
      reference: application?.reference ?? '',
    })
  } catch (err) {
    console.error('[careers offer GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// POST — the candidate accepts or declines. Recorded once; the hiring team
// is notified after the response is committed. No pipeline stage changes
// here — staff act on the recorded response.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = rateLimit({ key: `offer-respond:${clientIp(req)}`, limit: 10, windowMs: 60 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  try {
    const body = await req.json().catch(() => ({}))
    const result = await respondToOffer(params.token, body.decision, body.note)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    // Post-commit team notification — best-effort.
    try {
      const offer = await findOfferByToken(params.token)
      const application = offer
        ? await prisma.jobApplication.findUnique({
            where:  { id: offer.applicationId },
            select: { reference: true, candidate: { select: { firstName: true, lastName: true } } },
          })
        : null
      if (offer && application) {
        await getResend().emails.send({
          from:    NOTIFY_FROM,
          to:      NOTIFY_TO,
          subject: `Offer ${result.status}: ${application.candidate.firstName} ${application.candidate.lastName} (${application.reference})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#0B1F3A;font-size:18px;margin:0 0 12px">Offer ${result.status}</h2>
            <p style="color:#555;font-size:14px"><strong>${application.candidate.firstName} ${application.candidate.lastName}</strong> has <strong>${result.status}</strong> the ${offer.jobTitle} offer (reference ${application.reference}).</p>
            <p style="color:#555;font-size:13px">Review the response and move the application in the pipeline from the admin.</p>
          </div>`,
        })
      }
    } catch (err) {
      console.error('[careers offer] team notify failed:', err instanceof Error ? err.message : err)
    }
    return NextResponse.json({ ok: true, status: result.status })
  } catch (err) {
    console.error('[careers offer POST]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
