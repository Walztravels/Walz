import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { message, context = {}, conversationHistory = [] } = await req.json() as {
    message: string
    context?: { page?: string }
    conversationHistory?: Array<{ role: string; content: string }>
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const systemPrompt = `You are Jade, the AI assistant for Walz Travels staff.

You help the team with:
- Visa requirements and processing times for any country
- Drafting emails and letters to clients
- Travel industry knowledge and destination information
- Answering quick operational questions
- General admin support

You do NOT generate itinerary JSON in this context — that is handled by the Jade Copilot in the itinerary builder.
Keep responses concise — 2-4 sentences when possible, unless a detailed list is clearly needed.
Be practical and direct. You are talking to a travel agent, not a client.
Current page context: ${(context as { page?: string }).page || 'admin'}`

  // Try OpenAI gpt-4o-mini first (fast + cheap)
  const openAiKey = process.env.OPENAI_API_KEY
  if (openAiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...(conversationHistory as Array<{ role: string; content: string }>).slice(-6),
            { role: 'user', content: message },
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { choices: Array<{ message: { content: string } }> }
        return NextResponse.json({
          response: data.choices?.[0]?.message?.content,
          model: 'gpt-4o-mini',
        })
      }
    } catch (err: unknown) {
      console.error('[jade/chat] OpenAI failed:', err instanceof Error ? err.message : err)
    }
  }

  // Claude Haiku fallback (fastest Claude model)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: [
          ...(conversationHistory as Array<{ role: string; content: string }>).slice(-6),
          { role: 'user', content: message },
        ],
      }),
    })
    const data = await res.json() as { content: Array<{ text: string }> }
    return NextResponse.json({
      response: data.content?.[0]?.text,
      model: 'claude-haiku',
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI unavailable' },
      { status: 500 }
    )
  }
}
