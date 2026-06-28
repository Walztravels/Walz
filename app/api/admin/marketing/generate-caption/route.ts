import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const maxDuration = 60

type Audience = { id: string; name: string; description: string }

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as {
    contentType: string
    targetMarket: string
    platform: string
    tone: string
    details: string
  }

  const memory = await prisma.marketingBrandMemory.findUnique({ where: { id: 'singleton' } })

  const audiences = (memory?.targetAudiences ?? []) as Audience[]
  const hashtags  = (memory?.hashtags  ?? []) as string[]
  const themes    = (memory?.themes    ?? []) as string[]
  const tov       = memory?.toneOfVoice ?? ''

  const systemPrompt = `You are the social media manager for Walz Travels, a travel agency for the African diaspora.

BRAND VOICE:
${tov}

TARGET AUDIENCES:
${audiences.map((a: Audience) => `- ${a.name}: ${a.description}`).join('\n')}

KEY BRAND THEMES:
${themes.map((t: string) => `- ${t}`).join('\n')}

ALWAYS INCLUDE:
- WhatsApp CTA: +447398753797
- 1-2 relevant emojis per paragraph
- Call to action (DM, WhatsApp, link in bio)
- Hashtags from our brand list

BRAND HASHTAGS (pick 8-12 per post):
${hashtags.join(' ')}

Generate 3 distinct caption variations for the request.
Return ONLY valid JSON, no markdown, no code fences:
{
  "captions": [
    {
      "variation": 1,
      "hook": "first line that stops the scroll",
      "caption": "full caption text",
      "hashtags": "space-separated hashtags",
      "bestTime": "e.g. Tuesday 7pm GMT",
      "storyVersion": "shortened version for stories (max 150 chars)"
    }
  ]
}`

  const userPrompt = `Content type: ${body.contentType}
Target market: ${body.targetMarket}
Platform: ${body.platform}
Tone adjustment: ${body.tone}
Details / brief: ${body.details}`

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: { captions: unknown[] }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? raw)
  } catch {
    return NextResponse.json({ error: 'Claude returned invalid JSON', raw }, { status: 500 })
  }

  return NextResponse.json({ captions: parsed.captions })
}
