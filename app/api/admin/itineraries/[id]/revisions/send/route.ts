/**
 * POST /api/admin/itineraries/[id]/revisions/send
 *
 * Sends the revised proposal to the client.
 *   1. Validates itinerary is in revision_draft state
 *   2. Atomically: locks row → fetches fresh pkg options (inside callback, after lock) →
 *      builds hash → stores frozen option snapshot → writes revision_sent status
 *   3. AFTER commit: sends client notification email and internal staff alert,
 *      both built from the locked state that produced sentOptionsHash
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

  // Initial fetch — for status/email validation only. Email and hash are built from the locked state below.
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

  // revNum comes from the initial options — the send operation does not change revisionNumber,
  // so this is the same value the locked state will have.
  const opts   = parseOptions(itin.options) as Record<string, unknown>
  const revNum = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 1
  const BASE   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

  let sb: ReturnType<typeof getSupabaseAdmin>
  try { sb = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Atomic: lock row → fetch fresh pkg options (inside callback, after lock) → compute hash →
  // store frozen option snapshot + hash + token — all committed in one transaction.
  //
  // Moving the Supabase fetch INSIDE the callback (after FOR UPDATE) reduces the race window
  // for option changes from seconds (email-send duration) to ~1ms (UPDATE latency). The frozen
  // snapshot stored in options.frozenPackageOptions is then used by accept routes instead of a
  // live Supabase read, eliminating the accept-time race entirely.
  let sentHash   = ''
  let lockedItin = itin  // catch always returns; this default is never used

  try {
    const { hash, locked } = await prisma.$transaction(async (tx) => {
      // Acquire exclusive row lock. Concurrent admin saves block here until commit.
      await tx.$executeRaw`SELECT 1 FROM "Itinerary" WHERE id = ${id} FOR UPDATE`

      const locked = await tx.itinerary.findUnique({ where: { id } })
      if (!locked) throw Object.assign(new Error('NOT_FOUND'), { _txCode: 'NOT_FOUND' })

      // Fetch package options INSIDE the callback — race window is now lock → UPDATE (~1ms).
      const { data: pkgData } = await sb
        .from('itinerary_package_options')
        .select('id, name, description, price, currency, features, sort_order')
        .eq('itinerary_id', id)
        .order('sort_order')
      const freshPkgRows = (pkgData ?? []) as (PackageOptionRow & { id: string })[]

      const now       = new Date()
      const payload   = buildProposalHashPayload(locked, freshPkgRows)
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
            frozenPackageOptions:     freshPkgRows,  // accept routes read this — no Supabase race
          }),
        },
      })

      return { hash, locked }
    })

    sentHash   = hash
    lockedItin = locked
  } catch (err: unknown) {
    const e = err as { _txCode?: string }
    if (e._txCode === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    console.error('[revision-send] Transaction failed', err)
    return NextResponse.json({ error: 'Failed to record send state. Please try again.' }, { status: 500 })
  }

  // Build email content from the LOCKED state that produced sentOptionsHash.
  const sym         = getCurrencySymbol(lockedItin.currency)
  const proposalUrl = `${BASE}/itinerary/${lockedItin.referenceNumber}`
  const revLabel    = `Revision ${revNum}`

  // Client email — AFTER commit. Non-fatal; hash/token state is already persisted.
  let emailSent = false
  try {
    const resend = getResend()

    const { error } = await resend.emails.send({
      from:    'Walz Travels <contact@walztravels.com>',
      to:      lockedItin.clientEmail,
      subject: `Updated Proposal — ${lockedItin.destination} (${lockedItin.referenceNumber})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#fff;">
          <div style="background:#0B1F3A;padding:28px 36px;text-align:center;">
            <img src="${BASE}/walz-logo.png" alt="Walz Travels" width="140" style="display:block;margin:0 auto 10px;"/>
          </div>
          <div style="padding:36px;">
            <h1 style="color:#0B1F3A;font-size:22px;margin:0 0 12px;">Your trip proposal has been updated</h1>
            <p style="color:#475569;font-size:14px;margin:0 0 8px;">Dear ${lockedItin.clientName},</p>
            <p style="color:#475569;font-size:14px;margin:0 0 24px;">
              Your travel advisor has sent an updated proposal for your
              <strong>${lockedItin.destination}</strong> trip (${lockedItin.referenceNumber}).
              This is <strong>${revLabel}</strong> of your itinerary.
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Trip:</strong> ${lockedItin.title}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Reference:</strong> ${lockedItin.referenceNumber}</p>
              ${lockedItin.totalPrice != null ? `<p style="margin:0;font-size:14px;color:#0B1F3A;font-weight:600;"><strong>Revised Total:</strong> ${sym}${Number(lockedItin.totalPrice).toLocaleString()}</p>` : ''}
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
      ref: lockedItin.referenceNumber,
      to:  lockedItin.clientEmail,
    })
  }

  // Internal staff alert — non-fatal
  try {
    const resend = getResend()
    await resend.emails.send({
      from:    'Walz Travels System <contact@walztravels.com>',
      to:      BUSINESS.contacts.email,
      subject: `📤 Revised proposal sent — ${lockedItin.referenceNumber} (Revision ${revNum})`,
      html:    `<p>Revised proposal sent by <strong>${session.name || session.email}</strong> for <strong>${lockedItin.referenceNumber}</strong> (${lockedItin.destination}).</p>
               <p>Revision: ${revNum} · Total: ${lockedItin.currency} ${lockedItin.totalPrice != null ? Number(lockedItin.totalPrice).toLocaleString() : 'TBD'}</p>
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
