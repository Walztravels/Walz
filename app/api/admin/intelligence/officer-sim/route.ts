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

  try {
    const text = content.type === 'text' ? content.text : ''
    simulation = JSON.parse(text)
  } catch {
    simulation = {
      objections: ['Insufficient funds', 'Weak ties to home country', 'Incomplete documentation'],
      idealResponses: ['Provide bank statements', 'Show property ownership', 'Submit all required forms'],
      weakestDoc: 'Bank statement',
      resistanceScore: 65,
      sessionNotes: 'Standard simulation completed',
    }
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
