import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')
  const userId = searchParams.get('userId')
  const intent = searchParams.get('intent')
  const competitorMention = searchParams.get('competitorMention')

  const where: Record<string, unknown> = {}
  if (leadId) where.leadId = leadId
  if (userId) where.userId = userId
  if (intent) where.intent = intent
  if (competitorMention === 'true') where.competitorMention = true

  const conversations = await prisma.conversationIntelligence.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ conversations })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leadId, userId, staffId, channel, messages, intent } = await req.json()

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze these conversation messages and return a JSON object with exactly these fields:
{
  "intent": "string",
  "sentiment": "positive" | "negative" | "neutral",
  "sentimentScore": number,
  "competitorMention": boolean,
  "competitorName": "string or null",
  "referralMention": boolean,
  "language": "string",
  "keyTopics": ["string"],
  "actionItems": ["string"],
  "summary": "string",
  "promiseMade": boolean,
  "promiseDetail": "string or null"
}

sentimentScore is -1 to 1. Return only valid JSON, no markdown.

Messages:
${messages.join('\n')}`,
      },
    ],
  })

  const content = message.content[0]

  let analysis: {
    intent: string
    sentiment: string
    sentimentScore: number
    competitorMention: boolean
    competitorName: string | null
    referralMention: boolean
    language: string
    keyTopics: string[]
    actionItems: string[]
    summary: string
    promiseMade: boolean
    promiseDetail: string | null
  }

  try {
    const text = content.type === 'text' ? content.text : ''
    analysis = JSON.parse(text)
  } catch {
    analysis = {
      intent: intent ?? 'unknown',
      sentiment: 'neutral',
      sentimentScore: 0,
      competitorMention: false,
      competitorName: null,
      referralMention: false,
      language: 'en',
      keyTopics: [],
      actionItems: [],
      summary: 'Analysis unavailable',
      promiseMade: false,
      promiseDetail: null,
    }
  }

  const conversation = await prisma.conversationIntelligence.create({
    data: {
      leadId:            leadId ?? null,
      userId:            userId ?? null,
      staffId:           staffId ?? null,
      channel,
      messageCount:      Array.isArray(messages) ? messages.length : 0,
      intent:            analysis.intent,
      sentiment:         analysis.sentiment,
      sentimentScore:    analysis.sentimentScore,
      competitorMention: analysis.competitorMention,
      competitorName:    analysis.competitorName ?? null,
      referralMention:   analysis.referralMention,
      language:          analysis.language,
      keyTopics:         analysis.keyTopics,
      actionItems:       analysis.actionItems,
      summary:           analysis.summary,
      promiseMade:       analysis.promiseMade,
      promiseDetail:     analysis.promiseDetail ?? null,
    },
  })

  return NextResponse.json({ conversation, analysis })
}
