import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const hiveSession = await prisma.itineraryHiveSession.findUnique({
    where: { id: params.id },
    include: { members: { orderBy: { slotNumber: 'asc' } } },
  })

  if (!hiveSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const submittedMembers = hiveSession.members.filter(m => m.isSubmitted)

  if (submittedMembers.length < hiveSession.memberCount) {
    return NextResponse.json(
      { error: `Not all members have submitted yet. ${submittedMembers.length} of ${hiveSession.memberCount} submitted.` },
      { status: 400 },
    )
  }

  await prisma.itineraryHiveSession.update({
    where: { id: params.id },
    data: { status: 'analysing' },
  })

  const memberSummaries = submittedMembers.map((m, i) => `
Member ${i + 1}: ${m.name || `Traveller ${m.slotNumber}`}
- Preferred destinations: ${m.destinations ?? 'not stated'}
- Travel style: ${m.travelStyle ?? 'not stated'}
- Budget: ${m.budget ?? 'not stated'}
- Must-haves: ${m.mustHaves ?? 'not stated'}
- Available dates: ${m.dates ?? 'not stated'}
- Special needs: ${m.specialNeeds ?? 'none stated'}
`).join('\n---\n')

  const prompt = `You are Jade, Walz Travels' expert AI travel concierge. A group of travellers has submitted their individual preferences and you must find destinations that work brilliantly for everyone.

TRIP: ${hiveSession.tripName}
TRAVELLERS: ${hiveSession.memberCount}

INDIVIDUAL PREFERENCES:
${memberSummaries}

Carefully analyse each person's preferences, find genuine overlap and complementary interests, and recommend exactly 3 destinations ranked by overall group fit.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "groupSummary": "2-3 sentence overview of the group's collective vibe, shared interests, and any tensions to balance",
  "destinations": [
    {
      "rank": 1,
      "name": "City, Country",
      "emoji": "🌍",
      "whyItWorks": "Why this destination satisfies the group as a whole — reference specific members' preferences",
      "bestTime": "Best travel window e.g. Oct–Nov",
      "budgetRange": "Estimated per-person budget range e.g. £1,200–£1,800",
      "highlight": "One standout experience or feature of this destination",
      "perTraveller": [
        { "name": "Traveller name", "theyWillLove": "What specifically appeals to this person" }
      ],
      "walzCanArrange": ["Flights from UK", "Hotel", "Tours", "Transfers"]
    }
  ],
  "jadeTip": "One personalised tip from Jade for making this group trip a success"
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  })

  const raw   = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let analysis: unknown
  try {
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    analysis = JSON.parse(jsonMatch?.[0] ?? clean)
  } catch {
    await prisma.itineraryHiveSession.update({ where: { id: params.id }, data: { status: 'complete' } })
    return NextResponse.json({ error: 'Jade returned invalid JSON — try again' }, { status: 502 })
  }

  await prisma.itineraryHiveSession.update({
    where: { id: params.id },
    data: {
      analysisResult: JSON.stringify(analysis),
      status:         'done',
    },
  })

  return NextResponse.json({ success: true, result: analysis })
}
