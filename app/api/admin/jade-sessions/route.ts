import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()

    const [jadeSessions, silencedLeads, activeLeads, stats] = await Promise.all([
      supabase
        .from('JadeSession')
        .select('id, chatwoot_conversation_id, contact_id, intent, handover_at, resumed_at, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(30),

      supabase
        .from('leads')
        .select('id, name, email, whatsapp, platform, source, last_message, last_message_at, jade_active, jade_silenced_at, jade_resumed_at, assigned_to, service, status')
        .not('jade_silenced_at', 'is', null)
        .order('jade_silenced_at', { ascending: false })
        .limit(25),

      supabase
        .from('leads')
        .select('id, name, platform, source, last_message_at, service, status')
        .eq('jade_active', true)
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false })
        .limit(25),

      supabase
        .from('leads')
        .select('jade_active, jade_silenced_at')
        .not('last_message_at', 'is', null),
    ])

    const allLeads = stats.data ?? []
    const totalActive   = allLeads.filter((l: { jade_active: boolean }) => l.jade_active).length
    const totalSilenced = allLeads.filter((l: { jade_silenced_at: string | null }) => l.jade_silenced_at).length
    const totalSessions = jadeSessions.data?.length ?? 0
    const handedOver    = jadeSessions.data?.filter((s: { handover_at: string | null }) => s.handover_at).length ?? 0

    return NextResponse.json({
      stats: { totalActive, totalSilenced, totalSessions, handedOver },
      silencedLeads: silencedLeads.data ?? [],
      activeLeads:   activeLeads.data   ?? [],
      recentSessions: jadeSessions.data ?? [],
    })
  } catch (err) {
    console.error('[jade-sessions]', err)
    return NextResponse.json({ error: 'Failed to load jade data' }, { status: 500 })
  }
}
