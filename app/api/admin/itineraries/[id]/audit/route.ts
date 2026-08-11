import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const maxDuration = 60

const AUDIT_SYSTEM = `You are Jade, a meticulous travel-itinerary quality auditor for Walz Travels. You review itineraries before they are sent to clients and flag anything that would embarrass the agency, confuse the client, or cause a booking failure.

Return ONLY valid JSON with this shape — no markdown fences, no preamble:
{
  "score": 82,
  "summary": "One sentence overall assessment.",
  "blocksSend": false,
  "findings": [
    {
      "severity": "critical",
      "field": "clientEmail",
      "issue": "Client email is a placeholder — email will be sent to the wrong address.",
      "suggestion": "Update the client email before sending."
    }
  ]
}

Rules:
- score: 0–100. 100 = perfect. Deduct heavily for critical issues, lightly for warnings.
- blocksSend: true only if score < 40 OR a critical finding exists that directly prevents the itinerary being usable by the client.
- severity: "critical" (stops send), "warning" (should fix), "info" (nice to fix)
- field: which tab/section the finding belongs to — one of: overview, days, flights, hotels, transfers, pricing, terms, clientEmail, destination
- Keep findings concise and specific. Do not repeat the same finding twice.

Check for ALL of these and include relevant findings:

CRITICAL checks:
- clientEmail contains "pending@walztravels" or is empty
- destination is "TBD", "N/A", empty, or obviously a placeholder
- totalPrice is null/0 when a priceBreakdown exists with items
- clientName is empty or generic ("Client", "TBD")
- startDate is missing when there are flights or hotels
- Any day has title "Day X" with no description or activities (pure placeholder)

WARNING checks:
- No days defined (days array is empty or has 0 items)
- Days have no activities and no description
- Flights exist but have no date, or have "TBD" for airline/from/to
- Hotels have no checkIn date
- priceBreakdown items don't sum to totalPrice (within 1% tolerance) — show the discrepancy
- No inclusions defined when there are flights and hotels
- No terms set
- overview is missing or fewer than 50 characters
- cover image is missing (minor)

INFO checks:
- No transfer bookings when there are multiple flight legs
- Duration field is set but doesn't match the actual date span (startDate to endDate)
- No currency set

Only flag issues you can actually verify from the data provided. Do not hallucinate findings.`

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Build a concise structured snapshot to send to Claude
  const days      = safeParse<unknown[]>(itin.days, [])
  const flights   = safeParse<unknown[]>(itin.flights, [])
  const hotels    = safeParse<unknown[]>(itin.hotels, [])
  const transfers = safeParse<unknown[]>(itin.transfers ?? '[]', [])
  const inclusions  = safeParse<unknown[]>(itin.inclusions, [])
  const exclusions  = safeParse<unknown[]>(itin.exclusions, [])
  const priceBreakdown = safeParse<Array<{ item: string; cost: number }>>(itin.priceBreakdown, [])

  const breakdownTotal = priceBreakdown.reduce((s, r) => s + (Number(r.cost) || 0), 0)

  const snapshot = {
    referenceNumber: itin.referenceNumber,
    status:          itin.status,
    clientName:      itin.clientName,
    clientEmail:     itin.clientEmail,
    destination:     itin.destination,
    startDate:       itin.startDate,
    endDate:         itin.endDate,
    duration:        itin.duration,
    numberOfTravellers: itin.numberOfTravellers,
    currency:        itin.currency,
    totalPrice:      itin.totalPrice,
    deposit:         itin.deposit,
    overview:        itin.overview ? itin.overview.slice(0, 300) : null,
    hasCoverImage:   !!itin.coverImage,
    hasTerms:        !!(itin.terms && itin.terms.trim()),
    dayCount:        days.length,
    days: days.map((d: unknown) => {
      const day = d as Record<string, unknown>
      return {
        day: day.day,
        title: day.title,
        hasDescription: !!(day.description && String(day.description).trim()),
        activityCount: Array.isArray(day.activities) ? day.activities.length : 0,
        hasAccommodation: !!(day.accommodation && String(day.accommodation).trim()),
      }
    }),
    flightCount: flights.length,
    flights: flights.map((f: unknown) => {
      const fl = f as Record<string, unknown>
      return { from: fl.from, to: fl.to, airline: fl.airline, date: fl.date, class: fl.class }
    }),
    hotelCount: hotels.length,
    hotels: hotels.map((h: unknown) => {
      const ho = h as Record<string, unknown>
      return { name: ho.name, checkIn: ho.checkIn, checkOut: ho.checkOut, nights: ho.nights }
    }),
    transferCount: transfers.length,
    inclusionCount: inclusions.length,
    exclusionCount: exclusions.length,
    priceBreakdown: priceBreakdown.map(r => ({ item: r.item, cost: r.cost })),
    breakdownTotal,
    priceDiscrepancy: itin.totalPrice && breakdownTotal > 0
      ? Math.abs(breakdownTotal - Number(itin.totalPrice))
      : null,
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await claude.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  1500,
      temperature: 0,
      system:      AUDIT_SYSTEM,
      messages: [{
        role: 'user',
        content: `Audit this itinerary:\n\n${JSON.stringify(snapshot, null, 2)}`,
      }],
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const stripped = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const result = JSON.parse(stripped)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
