import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ItemType = 'FLIGHT' | 'HOTEL' | 'TOUR' | 'VISA' | 'ESIM' | 'ACTIVITY' | 'RESTAURANT' | 'TRANSPORT' | 'NOTE' | 'CUSTOM'

interface RawItem {
  type?: string
  title: string
  description?: string
  location?: string
  startTime?: string
  endTime?: string
  cost?: number
  bookingRef?: string
  imageUrl?: string
  externalUrl?: string
  confirmed?: boolean
  order?: number
  metadata?: Record<string, unknown>
}

interface RawDay {
  dayNumber: number
  title?: string
  items?: RawItem[]
}

interface GeneratedItinerary {
  title?: string
  overview?: string
  highlights?: string[]
  days?: RawDay[]
  estimatedTotalCost?: number
  packingTips?: string[]
  bookingNotes?: string
}

const TYPE_MAP: Record<string, ItemType> = {
  FLIGHT: 'FLIGHT', HOTEL: 'HOTEL', TOUR: 'TOUR',
  ACTIVITY: 'ACTIVITY', RESTAURANT: 'RESTAURANT',
  TRANSFER: 'TRANSPORT', TRANSPORT: 'TRANSPORT',
  CUSTOM: 'CUSTOM', NOTE: 'NOTE',
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tripId } = await params
  const { prompt, clientPreferences } = await req.json()

  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { days: true } })
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: `You are a luxury travel planner for Walz Travels, an expert travel agency specialising in the African diaspora market (Nigeria, Ghana, UK). Create detailed, day-by-day itineraries that are practical, specific, and beautifully structured. Always include: specific hotel names, restaurant recommendations with cuisine type, activity timings, and transportation notes. Include estimated costs in ${trip.currency}. Return ONLY valid JSON.`,
    messages: [{
      role: 'user',
      content: `Create a detailed itinerary:
Destination: ${trip.destination}
Duration: ${trip.days.length} days
Budget: ${trip.budget ? `${trip.currency} ${trip.budget}` : 'Flexible'}
Client preferences: ${clientPreferences || prompt || 'Luxury, cultural experiences, great food'}

Return JSON:
{
  "title": "Trip title",
  "overview": "2-3 sentence summary",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "days": [
    {
      "dayNumber": 1,
      "title": "Day 1: Arrival & Exploration",
      "items": [
        {
          "type": "FLIGHT|HOTEL|ACTIVITY|RESTAURANT|TRANSFER|CUSTOM",
          "title": "Specific name",
          "description": "Detailed description",
          "location": "Specific address or area",
          "startTime": "14:00",
          "endTime": "15:00",
          "cost": 0,
          "bookingRef": null,
          "confirmed": false,
          "order": 0
        }
      ]
    }
  ],
  "estimatedTotalCost": 0,
  "packingTips": ["tip 1"],
  "bookingNotes": "Internal notes"
}`,
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
  let itinerary: GeneratedItinerary = {}
  try {
    itinerary = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as GeneratedItinerary
  } catch { /* fallback to empty */ }

  if (itinerary.days) {
    for (const day of itinerary.days) {
      const dbDay = trip.days.find(d => d.dayNumber === day.dayNumber)
      if (dbDay && day.items) {
        await prisma.tripDay.update({ where: { id: dbDay.id }, data: { title: day.title } })
        for (let i = 0; i < day.items.length; i++) {
          const item = day.items[i]
          await prisma.tripItem.create({
            data: {
              tripId,
              dayId: dbDay.id,
              type: TYPE_MAP[item.type?.toUpperCase() ?? ''] ?? 'CUSTOM',
              title: item.title,
              description: item.description,
              location: item.location,
              startTime: item.startTime,
              endTime: item.endTime,
              cost: item.cost,
              currency: trip.currency,
              bookingRef: item.bookingRef,
              imageUrl: item.imageUrl,
              externalUrl: item.externalUrl,
              confirmed: item.confirmed || false,
              order: i,
              metadata: (item.metadata ?? {}) as Parameters<typeof prisma.tripItem.create>[0]['data']['metadata'],
            },
          })
        }
      }
    }
    if (itinerary.title && trip.title === 'New Trip') {
      await prisma.trip.update({ where: { id: tripId }, data: { title: itinerary.title } })
    }
  }

  return NextResponse.json({ itinerary, success: true })
}
