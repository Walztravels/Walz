import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Configure in Twilio Console: TwiML App Status Callback URL
// → POST https://walztravels.com/api/twilio/voice/status

const STATUS: Record<string, string> = {
  'initiated':   'initiated',
  'ringing':     'ringing',
  'in-progress': 'active',
  'completed':   'completed',
  'busy':        'missed',
  'no-answer':   'missed',
  'canceled':    'missed',
  'failed':      'failed',
}

export async function POST(req: NextRequest) {
  const form        = await req.formData()
  const callSid     = form.get('CallSid')?.toString()      ?? ''
  const rawStatus   = form.get('CallStatus')?.toString()   ?? ''
  const duration    = parseInt(form.get('CallDuration')?.toString() ?? '0', 10) || null
  const recordingUrl = form.get('RecordingUrl')?.toString() ?? null

  const status   = STATUS[rawStatus] ?? rawStatus
  const supabase = getSupabaseAdmin()

  await supabase.from('CallLog').update({
    status,
    ...(duration     ? { duration }     : {}),
    ...(recordingUrl ? { recordingUrl } : {}),
    updatedAt: new Date().toISOString(),
  }).eq('callSid', callSid)

  if (['completed', 'missed', 'failed'].includes(status)) {
    await supabase.from('ConversationRoute')
      .update({ status })
      .eq('chatwootConversationId', `twilio_${callSid}`)
  }

  return NextResponse.json({ ok: true })
}
