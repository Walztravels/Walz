import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { DocumentBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

const EXTRACT_PROMPT = `You are an expert travel document parser. Analyse the provided travel document and extract every visible field into structured JSON.

First identify the document type:
- flight:   airline e-tickets, boarding passes, booking confirmations with flight details
- hotel:    hotel booking confirmations, reservation vouchers
- tour:     tour confirmations, activity vouchers, excursion bookings
- transfer: transfer / pickup / chauffeur confirmations
- visa:     visa appointment letters, VFS confirmations, embassy letters

Then extract ALL visible fields.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):

{
  "ticketType": "flight",
  "confidence": "high",
  "notes": "",

  "client": {
    "name": "",
    "email": "",
    "phone": ""
  },

  "flight": {
    "pnr": "",
    "tripType": "one-way",
    "outbound": [
      {
        "flightNumber": "",
        "airline": "",
        "aircraft": "",
        "operatedBy": "",
        "departureCode": "",
        "departureCity": "",
        "departureAirport": "",
        "departureCountry": "",
        "departureTerminal": "",
        "departureDate": "YYYY-MM-DD",
        "departureTime": "HH:MM",
        "arrivalCode": "",
        "arrivalCity": "",
        "arrivalAirport": "",
        "arrivalCountry": "",
        "arrivalTerminal": "",
        "arrivalDate": "YYYY-MM-DD",
        "arrivalTime": "HH:MM",
        "arrivalNextDay": false,
        "duration": "",
        "cabinClass": "Economy",
        "baggage": "",
        "seat": "",
        "mealPreference": "",
        "connectionTime": ""
      }
    ],
    "inbound": [],
    "passengers": [
      {
        "title": "Mr",
        "firstName": "",
        "lastName": "",
        "eTicketNumber": "",
        "cabinClass": "Economy",
        "seat": "",
        "meal": ""
      }
    ]
  },

  "hotel": {
    "booking_ref": "",
    "hotel_name": "",
    "hotel_address": "",
    "hotel_phone": "",
    "hotel_email": "",
    "checkin_date": "YYYY-MM-DD",
    "checkin_time": "HH:MM",
    "checkout_date": "YYYY-MM-DD",
    "checkout_time": "HH:MM",
    "num_nights": "",
    "room_type": "",
    "num_guests": "",
    "guest_names": "",
    "confirmation_number": "",
    "special_requests": ""
  },

  "tour": {
    "booking_ref": "",
    "tour_name": "",
    "tour_operator": "",
    "guide_name": "",
    "tour_date": "YYYY-MM-DD",
    "tour_time": "HH:MM",
    "duration": "",
    "meeting_point": "",
    "num_guests": "",
    "guest_names": "",
    "pickup_included": false,
    "pickup_address": "",
    "pickup_time": "",
    "what_included": "",
    "what_to_bring": "",
    "emergency_contact": ""
  },

  "transfer": {
    "booking_ref": "",
    "transfer_company": "",
    "vehicle_type": "Sedan",
    "driver_name": "",
    "driver_phone": "",
    "pickup_location": "",
    "pickup_date": "YYYY-MM-DD",
    "pickup_time": "HH:MM",
    "dropoff_location": "",
    "flight_number": "",
    "num_passengers": "",
    "passenger_names": "",
    "special_instructions": ""
  },

  "visa": {
    "reference_number": "",
    "visa_type": "Tourist",
    "passport_number": "",
    "appointment_date": "YYYY-MM-DD",
    "appointment_time": "HH:MM",
    "appointment_location": "",
    "vfs_address": "",
    "contact_person": "",
    "contact_phone": "",
    "documents_to_bring": ""
  }
}

Rules:
- ticketType: must be exactly one of: flight, hotel, tour, transfer, visa
- confidence: high = all key fields clearly visible; medium = some fields unclear; low = poor quality / ambiguous
- notes: comma-separated list of unclear or missing fields
- All dates: YYYY-MM-DD format only
- All times: HH:MM 24-hour format only
- cabinClass: must be one of: Economy, Premium Economy, Business, First Class
- vehicle_type: must be one of: Sedan, SUV, MPV, Minivan, Minibus, Coach
- visa_type: must be one of: Tourist, Business, Student, Work, Transit, Family, Medical
- passenger title: must be one of: Mr, Mrs, Ms, Miss, Dr, Prof
- tripType: "return" if inbound legs present, "one-way" otherwise
- For multi-stop flights, include ALL legs in the outbound/inbound arrays in order
- For return flights, outbound = departure journey, inbound = return journey
- what_included and what_to_bring: newline-separated list of items
- documents_to_bring: newline-separated list of items
- Leave any field as empty string "" if not visible in the document
- Return ONLY the JSON object, no markdown fences, no explanation`

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: `Unsupported file type: ${file.type}. Please upload a PDF, JPG, PNG or WEBP.`,
      }, { status: 400 })
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 20 MB.' }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const isPdf  = file.type === 'application/pdf'

    const docBlock: DocumentBlockParam = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    }
    const imgBlock: ImageBlockParam = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: base64,
      },
    }

    const res = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: isPdf
          ? [docBlock, { type: 'text', text: EXTRACT_PROMPT }]
          : [imgBlock, { type: 'text', text: EXTRACT_PROMPT }],
      }],
    })

    const raw  = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(json)
    } catch {
      console.error('[ticket-generator/parse] Bad JSON from model:', json.slice(0, 400))
      return NextResponse.json({ error: 'AI returned unreadable data. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data: parsed })
  } catch (e) {
    console.error('[ticket-generator/parse]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
