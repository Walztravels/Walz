/**
 * POST /api/admin/itineraries/[id]/revisions/send
 *
 * Sends the revised proposal to the client.
 *   1. Validates itinerary is in revision_draft state
 *   2. Fetches Supabase package options (pre-transaction)
 *   3. Atomically: locks row → reads latest committed state → builds hash →
 *      generates fresh token → writes revision_sent status in one transaction
 *   4. AFTER commit: sends client notification email and internal staff alert
 *
 * Email failure is non-fatal — hash/token state is already persisted.
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

  // Initial fetch — used for email content and validation only.
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

  const opts   = parseOptions(itin.options) as Record<string, unknown>
  const revNum = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 1
  const BASE   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
  const sym    = getCurrencySymbol(itin.currency)

  // Fetch package options before the transaction — acceptable minor race on pkg option
  // changes; the itinerary row lock (below) prevents concurrent saves on the row itself.
  let sb: ReturnType<typeof getSupabaseAdmin>
  try { sb = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { data: pkgRowsData } = await sb
    .from('itinerary_package_options')
    .select('name, description, price, currency, features, sort_order')
    .eq('itinerary_id', id)
    .order('sort_order')
  const pkgRows = (pkgRowsData ?? []) as PackageOptionRow[]

  // Atomic: lock row → read latest committed state → compute hash → write — all in one tx.
  // Any concurrent admin save blocks on the lock and commits before our hash is computed,
  // so the stored hash always matches the DB state that the client will see at accept-time.
  let sentHash = ''
  try {
    const { hash } = await prisma.$transaction(async (tx) => {
      // Acquire exclusive row lock. Concurrent admin saves will wait until this tx commits.
      await tx.$executeRaw`SELECT 1 FROM "Itinerary" WHERE id = ${id} FOR UPDATE`

      const locked = await tx.itinerary.findUnique({ where: { id } })
      if (!locked) throw Object.assign(new Error('NOT_FOUND'), { _txCode: 'NOT_FOUND' })

      const now       = new Date()
      const payload   = buildProposalHashPayload(locked, pkgRows)
      const hash      = hashProposalState(payload)
      const token     = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(now.getTime() + 30 * 86_400_000).toISOString()

      console.info('[revision-send/hash-diag]', {
        ref: locked.referenceNumber,
        storedHashPrefix: hash.slice(0, 8),
        payloadSummary: buildPayloadSummary(payload),
        ts: now.toISOString(),
      })

      await tx.itinerary.update({
        where: { id },
        data: {
          status:    'revision_sent',
          sentAt:    now,
          updatedAt: now,
          options:   patchOptions(locked.options, {
            approvalToken:            token,
            approvalTokenIssuedAt:    now.toISOString(),
            approvalTokenExpiresAt:   expiresAt,
            approvalTokenUsed:        false,
            sentOptionsHash:          hash,
            sentOptionsHashCreatedAt: now.toISOString(),
            revisionSentAt:           now.toISOString(),
          }),
        },
      })

      return { hash }
    })

    sentHash = hash
  } catch (err: unknown) {
    const e = err as { _txCode?: string }
    if (e._txCode === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    console.error('[revision-send] Transaction failed', err)
    return NextResponse.json({ error: 'Failed to record send state. Please try again.' }, { status: 500 })
  }

  // Client email — AFTER commit. Non-fatal; hash/token state is already persisted.
  const proposalUrl = `${BASE}/itinerary/${itin.referenceNumber}`
  let emailSent = false
  try {
    const resend   = getResend()
    const revLabel = `Revision ${revNum}`

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

  if (!emailSent) {
    console.warn('[revision-send] Client email delivery failed after commit — hash/token preserved', {
      ref: itin.referenceNumber,
      to:  itin.clientEmail,
    })
  }

  // Internal staff alert — non-fatal
  try {
    const resend = getResend()
    await resend.emails.send({
      from:    'Walz Travels System <contact@walztravels.com>',
      to:      BUSINESS.contacts.email,
      subject: `📤 Revised proposal sent — ${itin.referenceNumber} (Revision ${revNum})`,
      html:    `<p>Revised proposal sent by <strong>${session.name || session.email}</strong> for <strong>${itin.referenceNumber}</strong> (${itin.destination}).</p>
               <p>Revision: ${revNum} · Total: ${itin.currency} ${itin.totalPrice != null ? Number(itin.totalPrice).toLocaleString() : 'TBD'}</p>
               <p><a href="${BASE}/admin/itinerary-planner/${id}">Open in admin →</a></p>`,
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({
    sent:            true,
    emailSent,
    revisionNumber:  revNum,
    approvalUrl:     proposalUrl,
    sentOptionsHash: sentHash,
  })
}
