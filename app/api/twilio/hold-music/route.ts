import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Twilio Conference waitUrl — plays Walz Travels hold content on loop.
//
// Twilio re-GETs this URL each time the current TwiML response finishes.
// The ?l= (loop counter) increments on each redirect.
//
// After ~60 s (loops >= 2) with no agent joining, plays an apology message
// and issues <Leave/> to exit the conference, which fires the <Dial action>
// URL in voice-jade → caller returns to Jade for a retry or further help.
//
// TO ADD BRANDED AUDIO: replace a <Say> block with:
//   <Play>https://walztravels.com/hold-music.mp3</Play>
// The file must be publicly accessible with a valid audio Content-Type.

const BASE_URL = 'https://www.walztravels.com'

function xml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function GET(req: NextRequest) {
  const loops   = parseInt(req.nextUrl.searchParams.get('l') ?? '0', 10)
  const nextUrl = `${BASE_URL}/api/twilio/hold-music?l=${loops + 1}`

  // After ~60 s of hold music the outbound agent calls have already timed out.
  // Apologise and leave the conference so the <Dial action> fires and the
  // caller is returned to Jade's retry prompt.
  if (loops >= 2) {
    return xml(
      `<Say voice="Polly.Amy-Neural">` +
      `We're sorry, all of our travel specialists are with other clients right now. ` +
      `Please bear with us — Jade will continue helping you in just a moment.` +
      `</Say>` +
      `<Leave/>`,
    )
  }

  // Twilio royalty-free hold music (publicly available, no attribution required)
  const MUSIC_1 = 'https://com.twilio.music.classical.s3.amazonaws.com/ClockworkWaltz.mp3'
  const MUSIC_2 = 'https://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3'

  // ── Loop 0 — ad then music ────────────────────────────────────────────────
  if (loops === 0) {
    return xml(
      `<Say voice="Polly.Amy-Neural">` +
      `Thank you for holding. You're through to Walz Travels, London — ` +
      `your expert travel partner for flights, visas, hotels, and tailor-made holiday packages. ` +
      `One of our specialists is on their way to take your call.` +
      `</Say>` +
      `<Play>${MUSIC_1}</Play>` +
      `<Redirect method="GET">${nextUrl}</Redirect>`,
    )
  }

  // ── Loop 1 — second ad then music ────────────────────────────────────────
  return xml(
    `<Say voice="Polly.Amy-Neural">` +
    `Thank you so much for your patience — we will be with you in just a moment. ` +
    `Walz Travels: visas, flights, hotels, and tailor-made holidays. ` +
    `Your specialist is almost with you.` +
    `</Say>` +
    `<Play>${MUSIC_2}</Play>` +
    `<Redirect method="GET">${nextUrl}</Redirect>`,
  )
}
