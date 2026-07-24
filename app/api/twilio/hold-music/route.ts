import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── Walz Travels hold experience (Gather loop) ────────────────────────────────
//
// Pattern per loop:  5 s music → check-in → advert → 5 s music → "press 1 or 2"
// The <Gather> captures keypresses throughout all content inside it.
//
// Press 1 → hold-options → continue to next loop
// Press 2 → hold-options → saved to CallbackQueue, caller hangs up
// No press → <Redirect> after <Gather> → next loop automatically
//
// When an agent answers their outbound call, agent-join calls
// twilio.calls.update(callerSid, { url: callerJoinUrl }) which pulls the caller
// out of this Gather loop and into the conference bridge. Seamless.
//
// SHORT MUSIC CLIP:
//   Set SHORT_CLIP_URL to a publicly hosted 5–10 s audio file for background
//   music between announcements (e.g. https://walztravels.com/hold-loop.mp3).
//   Without it, callers hear a 5-second silence between messages — acceptable
//   for now but replace as soon as you have a clip ready.

const BASE_URL      = 'https://www.walztravels.com'
const SHORT_CLIP_URL = 'https://www.walztravels.com/jingle.mp3'

const CHECKINS = [
  'Thank you for holding. You\'re through to Walz Travels, London — your expert travel partner for flights, visas, hotels, and tailor-made holidays. A specialist is on their way to you now.',
  'Your call is very important to us. A Walz Travels specialist will be with you any moment now. Thank you for your patience.',
  'We really do appreciate you holding on. Someone is on their way to take your call right now.',
  'Thank you so much for your patience. A Walz Travels travel specialist will be with you very shortly.',
  'We haven\'t forgotten about you — your call is in our queue and a specialist is picking up now.',
]

const ADVERTS = [
  'Did you know Walz Travels handles everything end to end — flights, visas, hotels, transfers, and tailor-made holiday packages? Ask your specialist when they join.',
  'Planning a trip abroad? Walz Travels can sort your Schengen visa, US ESTA, Canada eTA, or any other travel documentation. We handle the paperwork so you don\'t have to.',
  'Looking for a stress-free getaway? Walz Travels offers fully packaged holidays — flights, accommodation, and transfers all in one. Speak to your specialist today.',
]

// Walz Travels jingle — plays on every other loop so it doesn't feel repetitive.
// Spoken rhythmically by Polly.Amy-Neural which gives a warm, upbeat tone.
const JINGLE =
  `<Say voice="Polly.Amy-Neural" rate="fast">` +
  `Walz Travels — ` +
  `</Say>` +
  `<Say voice="Polly.Amy-Neural">` +
  `Where every journey begins with care. ` +
  `Flights booked, visas sorted, hotels arranged — ` +
  `we take the stress out of travel, so you can simply enjoy the adventure. ` +
  `Walz Travels. Your world, made easy.` +
  `</Say>`

const MAX_LOOPS = 10  // ~10 × ~40 s = ~7 min max hold; then auto-callback

function xml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

function music() {
  // 5-second music clip between messages. Replace SHORT_CLIP_URL with a real
  // hosted audio file for background music. Until then, a 5-second pause.
  return SHORT_CLIP_URL
    ? `<Play>${SHORT_CLIP_URL}</Play>`
    : `<Pause length="5"/>`
}

export async function GET(req: NextRequest) {
  const loops   = parseInt(req.nextUrl.searchParams.get('l')       ?? '0', 10)
  const callSid = req.nextUrl.searchParams.get('callSid') ?? ''
  const room    = req.nextUrl.searchParams.get('room')    ?? ''

  // ── Auto-callback after max hold time ────────────────────────────────────────
  if (loops >= MAX_LOOPS) {
    if (callSid) {
      const supabase  = getSupabaseAdmin()
      const { data: logRow } = await supabase
        .from('CallLog')
        .select('from')
        .eq('callSid', callSid)
        .maybeSingle()

      const phoneNumber = (logRow as { from?: string } | null)?.from ?? ''
      const { count }   = await supabase
        .from('CallbackQueue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting')
      const position = (count ?? 0) + 1

      supabase
        .from('CallbackQueue')
        .insert({ callSid, phoneNumber, position, status: 'waiting' })
        .then(({ error }) => {
          if (error) console.error(`[hold-music] auto-callback queue error:`, error)
        })

      console.log(`[hold-music] ${callSid} max hold reached — auto-queued for callback position=${position}`)
    }

    return xml(
      `<Say voice="Polly.Amy-Neural">` +
      `We're so sorry for the extended wait. We've automatically added you to our callback queue and a Walz Travels specialist will call you back as soon as possible. ` +
      `Thank you for your patience and have a wonderful day.` +
      `</Say>` +
      `<Hangup/>`,
    )
  }

  const checkin    = CHECKINS[loops % CHECKINS.length]
  const advert     = ADVERTS[loops % ADVERTS.length]
  // & in XML attributes/content must be &amp; — Twilio's XML parser rejects raw &
  const optionsUrl = `${BASE_URL}/api/twilio/hold-options?callSid=${encodeURIComponent(callSid)}&amp;room=${encodeURIComponent(room)}&amp;l=${loops + 1}`
  const nextLoop   = `${BASE_URL}/api/twilio/hold-music?callSid=${encodeURIComponent(callSid)}&amp;room=${encodeURIComponent(room)}&amp;l=${loops + 1}`

  // Play jingle on odd loops (0, 2, 4 …) so it alternates with the advert.
  const brandSegment = loops % 2 === 0 ? JINGLE : `<Say voice="Polly.Amy-Neural">${advert}</Say>`

  // <Gather> captures keypresses during ALL content inside it — caller can
  // press 1 or 2 at any moment without waiting for the "press 1 or 2" prompt.
  return xml(
    `<Gather action="${optionsUrl}" method="POST" numDigits="1" timeout="10">` +
    music() +
    `<Say voice="Polly.Amy-Neural">${checkin}</Say>` +
    brandSegment +
    music() +
    `<Say voice="Polly.Amy-Neural">` +
    `Press 1 to continue holding, or press 2 and we will call you back while keeping your place in the queue.` +
    `</Say>` +
    `</Gather>` +
    `<Redirect method="GET">${nextLoop}</Redirect>`,
  )
}
