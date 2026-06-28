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

  const hiveSession = await prisma.groupHiveSession.findUnique({
    where: { id: params.id },
    include: { members: { orderBy: { slotNumber: 'asc' } } },
  })

  if (!hiveSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const submittedCount = hiveSession.members.filter(m => m.isSubmitted).length

  if (submittedCount < hiveSession.memberCount) {
    return NextResponse.json(
      { error: `Not all members have submitted yet. ${submittedCount} of ${hiveSession.memberCount} submitted.` },
      { status: 400 },
    )
  }

  await prisma.groupHiveSession.update({
    where: { id: params.id },
    data: { status: 'analysing' },
  })

  const memberSummaries = hiveSession.members.map((m, i) => `
Member ${i + 1}: ${m.firstName} ${m.lastName}
- Date of birth: ${m.dateOfBirth ?? 'not provided'}
- Nationality: ${m.nationality ?? 'not provided'}
- Passport number: ${m.passportNumber ? 'provided' : 'not provided'}
- Passport expiry: ${m.passportExpiry ?? 'not provided'}
- Email: ${m.email ?? 'not provided'}
- Phone: ${m.phone ?? 'not provided'}
- Previous UK/Schengen visa: ${m.hasUKVisa ? 'Yes' : 'No'}
- Previous visa refusals: ${m.previousRefusals ? 'Yes' : 'No'}
- Travel history: ${m.travelHistory ?? 'not stated'}
`).join('\n---\n')

  const prompt = `You are an expert visa consultant at Walz Travels, a premium travel agency for the African diaspora.

Analyse this group visa application based ONLY on the data provided below. Do not assume or invent any details not present in the data. If information is missing, note it as unavailable.

GROUP DETAILS:
- Group name: ${hiveSession.groupName}
- Visa type: ${hiveSession.visaType}
- Destination: ${hiveSession.destination}
- Travel date: ${hiveSession.travelDate ?? 'not specified'}
- Total members: ${hiveSession.memberCount}

MEMBER DATA:
${memberSummaries}

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "overallProbability": 75,
  "groupRiskLevel": "low" | "medium" | "high",
  "groupSummary": "2-3 sentence overall assessment",
  "strongestMember": "Name of member most likely approved",
  "memberNeedingMostPrep": "Name of member requiring most preparation",
  "members": [
    {
      "name": "First Last",
      "slotNumber": 1,
      "approvalProbability": 80,
      "riskLevel": "low" | "medium" | "high",
      "strengths": ["string"],
      "riskFactors": ["string"],
      "recommendations": ["string"]
    }
  ],
  "documentsAllMustProvide": ["string"],
  "groupConcerns": ["string"],
  "submissionStrategy": "string",
  "walzRecommendation": "string"
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
    await prisma.groupHiveSession.update({ where: { id: params.id }, data: { status: 'complete' } })
    return NextResponse.json({ error: 'Claude returned invalid JSON — try again' }, { status: 502 })
  }

  await prisma.groupHiveSession.update({
    where: { id: params.id },
    data: {
      analysisResult: JSON.stringify(analysis),
      status:         'done',
    },
  })

  return NextResponse.json({ success: true, analysis })
}
