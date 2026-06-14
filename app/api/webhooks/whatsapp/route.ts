/**
 * app/api/webhooks/whatsapp/route.ts
 *
 * WhatsApp Cloud API webhook.
 * Register in Meta Developer Console:
 *   App → WhatsApp → Configuration
 *   Callback URL: https://www.walztravels.com/api/webhooks/whatsapp
 *   Verify Token: process.env.WHATSAPP_WEBHOOK_SECRET
 *
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID   — found in Meta WhatsApp dashboard
 *   WHATSAPP_ACCESS_TOKEN      — permanent token from Meta System User
 *   WHATSAPP_WEBHOOK_SECRET    — any string you set as the verify token
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── GET — webhook verification ────────────────────────────────────────────────
export async function GET(req: Request) {
  const url       = new URL(req.url)
  const mode      = url.searchParams.get('hub.mode')
  const token     = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_SECRET) {
    return new Response(challenge!, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('Forbidden', { status: 403 })
}

// ── POST — incoming messages ──────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body  = await req.json()
    const entry = body.entry?.[0]
    const value = entry?.changes?.[0]?.value

    if (!value) return NextResponse.json({ ok: true })

    const supabase = getSupabaseAdmin()

    // ── Status updates (delivered / read) ───────────────────────────────────
    if (value.statuses?.length) {
      const s = value.statuses[0]
      if (s.status === 'read') {
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('external_id', s.id)
      }
      return NextResponse.json({ ok: true })
    }

    if (!value.messages?.length) return NextResponse.json({ ok: true })

    for (const message of value.messages as WAMessage[]) {
      // Deduplicate — Meta can send the same event twice
      const { data: dup } = await supabase.from('messages').select('id').eq('external_id', message.id).maybeSingle()
      if (dup) continue

      const fromNumber  = message.from
      const profileName = (value.contacts as WAContact[] | undefined)?.[0]?.profile?.name ?? 'Unknown'

      // Find or create lead ──────────────────────────────────────────────────
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, unread_count')
        .eq('whatsapp_number', fromNumber)
        .maybeSingle()

      let leadId: string

      if (existingLead) {
        leadId = existingLead.id
        await supabase.from('leads').update({
          last_message_at:      new Date().toISOString(),
          last_message_preview: getPreview(message),
          unread_count:         (existingLead.unread_count ?? 0) + 1,
        }).eq('id', leadId)
      } else {
        const { data: newLead, error: insertErr } = await supabase
          .from('leads')
          .insert({
            name:                 profileName,
            whatsapp_number:      fromNumber,
            whatsapp:             '+' + fromNumber,
            phone:                fromNumber,
            channel:              'whatsapp',
            source:               'whatsapp_inbound',
            service:              'Other',
            status:               'New',
            last_message_at:      new Date().toISOString(),
            last_message_preview: getPreview(message),
            unread_count:         1,
            jadeActive:           true,
            isRead:               false,
          })
          .select('id')
          .single()

        if (insertErr || !newLead) {
          console.error('[wa-webhook] Lead insert error:', insertErr)
          continue
        }
        leadId = newLead.id
      }

      // Parse message body ───────────────────────────────────────────────────
      let msgBody = ''
      const attachments: WAAttachment[] = []

      if (message.type === 'text') {
        msgBody = message.text?.body ?? ''
      } else if (message.type === 'image') {
        msgBody = message.image?.caption ?? '[Image]'
        attachments.push({ type: 'image', media_id: message.image?.id, mime_type: message.image?.mime_type })
      } else if (message.type === 'audio') {
        msgBody = '[Voice message]'
        attachments.push({ type: 'audio', media_id: message.audio?.id })
      } else if (message.type === 'document') {
        msgBody = message.document?.filename ?? '[Document]'
        attachments.push({ type: 'document', media_id: message.document?.id, filename: message.document?.filename })
      } else if (message.type === 'video') {
        msgBody = message.video?.caption ?? '[Video]'
        attachments.push({ type: 'video', media_id: message.video?.id })
      } else {
        msgBody = `[${message.type}]`
      }

      // Save message ─────────────────────────────────────────────────────────
      await supabase.from('messages').insert({
        lead_id:     leadId,
        channel:     'whatsapp',
        direction:   'inbound',
        body:        msgBody,
        attachments: attachments,
        external_id: message.id,
      })

      // Jade auto-reply ──────────────────────────────────────────────────────
      if (message.type === 'text' && msgBody) {
        await maybeJadeReply({ leadId, fromNumber, msgBody, supabase })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[wa-webhook] Error:', err)
    // Always 200 — Meta retries on non-200 and will flood the endpoint
    return NextResponse.json({ ok: true })
  }
}

// ── Jade auto-reply ───────────────────────────────────────────────────────────
async function maybeJadeReply({
  leadId, fromNumber, msgBody, supabase,
}: { leadId: string; fromNumber: string; msgBody: string; supabase: ReturnType<typeof getSupabaseAdmin> }) {
  try {
    const { data: lead } = await supabase
      .from('leads')
      .select('jadeActive, last_staff_reply_at')
      .eq('id', leadId)
      .maybeSingle()

    if (!lead) return

    const jadeActive    = lead.jadeActive !== false
    const lastStaff     = lead.last_staff_reply_at ? new Date(lead.last_staff_reply_at) : null
    const fiveMinsAgo   = new Date(Date.now() - 5 * 60 * 1000)
    const staffSilent   = !lastStaff || lastStaff < fiveMinsAgo

    if (!jadeActive || !staffSilent) return

    // Fetch recent conversation for context
    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('direction, body')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversation = (recentMsgs ?? [])
      .reverse()
      .map((m: { direction: string; body: string }) => ({
        role:      (m.direction === 'inbound' ? 'client' : 'jade') as 'client' | 'jade',
        message:   m.body,
        timestamp: new Date().toISOString(),
      }))

    const { getJadeResponse } = await import('@/lib/jade-messaging')
    const { response } = await getJadeResponse(msgBody, conversation, 'WhatsApp', '')

    if (!response) return

    await new Promise(r => setTimeout(r, 2000))

    const phoneNumberId  = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken    = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) return

    const waRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messaging_product: 'whatsapp',
        to:   fromNumber,
        type: 'text',
        text: { body: response },
      }),
    })

    const waData = await waRes.json() as { messages?: Array<{ id: string }> }

    await supabase.from('messages').insert({
      lead_id:     leadId,
      channel:     'whatsapp',
      direction:   'outbound',
      body:        response,
      external_id: waData.messages?.[0]?.id ?? null,
    })

    await supabase.from('leads').update({
      jade_last_reply_at:   new Date().toISOString(),
      last_message_at:      new Date().toISOString(),
      last_message_preview: `Jade: ${response.substring(0, 80)}`,
    }).eq('id', leadId)

  } catch (err) {
    console.error('[wa-webhook] Jade reply error:', err)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPreview(message: WAMessage): string {
  switch (message.type) {
    case 'text':     return message.text?.body?.substring(0, 80) ?? ''
    case 'image':    return '📷 Image'
    case 'audio':    return '🎵 Voice message'
    case 'document': return `📄 ${message.document?.filename ?? 'Document'}`
    case 'video':    return '🎥 Video'
    default:         return `[${message.type}]`
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface WAMessage {
  id:        string
  from:      string
  type:      string
  text?:     { body?: string }
  image?:    { id?: string; caption?: string; mime_type?: string }
  audio?:    { id?: string }
  document?: { id?: string; filename?: string }
  video?:    { id?: string; caption?: string }
}

interface WAContact {
  wa_id:   string
  profile: { name?: string }
}

interface WAAttachment {
  type:      string
  media_id?: string
  mime_type?: string
  filename?: string
}
