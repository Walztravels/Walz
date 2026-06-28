import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const maxDuration = 90

type Audience = { id: string; name: string; description: string }

type WeekPostRaw = {
  day:          string
  postType:     string
  feedCaption:  string
  feedHashtags: string
  storyCaption: string
  platform:     string
  bestTime:     string
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body      = await req.json() as { weekStart: string }
  const weekStart = new Date(body.weekStart)

  const memory    = await prisma.marketingBrandMemory.findUnique({ where: { id: 'singleton' } })
  const audiences = (memory?.targetAudiences ?? []) as Audience[]
  const hashtags  = (memory?.hashtags  ?? []) as string[]
  const tov       = memory?.toneOfVoice ?? ''

  const weekDateStr = weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const systemPrompt = `You are the social media manager for Walz Travels, a premium travel agency for the African diaspora (UK, Canada, UAE).

BRAND VOICE: ${tov || 'Professional yet warm, empowering, diaspora-focused'}

TARGET AUDIENCES:
${audiences.map((a: Audience) => `- ${a.name}: ${a.description}`).join('\n') || '- UK Nigerians, Canada Ghanaians, UAE Africans, Japa travellers'}

BRAND HASHTAGS: ${hashtags.join(' ') || '#walztravels #africandiapora #travelagency'}

WhatsApp CTA to include: +447398753797

Generate a themed content week. Return ONLY valid JSON (no markdown):
{
  "weekTheme": "A catchy theme name e.g. 'UK Visa Season 2026' or 'Summer Japa Week'",
  "posts": [
    {
      "day": "monday",
      "postType": "motivational",
      "feedCaption": "Full Instagram/Facebook feed caption with emojis + WhatsApp CTA",
      "feedHashtags": "10-12 hashtags space-separated",
      "storyCaption": "Short punchy story version (max 3 lines)",
      "platform": "both",
      "bestTime": "19:00 GMT"
    }
  ]
}

STRICTLY follow this day schedule:
- monday:    postType=motivational  | platform=both     | bestTime=19:00 GMT | Energising week-starter content
- tuesday:   postType=educational   | platform=instagram | bestTime=12:00 GMT | Visa tip or travel fact specific to diaspora
- wednesday: postType=client_win    | platform=both     | bestTime=18:00 GMT | Client success story (keep it real, no names)
- thursday:  postType=flight_deal   | platform=facebook  | bestTime=17:00 GMT | Specific route + price range (London/Manchester flights)
- friday:    postType=weekend_promo | platform=both     | bestTime=16:00 GMT | Tour package or hotel deal
- saturday:  postType=behind_scenes | platform=instagram | bestTime=11:00 GMT | Team, process, or office life content
- sunday:    postType=community     | platform=both     | bestTime=20:00 GMT | Diaspora lifestyle or community content

Make every caption SPECIFIC to Walz Travels' brand. No generic travel content.`

  const anthropic = new Anthropic({ apiKey })
  const response  = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 6000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: `Generate the themed content week starting ${weekDateStr}. Make every post feel like it was written by someone who knows the diaspora travel market deeply. Return valid JSON only.` }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: { weekTheme: string; posts: WeekPostRaw[] }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? raw)
  } catch {
    return NextResponse.json({ error: 'Claude returned invalid JSON', raw }, { status: 500 })
  }

  const DAY_OFFSETS: Record<string, number> = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
    friday: 4, saturday: 5, sunday: 6,
  }

  const BEST_TIMES: Record<string, number> = {
    '19:00 GMT': 19, '12:00 GMT': 12, '18:00 GMT': 18,
    '17:00 GMT': 17, '16:00 GMT': 16, '11:00 GMT': 11, '20:00 GMT': 20,
  }

  // Create 2 posts per day: feed + story
  const created = await Promise.all(
    parsed.posts.flatMap((p: WeekPostRaw) => {
      const offset  = DAY_OFFSETS[p.day.toLowerCase()] ?? 0
      const hour    = BEST_TIMES[p.bestTime] ?? 19

      const feedDate = new Date(weekStart)
      feedDate.setDate(feedDate.getDate() + offset)
      feedDate.setHours(hour, 0, 0, 0)

      const storyDate = new Date(feedDate)
      storyDate.setMinutes(30)

      return [
        prisma.socialPost.create({
          data: {
            platform:    p.platform === 'facebook' ? 'facebook' : p.platform,
            postType:    'feed',
            caption:     p.feedCaption,
            hashtags:    p.feedHashtags,
            imageUrls:   [],
            scheduledAt: feedDate,
            status:      'draft',
            createdBy:   session.email,
          },
        }),
        prisma.socialPost.create({
          data: {
            platform:    'instagram',
            postType:    'story',
            caption:     p.storyCaption,
            hashtags:    '',
            imageUrls:   [],
            scheduledAt: storyDate,
            status:      'draft',
            createdBy:   session.email,
          },
        }),
      ]
    })
  )

  return NextResponse.json({
    weekTheme: parsed.weekTheme,
    posts:     created,
    count:     created.length,
  })
}
