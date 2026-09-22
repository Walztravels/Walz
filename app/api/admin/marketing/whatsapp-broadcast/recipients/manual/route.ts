/**
 * WhatsApp Broadcast V1.1 — manual WhatsApp number validation.
 *
 * Normalizes and validates a typed or pasted batch SERVER-SIDE and reports
 * valid / invalid / duplicate with a reason per rejection. It is a
 * CONVENIENCE for the UI, not a gate: the resolver re-parses the same raw
 * strings from the stored selection at preview and at snapshot time, so
 * nothing downstream depends on this endpoint having been called, and a
 * client that skipped it or lied about its result changes nothing.
 *
 * ── WHAT THIS ROUTE DOES NOT DO ─────────────────────────────────────────
 * It writes NOTHING. No Lead is created, no WhatsAppConsent row is
 * created, no record of any kind is minted to make a manual number "fit"
 * the pipeline. It does not touch the database at all except to READ the
 * real consent table so staff can see, before they commit, that a typed
 * number has no consent — the same verdict the resolver will reach.
 *
 * A manual number is eligible if and only if the real whatsapp_consents
 * table says SUBSCRIBED for it. There is no manual-entry exception.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { parseManualEntriesPayload, parseManualNumbers } from '@/lib/whatsapp/broadcast/manual-numbers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  let body: { entries?: unknown; blob?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Either a structured list or one pasted blob — both go through the same
  // server-side parser. A client-side "this number is valid" claim has no
  // representation in either shape, deliberately.
  const entries = parseManualEntriesPayload(body.entries ?? body.blob ?? [])
  const result = parseManualNumbers(entries)

  const numbers = result.valid.map(v => v.normalizedNumber)
  const consents = numbers.length
    ? await prisma.whatsAppConsent.findMany({
        where: { normalizedNumber: { in: numbers } },
        select: { normalizedNumber: true, status: true },
      })
    : []
  const consentByNumber = new Map(consents.map(c => [c.normalizedNumber, c.status]))

  return NextResponse.json({
    valid: result.valid.map(v => ({
      raw: v.raw,
      normalizedNumber: v.normalizedNumber,
      displayName: v.displayName,
      // Advisory, exactly as in the two record pickers. A number with no
      // row is UNKNOWN, and UNKNOWN is not consent.
      consentStatus: consentByNumber.get(v.normalizedNumber) ?? 'UNKNOWN',
    })),
    invalid: result.invalid,
    duplicates: result.duplicates,
    totalEntries: result.totalEntries,
    notice:
      'Numbers are normalized and checked on the server. A manually entered number is only sendable if the WhatsApp consent table already records affirmative consent for it — adding it here creates no consent and no client record.',
  })
}
