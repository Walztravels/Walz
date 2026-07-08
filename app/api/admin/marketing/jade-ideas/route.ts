import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const { question } = await req.json() as { question: string }
  if (!question?.trim()) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  const anthropic = new Anthropic({ apiKey })

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    system: `You are Jade, Walz Travels' AI marketing assistant. Your job is to generate
creative, specific social media content ideas for the African diaspora travel market.

Focus areas: UK/Canada/UAE visa tips, flight deals from London/Manchester, diaspora
lifestyle content, client success stories, tour packages, immigration news.

Target audiences: Nigerians in UK, Ghanaians in Canada, Africans in UAE, Japa travellers.

Always end content ideas with a WhatsApp CTA mention (+12317902336).

Respond with 3-5 short, punchy content ideas — no fluff, no headers. Each idea should be
1-2 sentences that a social media manager can immediately act on. Be specific and topical.`,
    messages: [{ role: 'user', content: question }],
  })

  const ideas = response.content[0].type === 'text' ? response.content[0].text : ''

  return NextResponse.json({ ideas })
}
