import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Twilio Conference waitUrl — plays Walz Travels hold content on loop.
// Twilio re-GETs this endpoint each time the current TwiML finishes,
// so the <Redirect> at the end creates an infinite music loop.
//
// TO ADD BRANDED AUDIO: replace a <Say> block with:
//   <Play>https://walztravels.com/hold-music.mp3</Play>
// The file must be publicly accessible and served with a valid Content-Type.

const BASE_URL = 'https://www.walztravels.com'

function xml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function GET() {
  return xml(
    `<Say voice="Polly.Amy-Neural">` +
    `Thank you for holding. You're through to Walz Travels, London — ` +
    `your expert travel partner for flights, visas, hotels, and tailor-made holiday packages. ` +
    `One of our specialists is on their way to take your call.` +
    `</Say>` +
    `<Pause length="3"/>` +
    `<Say voice="Polly.Amy-Neural">` +
    `While you wait — Walz Travels handles Schengen visas, US B1-B2, Canada, Australia, UAE, ` +
    `and UK visitor visas, often with some of the fastest turnaround times in London. ` +
    `We also specialise in group travel, corporate bookings, and complete holiday packages ` +
    `including flights, accommodation, and transfers. ` +
    `We appreciate your patience and will be with you in just a moment.` +
    `</Say>` +
    `<Pause length="4"/>` +
    `<Say voice="Polly.Amy-Neural">` +
    `You're still in the queue for Walz Travels. Thank you so much for waiting — ` +
    `we'll be right with you.` +
    `</Say>` +
    `<Pause length="3"/>` +
    `<Redirect method="GET">${BASE_URL}/api/twilio/hold-music</Redirect>`,
  )
}
