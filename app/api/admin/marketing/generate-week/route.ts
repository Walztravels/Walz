import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const maxDuration = 90

type Audience = { id: string; name: string; description: string }

type WeekPost = {
  day: string
  platform: string
  postType: string
  contentType: string
  hook: string
  caption: string
  hashtags: string
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as { weekStart: string }
  const weekStart = new Date(body.weekStart)

  const memory = await prisma.marketingBrandMemory.findUnique({ where: { id: 'singleton' } })

  const audiences = (memory?.targetAudiences ?? []) as Audience[]
  const hashtags  = (memory?.hashtags  ?? []) as string[]
  const tov       = memory?.toneOfVoice ?? ''

  const systemPrompt = `You are the social media manager for Walz Travels, a travel agency for the African diaspora.

BRAND VOICE: ${tov}

TARGET AUDIENCES:
${audiences.map((a: Audience) => `- ${a.name}: ${a.description}`).join('\n')}

BRAND HASHTAGS: ${hashtags.join(' ')}

Generate a 7-day content plan. Return ONLY valid JSON, no markdown:
{
  "posts": [
    {
      "day": "Monday",
      "platform": "instagram",
      "postType": "feed",
      "contentType": "visa_tip",
      "hook": "scroll-stopping first line",
      "caption": "full caption with emojis and WhatsApp CTA (+447398753797)",
      "hashtags": "8-12 relevant hashtags space-separated"
    }
  ]
}

Week plan must include:
- Day 1 (Monday): Visa tip — Instagram feed
- Day 2 (Tuesday): Flight deal — Facebook post
- Day 3 (Wednesday): Client win/testimonial — Instagram + Facebook
- Day 4 (Thursday): Visa tip — Instagram feed
- Day 5 (Friday): Flight deal — Instagram feed
- Day 6 (Saturday): Tour promo — Instagram + Facebook
- Day 7 (Sunday): Jade AI feature — Instagram story`

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate 7 posts for the week starting ${weekStart.toDateString()}. Make each post unique, on-brand, and specific to Walz Travels' diaspora audience.` }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: { posts: WeekPost[] }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? raw)
  } catch {
    return NextResponse.json({ error: 'Claude returned invalid JSON', raw }, { status: 500 })
  }

  const DAY_OFFSETS: Record<string, number> = {
    Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
    Friday: 4, Saturday: 5, Sunday: 6,
  }

  const created = await Promise.all(
    parsed.posts.map(async (p: WeekPost) => {
      const offset = DAY_OFFSETS[p.day] ?? 0
      const scheduledAt = new Date(weekStart)
      scheduledAt.setDate(scheduledAt.getDate() + offset)
      scheduledAt.setHours(19, 0, 0, 0)

      return prisma.socialPost.create({
        data: {
          platform:    p.platform,
          postType:    p.postType,
          caption:     p.caption,
          hashtags:    p.hashtags,
          imageUrls:   [],
          scheduledAt,
          status:      'draft',
          createdBy:   session.email,
        },
      })
    })
  )

  return NextResponse.json({ posts: created, count: created.length })
}
