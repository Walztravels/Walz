/**
 * WhatsApp Broadcast V1.2.1 — approved WhatsApp template catalogue.
 *
 * GET-only, admin-RBAC-gated (same marketing_whatsapp_broadcast permission
 * as every other route in this feature). Returns the server-resolved list
 * of Twilio Content Templates actually approved for the WhatsApp channel —
 * staff pick FROM this list; the UI must never let a hand-typed name/SID
 * be treated as approved, because nothing client-side can verify that.
 *
 * Twilio credentials never leave the server: this route calls
 * lib/twilio-whatsapp.ts's listApprovedWhatsAppContentTemplates() and
 * returns only sid/name/category/variable-key metadata.
 */

import { NextResponse } from 'next/server'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { listApprovedWhatsAppContentTemplates } from '@/lib/twilio-whatsapp'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const result = await listApprovedWhatsAppContentTemplates()
  if (!result.ok) {
    return NextResponse.json({ error: result.error, templates: [] }, { status: 503 })
  }
  return NextResponse.json({ templates: result.templates })
}
