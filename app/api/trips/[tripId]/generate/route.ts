import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getAnthropic } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


type Ctx = { params: { tripId: string } }

const JADE_PLANNER_PROMPT = `You are Jade, Walz Travels' expert trip planner AI. You create detailed, day-by-day itineraries that are practical, inspiring, and perfectly paced.

When generating an itinerary:
- Structure it as a JSON array of day objects
- Each day has: dayNumber, title, items[]
- Each item has: type (FLIGHT|HOTEL|TOUR|ACTIVITY|RESTAURANT|TRANSPORT|NOTE|CUSTOM), title, description, location, startTime (HH:MM), endTime (optional), cost (optional number)
- Be specific about locations and timings
- Include a mix of must-see attractions and local hidden gems
- Account for travel time between locations
- Suggest at least one meal spot per day
- Keep it realistic — don't overpack

Respond ONLY with valid JSON in this format:
{
  "title": "Trip title",
  "coverImageQuery": "search query for a hero image",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day title",
      "items": [
        {
          "type": "ACTIVITY",
          "title": "Item name",
          "description": "Brief description",
          "location": "Specific location",
          "startTime": "09:00",
          "endTime": "11:00",
          "cost": 25
        }
      ]
    }
  ]
}

Do not include any markdown, explanation, or text outside the JSON.`

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const trip = await prisma.trip.findUnique({
    where: { id: params.tripId },
    include: {
      days: { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { dayNumber: 'asc' } },
    },
  })
  if (!trip || trip.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt, replaceAll } = body

  const durationDays = trip.startDate && trip.endDate
    ? Math.max(1, Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1)
    : 7

  const userPrompt = prompt
    ? `Generate a ${durationDays}-day itinerary for ${trip.destination}. Additional context: ${prompt}`
    : `Generate a ${durationDays}-day itinerary for ${trip.destination}. Trip: "${trip.title}". ${trip.description ? `Description: ${trip.description}` : ''}`

  const message = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: JADE_PLANNER_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Try to extract JSON from the response
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) } catch { /* ignore */ }
    }
    if (!parsed) {
      return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
    }
  }

  // Optionally delete existing days/items first
  if (replaceAll) {
    await prisma.tripDay.deleteMany({ where: { tripId: params.tripId } })
    await prisma.tripItem.deleteMany({ where: { tripId: params.tripId, dayId: null } })
  }

  // Update trip title if provided
  if (parsed.title) {
    await prisma.trip.update({
      where: { id: params.tripId },
      data: { title: parsed.title },
    })
  }

  // Persist generated days + items
  const savedDays = []
  if (Array.isArray(parsed.days)) {
    for (const day of parsed.days) {
      const startOffset = (day.dayNumber - 1) * 86400000
      const dayDate = trip.startDate
        ? new Date(new Date(trip.startDate).getTime() + startOffset)
        : null

      const tripDay = await prisma.tripDay.create({
        data: {
          tripId:    params.tripId,
          dayNumber: day.dayNumber,
          title:     day.title ?? `Day ${day.dayNumber}`,
          date:      dayDate,
        },
      })

      const savedItems = []
      if (Array.isArray(day.items)) {
        for (let i = 0; i < day.items.length; i++) {
          const item = day.items[i]
          const saved = await prisma.tripItem.create({
            data: {
              tripId:      params.tripId,
              dayId:       tripDay.id,
              type:        item.type ?? 'CUSTOM',
              title:       item.title ?? 'Activity',
              description: item.description ?? null,
              location:    item.location ?? null,
              startTime:   item.startTime ?? null,
              endTime:     item.endTime ?? null,
              cost:        item.cost ?? null,
              order:       i,
              sourceType:  'jade_ai',
            },
          })
          savedItems.push(saved)
        }
      }

      savedDays.push({ ...tripDay, items: savedItems })
    }
  }

  // Save conversation message
  await prisma.tripMessage.create({
    data: {
      tripId:  params.tripId,
      role:    'assistant',
      content: `Generated ${savedDays.length}-day itinerary for ${trip.destination}`,
      metadata: { prompt: userPrompt, daysGenerated: savedDays.length },
    },
  })

  return NextResponse.json({ days: savedDays, title: parsed.title })
}
