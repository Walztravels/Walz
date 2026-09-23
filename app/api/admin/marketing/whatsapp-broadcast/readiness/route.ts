/**
 * WhatsApp Broadcast V1 — server-side readiness probe.
 *
 * Replaces the fake client-side banner. The old page checked
 * `process.env.NEXT_PUBLIC_WA_TOKEN` from a 'use client' component and the
 * banner text referenced `WHATSAPP_TOKEN`, a variable that exists nowhere
 * in the codebase — so the banner was wrong twice over AND invited putting
 * an access token behind a NEXT_PUBLIC_* name, which would ship it to
 * every browser. NEXT_PUBLIC_WA_TOKEN is now gone from the codebase.
 *
 * This endpoint reports PRESENT/MISSING booleans computed on the server.
 * It never returns, logs or hints at a secret's VALUE, and it is gated on
 * the same `marketing_whatsapp_broadcast` permission as every other route
 * in this feature — knowing which of an organisation's integration
 * secrets are unset is itself operational information.
 */

import { NextResponse } from 'next/server'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { getWhatsAppReadiness } from '@/lib/whatsapp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const readiness = getWhatsAppReadiness()

  return NextResponse.json({
    canSend: readiness.canSend,
    canReceiveStatusCallbacks: readiness.canReceiveStatusCallbacks,
    canSendOtp: readiness.canSendOtp,
    checks: readiness.checks,
    missing: readiness.missing,
    // Structurally checkable configuration only. Whether a given template
    // is APPROVED on the WhatsApp Business Account can ONLY be confirmed
    // by calling Twilio's Content API with live credentials (see
    // listApprovedWhatsAppContentTemplates() in lib/twilio-whatsapp.ts,
    // used by the /templates route below) — never asserted here.
    templateApprovalVerified: false,
  })
}
