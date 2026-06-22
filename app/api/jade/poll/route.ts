import { NextRequest, NextResponse } from 'next/server'
import { loadJadeSession, saveJadeSession } from '@/lib/jade-session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/jade/poll?conversationId=<id>
 *
 * Returns buffered agent messages for a website conversation and clears them.
 * Also reports whether agentActive is still true (so the widget knows whether
 * Jade has been resumed and the input should unlock).
 *
 * Called by JadeChatWidget every 3 seconds when isHandedOff === true.
 */
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) {
    return NextResponse.json({ messages: [], agentActive: false })
  }

  try {
    const session = await loadJadeSession(conversationId)
    const messages = session?.agentMessages ?? []

    if (messages.length > 0) {
      await saveJadeSession(conversationId, { ...session!, agentMessages: [] })
    }

    return NextResponse.json({
      messages,
      agentActive: session?.agentActive ?? false,
    })
  } catch {
    return NextResponse.json({ messages: [], agentActive: false })
  }
}
