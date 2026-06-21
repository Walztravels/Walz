import { NextRequest, NextResponse } from 'next/server'
import { fetchClientMemory } from '@/lib/jade-memory'
import { cacheGet, cacheSet } from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const PROFILE_TTL = 7 * 24 * 60 * 60  // 7 days

function profileKey(id: string) { return `jade_profile_${id}` }

function mergeProfile(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value) && Array.isArray(merged[key])) {
      merged[key] = [...new Set([...(merged[key] as unknown[]), ...value])]
    } else {
      merged[key] = value
    }
  }
  return merged
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const convId    = searchParams.get('conversationId') ?? ''

  // String session ID → Redis profile
  if (sessionId) {
    const profile = (await cacheGet<Record<string, unknown>>(profileKey(sessionId))) ?? {}
    return NextResponse.json({ profile, messages: [], contactId: null })
  }

  if (!convId) return NextResponse.json({ error: 'sessionId or conversationId required' }, { status: 400 })

  const isNumeric = /^\d+$/.test(convId)
  if (isNumeric) {
    const result = await fetchClientMemory(Number(convId))
    return NextResponse.json(result)
  }

  // Non-numeric conversationId treated as sessionId
  const profile = (await cacheGet<Record<string, unknown>>(profileKey(convId))) ?? {}
  return NextResponse.json({ profile, messages: [], contactId: null })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    sessionId?:      string
    conversationId?: string
    profileUpdates?: Record<string, unknown>
  }

  const id = body.sessionId ?? body.conversationId
  if (!id)                  return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  if (!body.profileUpdates) return NextResponse.json({ error: 'profileUpdates required' }, { status: 400 })

  const key      = profileKey(id)
  const existing = (await cacheGet<Record<string, unknown>>(key)) ?? {}
  const merged   = mergeProfile(existing, body.profileUpdates)
  await cacheSet(key, merged, PROFILE_TTL)

  // Persist name/email/phone to Supabase leads when Chatwoot convId is present
  const chatwootConvId = body.profileUpdates.chatwootConvId as number | null | undefined
  if (chatwootConvId) {
    const update: Record<string, string> = {}
    const { name, email, phone } = body.profileUpdates
    if (name  && typeof name  === 'string') update.name  = name
    if (email && typeof email === 'string') update.email = email
    if (phone && typeof phone === 'string') update.phone = phone
    if (Object.keys(update).length > 0) {
      try {
        await getSupabaseAdmin()
          .from('leads')
          .update(update)
          .eq('chatwoot_conversation_id', chatwootConvId)
      } catch {}
    }
  }

  return NextResponse.json({ success: true, profile: merged })
}
