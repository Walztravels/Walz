import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  const staffId = searchParams.get('staffId')

  const where: Record<string, string> = {}
  if (applicationId) where.applicationId = applicationId
  if (staffId) where.staffId = staffId

  const sessions = await prisma.officerSimulationSession.findMany({ where })

  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { applicationId, staffId, destination, officerType, context } = await req.json()

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are simulating a strict ${officerType} immigration officer for a ${destination} visa. Based on context: ${context || 'Standard application'}.

Return a JSON object with exactly these fields:
{
  "objections": ["string", "string", "string"],
  "idealResponses": ["string", "string", "string"],
  "weakestDoc": "string",
  "resistanceScore": number,
  "sessionNotes": "string"
}

resistanceScore must be 0-100. Return only valid JSON, no markdown.`,
      },
    ],
  })

  const content = message.content[0]
  let simulation: {
    objections: string[]
    idealResponses: string[]
    weakestDoc: string
    resistanceScore: number
    sessionNotes: string
  }

  // A simulation that cannot be parsed is a FAILED run: it is reported as
  // a controlled error and nothing is persisted — canned substitute output
  // must never be saved indistinguishably from real analysis.
  try {
    const text = content.type === 'text' ? content.text.trim() : ''
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (!Array.isArray(parsed.objections) || !Array.isArray(parsed.idealResponses)) {
      throw new Error('missing arrays')
    }
    simulation = {
      objections:      (parsed.objections as unknown[]).map(String).slice(0, 10),
      idealResponses:  (parsed.idealResponses as unknown[]).map(String).slice(0, 10),
      weakestDoc:      String(parsed.weakestDoc ?? ''),
      resistanceScore: Math.min(100, Math.max(0, Math.round(Number(parsed.resistanceScore) || 0))),
      sessionNotes:    String(parsed.sessionNotes ?? ''),
    }
  } catch {
    return NextResponse.json(
      {
        ok: false, code: 'AI_PARSE_FAILED',
        error: 'The simulation response could not be parsed — nothing was saved. Please run the simulation again.',
      },
      { status: 502 },
    )
  }

  const record = await prisma.officerSimulationSession.create({
    data: {
      applicationId,
      staffId,
      destination,
      officerType,
      objections:     simulation.objections,
      responses:      simulation.idealResponses,
      weakestDoc:     simulation.weakestDoc,
      resistanceScore: simulation.resistanceScore,
      sessionNotes:   simulation.sessionNotes,
      completedAt:    new Date(),
    },
  })

  return NextResponse.json({ session: record, simulation })
}
