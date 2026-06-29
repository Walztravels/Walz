import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/db'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const session = await prisma.itineraryHiveSession.findUnique({
      where:   { slug: params.slug },
      include: { members: { where: { isSubmitted: true }, orderBy: { slotNumber: 'asc' } } },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const totalSubmitted = await prisma.itineraryHiveMember.count({
      where: { sessionId: session.id, isSubmitted: true },
    })

    if (totalSubmitted < session.memberCount) {
      return NextResponse.json({
        error:          `Waiting for ${session.memberCount - totalSubmitted} more traveller${session.memberCount - totalSubmitted === 1 ? '' : 's'} to submit before analysis can run.`,
        submittedCount: totalSubmitted,
        totalCount:     session.memberCount,
      }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    await prisma.itineraryHiveSession.update({
      where: { id: session.id },
      data:  { status: 'analysing' },
    })

    const memberSummaries = session.members.map(m => `
Traveller: ${m.name}
- Dream destinations: ${m.destinations || 'not specified'}
- Travel style: ${m.travelStyle || 'not specified'}
- Budget per person: ${m.budget || 'not specified'}
- Must-haves: ${m.mustHaves || 'not specified'}
- Available dates: ${m.dates || 'not specified'}
- Special needs: ${m.specialNeeds || 'none mentioned'}
`).join('\n---\n')

    const prompt = `You are Jade, Walz Travels' AI travel assistant for the African diaspora.

A group of ${session.memberCount} people are planning a trip together: "${session.tripName}".
${session.destination ? `They are considering: ${session.destination}` : 'No specific destination has been chosen yet.'}

Here are each person's travel preferences (submitted privately):

${memberSummaries}

Analyse ALL preferences and recommend the TOP 3 DESTINATIONS this specific group will love.

Important: Base your recommendations ONLY on the data above. Do not invent preferences or fabricate details.

Return ONLY valid JSON (no markdown, no code fences):
{
  "groupSummary": "2-3 sentence description of this group's collective vibe and what they share in common",
  "destinations": [
    {
      "rank": 1,
      "name": "City, Country",
      "emoji": "🌍",
      "whyItWorks": "Specific reason this works for THIS group — reference their actual preferences",
      "bestTime": "Best months to visit based on their dates",
      "budgetRange": "Estimated budget range per person in GBP",
      "highlight": "One standout experience for the group",
      "perTraveller": [
        { "name": "Traveller name", "theyWillLove": "Specific thing this person will enjoy" }
      ],
      "walzCanArrange": ["Flights from UK", "Hotel", "Tours", "Visa if required"]
    },
    { "rank": 2, ... },
    { "rank": 3, ... }
  ],
  "jadeTip": "One personalised tip from Jade for this specific group"
}`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw   = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

    let result: unknown
    try {
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      result = JSON.parse(jsonMatch?.[0] ?? clean)
    } catch {
      await prisma.itineraryHiveSession.update({
        where: { id: session.id },
        data:  { status: 'complete' },
      })
      return NextResponse.json({ error: 'Jade returned invalid JSON — please try again' }, { status: 502 })
    }

    await prisma.itineraryHiveSession.update({
      where: { id: session.id },
      data:  {
        status:         'done',
        analysisResult: JSON.stringify(result),
      },
    })

    return NextResponse.json({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[plan/group-hive analyse]', msg)
    return NextResponse.json({ error: 'Analysis failed', details: msg.slice(0, 200) }, { status: 500 })
  }
}
