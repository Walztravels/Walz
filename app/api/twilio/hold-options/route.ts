import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── Hold keypress handler ─────────────────────────────────────────────────────
//
// Called by Twilio when the caller presses a digit during the hold-music <Gather>.
//
//   1  → continue holding → redirect back into the Gather loop
//   2  → callback requested → save to CallbackQueue and hang up gracefully
//   *  → treat as "continue" (any unexpected digit)

const BASE_URL = 'https://www.walztravels.com'

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function POST(req: NextRequest) {
  const form    = await req.formData()
  const digit   = form.get('Digits')?.toString() ?? ''
  const callSid = req.nextUrl.searchParams.get('callSid') ?? form.get('CallSid')?.toString() ?? ''
  const room    = req.nextUrl.searchParams.get('room')    ?? ''
  const loops   = parseInt(req.nextUrl.searchParams.get('l') ?? '0', 10)

  console.log(`[hold-options] callSid=${callSid} digit="${digit}" loop=${loops}`)

  // ── Digit 2: callback requested ──────────────────────────────────────────────
  if (digit === '2') {
    let phoneNumber = ''
    let position    = 1

    if (callSid) {
      const supabase = getSupabaseAdmin()

      const { data: logRow } = await supabase
        .from('CallLog')
        .select('from')
        .eq('callSid', callSid)
        .maybeSingle()

      phoneNumber = (logRow as { from?: string } | null)?.from ?? ''

      const { count } = await supabase
        .from('CallbackQueue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting')

      position = (count ?? 0) + 1

      supabase
        .from('CallbackQueue')
        .insert({ callSid, phoneNumber, position, status: 'waiting' })
        .then(({ error }) => {
          if (error) console.error(`[hold-options] ${callSid} queue insert error:`, error)
          else console.log(`[hold-options] ${callSid} queued phone=${phoneNumber} position=${position}`)
        })
    }

    return twiml(
      `<Say voice="Polly.Amy-Neural">` +
      `Perfect. We have saved your number and you are number ${position} in our callback queue. ` +
      `A Walz Travels specialist will call you back as soon as possible. ` +
      `Thank you for calling Walz Travels and have a wonderful day.` +
      `</Say>` +
      `<Hangup/>`,
    )
  }

  // ── Digit 1 (or any other): continue holding ─────────────────────────────────
  const holdUrl = `${BASE_URL}/api/twilio/hold-music?callSid=${encodeURIComponent(callSid)}&amp;room=${encodeURIComponent(room)}&amp;l=${loops}`
  return twiml(`<Redirect method="GET">${holdUrl}</Redirect>`)
}
