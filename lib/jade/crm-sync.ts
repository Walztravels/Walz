// lib/jade/crm-sync.ts
// Release 4C-B — server-side CRM lead sync triggered when Jade creates a trip.
//
// SECURITY invariants:
//   - Never exposes rateKey, supplierCost, partnerNetPrice, or internal markup to Lead
//   - assignedToId is NEVER overwritten if already set (preserves staff assignment)
//   - Only fires for authenticated users in this release (userId required)
//   - Fire-and-forget: CRM sync failure must never break the trip flow

import prisma from '@/lib/db'

interface TripForCrmSync {
  id:          string
  destination: string | null
  origin:      string | null
  startDate:   Date | null
  endDate:     Date | null
  adults:      number
  children:    number
  currency:    string
  budget:      number | null
}

function buildTravelDetails(trip: TripForCrmSync): string {
  const parts: string[] = []
  if (trip.destination) parts.push(`Destination: ${trip.destination}`)
  if (trip.origin)      parts.push(`From: ${trip.origin}`)
  const adultStr    = trip.adults > 0   ? `${trip.adults} adult${trip.adults > 1 ? 's' : ''}` : null
  const childStr    = trip.children > 0 ? `${trip.children} child${trip.children > 1 ? 'ren' : ''}` : null
  const pax         = [adultStr, childStr].filter(Boolean).join(', ')
  if (pax)          parts.push(`Travellers: ${pax}`)
  if (trip.startDate) {
    const from = trip.startDate.toISOString().slice(0, 10)
    const to   = trip.endDate ? ` – ${trip.endDate.toISOString().slice(0, 10)}` : ''
    parts.push(`Dates: ${from}${to}`)
  }
  if (trip.budget)  parts.push(`Budget: ${trip.currency} ${trip.budget.toLocaleString()}`)
  parts.push('Source: Jade AI website chat')
  return parts.join('\n')
}

export async function syncJadeLeadForTrip(
  userId:  string,
  tripCtx: TripForCrmSync,
): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { name: true, email: true },
    })
    if (!user?.email) return null

    const details     = buildTravelDetails(tripCtx)
    const travelDate  = tripCtx.startDate
      ? tripCtx.startDate.toISOString().slice(0, 10)
      : undefined
    const destination = tripCtx.destination ?? undefined

    const existing = await prisma.lead.findFirst({
      where:  { email: user.email },
      select: { id: true, assignedToId: true },
    })

    if (existing) {
      // Enrich — assignedToId is never touched
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          destination,
          travelDate,
          details,
          service:      'Holiday Package',
          jadeAssisted: true,
          platform:     'Website',
        },
      })
      await prisma.trip.update({
        where: { id: tripCtx.id },
        data:  { leadId: existing.id },
      })
      prisma.commercialEvent.create({
        data: {
          event:    'jade_lead_updated',
          userId,
          leadId:   existing.id,
          metadata: { tripId: tripCtx.id, source: 'jade_trip_created' },
        },
      }).catch(() => {})
      return existing.id
    }

    // No existing lead → create one
    const lead = await prisma.lead.create({
      data: {
        name:         user.name ?? 'Website Visitor',
        email:        user.email,
        destination,
        travelDate,
        details,
        service:      'Holiday Package',
        source:       'jade_website',
        status:       'New',
        isRead:       false,
        jadeAssisted: true,
        platform:     'Website',
      },
      select: { id: true },
    })
    await prisma.trip.update({
      where: { id: tripCtx.id },
      data:  { leadId: lead.id },
    })
    prisma.commercialEvent.create({
      data: {
        event:    'jade_lead_created',
        userId,
        leadId:   lead.id,
        metadata: { tripId: tripCtx.id, source: 'jade_trip_created' },
      },
    }).catch(() => {})
    return lead.id
  } catch (err) {
    console.error('[jade-crm-sync] syncJadeLeadForTrip failed:', err)
    return null
  }
}
