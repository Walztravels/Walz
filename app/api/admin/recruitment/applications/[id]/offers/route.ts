import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { validateOfferInput, newOfferToken, OFFER_TOKEN_TTL_DAYS } from '@/lib/recruitment/offers'

export const dynamic = 'force-dynamic'

const SEND_FROM = 'Walz Travels <hello@walztravels.com>'
const BASE_URL  = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.walztravels.com'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// GET — offers for one application (tokens never leave the server).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const offers = await prisma.jobOffer.findMany({
      where:   { applicationId: params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, jobTitle: true, compensationType: true,
        compensationAmount: true, currency: true, compensationNotes: true,
        startDate: true, terms: true, tokenExpiresAt: true, createdBy: true,
        sentAt: true, respondedAt: true, candidateNote: true, createdAt: true,
      },
    })
    return NextResponse.json({ offers })
  } catch (err) {
    console.error('[recruitment offers GET]', err)
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 })
  }
}

// POST — create a draft offer. A management-role human decision, audited.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.offers.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const application = await prisma.jobApplication.findUnique({
      where:  { id: params.id },
      select: { id: true, reference: true, jobId: true, status: true },
    })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    if (application.status === 'withdrawn') {
      return NextResponse.json({ error: 'This application was withdrawn' }, { status: 400 })
    }
    const open = await prisma.jobOffer.findFirst({
      where: { applicationId: params.id, status: { in: ['draft', 'sent'] } }, select: { id: true },
    })
    if (open) return NextResponse.json({ error: 'An offer is already open for this application — withdraw it first' }, { status: 409 })

    const body = await req.json().catch(() => ({}))
    const parsed = validateOfferInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const job = await prisma.jobOpening.findUnique({
      where: { id: application.jobId }, select: { title: true },
    })
    const offer = await prisma.jobOffer.create({
      data: {
        applicationId: application.id,
        jobTitle: job?.title ?? 'Role at Walz Travels',
        ...parsed.value,
        createdBy: session.email,
      },
      select: { id: true },
    })
    await recruitmentAudit(session, 'Offer Drafted', `${application.reference}: offer ${offer.id}`)
    return NextResponse.json({ ok: true, offerId: offer.id })
  } catch (err) {
    console.error('[recruitment offers POST]', err)
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 })
  }
}

// PATCH — send or withdraw an offer (management, audited). Sending emails
// the candidate their personal offer link only after the offer is updated.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.offers.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const offerId = typeof body.offerId === 'string' ? body.offerId : ''
    const action  = typeof body.action === 'string' ? body.action : ''
    const offer = await prisma.jobOffer.findFirst({
      where:  { id: offerId, applicationId: params.id },
      select: { id: true, status: true, jobTitle: true },
    })
    if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

    if (action === 'withdraw') {
      if (offer.status === 'accepted' || offer.status === 'declined') {
        return NextResponse.json({ error: 'Answered offers cannot be withdrawn' }, { status: 400 })
      }
      await prisma.jobOffer.update({ where: { id: offer.id }, data: { status: 'withdrawn' } })
      await recruitmentAudit(session, 'Offer Withdrawn', `offer ${offer.id}`)
      return NextResponse.json({ ok: true })
    }

    if (action === 'send') {
      if (offer.status !== 'draft') {
        return NextResponse.json({ error: 'Only draft offers can be sent' }, { status: 400 })
      }
      const application = await prisma.jobApplication.findUnique({
        where:  { id: params.id },
        select: { reference: true, candidate: { select: { email: true, firstName: true } } },
      })
      if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

      const { token, hash, expiresAt } = newOfferToken()
      await prisma.jobOffer.update({
        where: { id: offer.id },
        data:  { status: 'sent', tokenHash: hash, tokenExpiresAt: expiresAt, sentAt: new Date() },
      })
      await recruitmentAudit(session, 'Offer Sent', `${application.reference}: offer ${offer.id}`)

      let emailed = false
      try {
        const link = `${BASE_URL}/careers/offer/${token}`
        await getResend().emails.send({
          from:    SEND_FROM,
          to:      application.candidate.email,
          subject: `Your offer from Walz Travels — ${offer.jobTitle} (${application.reference})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#0B1F3A;font-size:18px;margin:0 0 12px">You have an offer 🎉</h2>
            <p style="color:#555;font-size:14px">Dear ${escapeHtml(application.candidate.firstName)},</p>
            <p style="color:#555;font-size:14px">We are delighted to offer you the <strong>${escapeHtml(offer.jobTitle)}</strong> position at Walz Travels. Please review the full offer and respond using your personal link below.</p>
            <a href="${link}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">View & respond to your offer →</a>
            <p style="color:#999;font-size:12px;margin-top:16px">This personal link expires in ${OFFER_TOKEN_TTL_DAYS} days. Reference: <span style="font-family:monospace">${escapeHtml(application.reference)}</span>. Questions? Just reply to this email.</p>
          </div>`,
        })
        emailed = true
      } catch (err) {
        console.error('[recruitment offers] offer email failed for', offer.id,
          err instanceof Error ? err.message : 'send error')
      }
      return NextResponse.json({ ok: true, emailed })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[recruitment offers PATCH]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
