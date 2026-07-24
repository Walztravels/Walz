import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Diagnostic statusCallback for outbound agent ring calls.
// Logs every state change (initiated → ringing → answered/failed/no-answer)
// so we can see exactly what Twilio does with the browser-ring and sip-ring calls.

export async function POST(req: NextRequest) {
  const form   = await req.formData()
  const sid    = form.get('CallSid')?.toString()    ?? ''
  const to     = form.get('To')?.toString()         ?? ''
  const status = form.get('CallStatus')?.toString() ?? ''
  const dir    = form.get('Direction')?.toString()  ?? ''

  console.log(`[agent-ring-status] sid=${sid} to="${to}" status="${status}" direction="${dir}"`)

  return NextResponse.json({ ok: true })
}
