import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/admin/messages/send
// Body: { lead_id, body, channel? }
export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { lead_id?: string; body?: string; channel?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { lead_id, body: messageBody, channel = 'whatsapp' } = body

  if (!lead_id || !messageBody?.trim()) {
    return NextResponse.json({ error: 'lead_id and body are required' }, { status: 400 })
  }

  const supabase  = getSupabaseAdmin()

  // Get lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, whatsapp_number, whatsapp, instagram_handle, chatwoot_conversation_id')
    .eq('id', lead_id)
    .maybeSingle()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Resolve staff ID from session email
  let staffId: string | null = null
  try {
    const staff = await prisma.staff.findUnique({ where: { email: session.email }, select: { id: true } })
    staffId = staff?.id ?? null
  } catch { /* non-fatal */ }

  let externalId: string | null = null

  if (channel === 'whatsapp' || channel === 'chatwoot') {
    const cwConvId   = (lead as { chatwoot_conversation_id?: number | null }).chatwoot_conversation_id
    const cwBase     = process.env.CHATWOOT_BASE_URL
    const cwAccount  = process.env.CHATWOOT_ACCOUNT_ID
    const cwToken    = process.env.CHATWOOT_API_TOKEN

    // Prefer Chatwoot API if the lead has a conversation linked
    if (cwConvId && cwBase && cwAccount && cwToken) {
      const cwRes = await fetch(
        `${cwBase}/api/v1/accounts/${cwAccount}/conversations/${cwConvId}/messages`,
        {
          method:  'POST',
          headers: { api_access_token: cwToken, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content: messageBody.trim(), message_type: 'outgoing', private: false }),
        },
      )
      const cwData = await cwRes.json() as { id?: number; error?: string }
      if (!cwRes.ok) {
        console.error('[messages/send] Chatwoot API error:', cwData.error)
        return NextResponse.json({ error: cwData.error ?? 'Chatwoot send failed' }, { status: 502 })
      }
      externalId = cwData.id ? `cw_msg_${cwData.id}` : null
    } else {
      // Fallback: send directly via WhatsApp Cloud API
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
      const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN
      const toNumber = (lead.whatsapp_number ?? lead.whatsapp ?? '').replace(/\D/g, '')

      if (!toNumber) {
        return NextResponse.json({ error: 'Lead has no WhatsApp number' }, { status: 422 })
      }

      if (phoneNumberId && accessToken) {
        const waRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            messaging_product: 'whatsapp',
            to:   toNumber,
            type: 'text',
            text: { body: messageBody.trim() },
          }),
        })
        const waData = await waRes.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
        if (!waRes.ok) {
          console.error('[messages/send] WhatsApp API error:', waData.error)
          return NextResponse.json({ error: waData.error?.message ?? 'WhatsApp send failed' }, { status: 502 })
        }
        externalId = waData.messages?.[0]?.id ?? null
      } else {
        console.warn('[messages/send] No send credentials configured — message saved to DB only')
      }
    }
  }

  // Save outbound message
  const { data: savedMsg, error: insertErr } = await supabase
    .from('messages')
    .insert({
      lead_id:     lead_id,
      staff_id:    staffId,
      channel,
      direction:   'outbound',
      body:        messageBody.trim(),
      external_id: externalId,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[messages/send] Insert error:', insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Update lead's last message preview + last_staff_reply_at
  await supabase.from('leads').update({
    last_message_at:      new Date().toISOString(),
    last_message_preview: `You: ${messageBody.trim().substring(0, 80)}`,
    last_staff_reply_at:  new Date().toISOString(),
  }).eq('id', lead_id)

  return NextResponse.json({ success: true, message: savedMsg })
}
