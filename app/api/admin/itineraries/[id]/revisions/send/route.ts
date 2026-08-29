/**
 * POST /api/admin/itineraries/[id]/revisions/send
 *
 * Sends the revised proposal to the client.
 *   1. Validates itinerary is in revision_draft state
 *   2. Builds a fresh proposal hash from current content + options
 *   3. Generates a new approval token (30-day expiry)
 *   4. Sets status → revision_sent
 *   5. Sends a "revised proposal ready" email to the client
 *
 * The client accepts via POST /api/itinerary/[ref]/accept-revision.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/email-internal'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getCurrencySymbol } from '@/lib/currency'
import { BUSINESS } from '@/lib/config/business'
import { parseOptions, patchOptions } from '@/lib/itinerary-options'
import { buildProposalHashPayload, hashProposalState, buildPayloadSummary, type PackageOptionRow } from '@/lib/proposalHash'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (itin.status !== 'revision_draft') {
    return NextResponse.json(
      { error: `Can only send a revision in revision_draft state. Current: ${itin.status}` },
      { status: 409 },
    )
  }

  if (!itin.clientEmail || itin.clientEmail.includes('pending@walztravels')) {
    return NextResponse.json(
      { error: 'Client email is a placeholder — update it before sending.' },
      { status: 422 },
    )
  }

  const opts       = parseOptions(itin.options) as Record<string, unknown>
  const revNum     = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 1
  const BASE       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
  const sym        = getCurrencySymbol(itin.currency)

  // ── Build proposal hash from current state ────────────────────────────────
  const now = new Date()
  let sb: ReturnType<typeof getSupabaseAdmin>
  try { sb = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // ── Generate new approval token ───────────────────────────────────────────
  const token     = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + 30 * 86_400_000).toISOString()

  // ── Send email to client (non-fatal) ──────────────────────────────────────
  // NOTE: itin is fetched again after the emails below (itinForHash) to close
  // the race window between initial fetch and hash computation.
  let emailSent = false
  try {
    const resend  = getResend()
    const revLabel = `Revision ${revNum}`
    const proposalUrl = `${BASE}/itinerary/${itin.referenceNumber}`

    const { error } = await resend.emails.send({
      from:    'Walz Travels <contact@walztravels.com>',
      to:      itin.clientEmail,
      subject: `Updated Proposal — ${itin.destination} (${itin.referenceNumber})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#fff;">
          <div style="background:#0B1F3A;padding:28px 36px;text-align:center;">
            <img src="${BASE}/walz-logo.png" alt="Walz Travels" width="140" style="display:block;margin:0 auto 10px;"/>
          </div>
          <div style="padding:36px;">
            <h1 style="color:#0B1F3A;font-size:22px;margin:0 0 12px;">Your trip proposal has been updated</h1>
            <p style="color:#475569;font-size:14px;margin:0 0 8px;">Dear ${itin.clientName},</p>
            <p style="color:#475569;font-size:14px;margin:0 0 24px;">
              Your travel advisor has sent an updated proposal for your
              <strong>${itin.destination}</strong> trip (${itin.referenceNumber}).
              This is <strong>${revLabel}</strong> of your itinerary.
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Trip:</strong> ${itin.title}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Reference:</strong> ${itin.referenceNumber}</p>
              ${itin.totalPrice != null ? `<p style="margin:0;font-size:14px;color:#0B1F3A;font-weight:600;"><strong>Revised Total:</strong> ${sym}${Number(itin.totalPrice).toLocaleString()}</p>` : ''}
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="${proposalUrl}" style="background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;display:inline-block;">Review Updated Proposal →</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:24px;">
              Questions? <a href="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}" style="color:#C9A84C;">WhatsApp us</a> or email <a href="mailto:${BUSINESS.contacts.email}" style="color:#C9A84C;">${BUSINESS.contacts.email}</a>
            </p>
          </div>
        </div>`,
    })
    if (!error) emailSent = true
  } catch { /* non-fatal */ }

  // ── Internal staff alert (non-fatal) ─────────────────────────────────────
  try {
    const resend = getResend()
    await resend.emails.send({
      from:    'Walz Travels System <contact@walztravels.com>',
      to:      BUSINESS.contacts.email,
      subject: `📤 Revised proposal sent — ${itin.referenceNumber} (Revision ${revNum})`,
      html:    `<p>Revised proposal sent by <strong>${session.name || session.email}</strong> for <strong>${itin.referenceNumber}</strong> (${itin.destination}).</p>
               <p>Revision: ${revNum} · Total: ${itin.currency} ${itin.totalPrice != null ? Number(itin.totalPrice).toLocaleString() : 'TBD'}</p>
               <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'}/admin/itinerary-planner/${id}">Open in admin →</a></p>`,
    })
  } catch { /* non-fatal */ }

  // ── Re-fetch itin immediately before hashing ─────────────────────────────
  // Closes the race window between initial fetch (used for email HTML) and
  // hash computation. Any admin save during the email calls would otherwise
  // produce a hash that never matches the accept-time state.
  const [itinForHash, pkgRowsResult] = await Promise.all([
    prisma.itinerary.findUnique({ where: { id } }),
    sb
      .from('itinerary_package_options')
      .select('name, description, price, currency, features, sort_order')
      .eq('itinerary_id', id)
      .order('sort_order'),
  ])
  if (!itinForHash) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pkgRows = pkgRowsResult.data
  const payload = buildProposalHashPayload(itinForHash, (pkgRows ?? []) as PackageOptionRow[])
  const hash    = hashProposalState(payload)

  console.info('[revision-send/hash-diag]', {
    ref: itinForHash.referenceNumber,
    storedHashPrefix: hash.slice(0, 8),
    payloadSummary: buildPayloadSummary(payload),
    ts: now.toISOString(),
  })

  // ── Persist new token + hash + status ────────────────────────────────────
  await prisma.itinerary.update({
    where: { id },
    data: {
      status:    'revision_sent',
      sentAt:    now,
      updatedAt: now,
      options:   patchOptions(itinForHash.options, {
        approvalToken:           token,
        approvalTokenIssuedAt:   now.toISOString(),
        approvalTokenExpiresAt:  expiresAt,
        approvalTokenUsed:       false,
        sentOptionsHash:         hash,
        sentOptionsHashCreatedAt: now.toISOString(),
        revisionSentAt:          now.toISOString(),
      }),
    },
  })

  return NextResponse.json({
    sent:           true,
    emailSent,
    revisionNumber: revNum,
    approvalUrl:    `${BASE}/itinerary/${itin.referenceNumber}`,
    sentOptionsHash: hash,
  })
}
