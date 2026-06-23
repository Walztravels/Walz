import { Suspense } from 'react'
import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAircallCalls } from '@/lib/aircall-api'
import { Phone, PhoneMissed, PhoneIncoming, Voicemail } from 'lucide-react'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calls — Walz Admin' }

type AircallCall = {
  id:           number
  direction:    string
  duration:     number
  status:       string
  started_at:   number
  raw_digits?:  string
  number?:      { digits?: string }
  user?:        { name?: string }
  recording?:   string | null
  voicemail?:   string | null
}

function formatDuration(secs: number): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function CallStatusIcon({ status }: { status: string }) {
  if (status === 'missed' || status === 'abandoned') {
    return <PhoneMissed className="w-4 h-4 text-red-500" />
  }
  if (status === 'voicemail') {
    return <Voicemail className="w-4 h-4 text-amber-500" />
  }
  return <PhoneIncoming className="w-4 h-4 text-emerald-500" />
}

async function CallsContent() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const supabase = getSupabaseAdmin()
  const today    = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

  const [{ data: dbCalls }, aircallData] = await Promise.all([
    supabase
      .from('ConversationRoute')
      .select('*')
      .eq('channel', 'voice')
      .order('assignedAt', { ascending: false })
      .limit(50),
    getAircallCalls(50),
  ])

  const aircallCalls = (aircallData?.calls ?? []) as AircallCall[]

  // Stats from DB calls today
  const todayCalls = (dbCalls ?? []).filter(c => c.assignedAt >= today)
  const missedCount   = todayCalls.filter(c => c.status === 'missed').length
  const voicemailCount = todayCalls.filter(c => c.status === 'voicemail').length
  const answeredCount  = todayCalls.length - missedCount - voicemailCount

  // Average duration from Aircall
  const todayAircall  = aircallCalls.filter(c => c.started_at * 1000 >= new Date(today).getTime())
  const avgDuration   = todayAircall.length
    ? Math.round(todayAircall.reduce((a, c) => a + (c.duration ?? 0), 0) / todayAircall.length)
    : 0

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Calls</h1>
        <p className="text-sm text-white/40 mt-1">Inbound call log from Aircall</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Today',        value: todayCalls.length,        icon: Phone,         accent: 'text-white' },
          { label: 'Answered',     value: answeredCount,            icon: PhoneIncoming, accent: 'text-emerald-400' },
          { label: 'Missed',       value: missedCount,              icon: PhoneMissed,   accent: 'text-red-400' },
          { label: 'Avg. Duration', value: formatDuration(avgDuration), icon: Voicemail, accent: 'text-amber-400' },
        ].map((s) => (
          <div key={s.label} className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <s.icon size={18} className="text-amber-400" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-1">{s.label}</p>
              <p className={cn('text-2xl font-semibold leading-none', s.accent)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Aircall call log */}
      {aircallCalls.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Live Call Log</h2>
          <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              {aircallCalls.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-colors">
                  <CallStatusIcon status={c.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium leading-tight">
                      {c.raw_digits ?? c.number?.digits ?? 'Unknown caller'}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {c.user?.name ?? 'Unassigned'} · {formatDuration(c.duration)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', {
                      'bg-emerald-500/15 text-emerald-400': c.status === 'done' || c.status === 'answered',
                      'bg-red-500/15 text-red-400':         c.status === 'missed' || c.status === 'abandoned',
                      'bg-amber-500/15 text-amber-400':     c.status === 'voicemail',
                      'bg-white/5 text-white/30':           !['done','answered','missed','abandoned','voicemail'].includes(c.status),
                    })}>
                      {c.status}
                    </span>
                    <span className="text-[10px] text-white/20">
                      {new Date(c.started_at * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {c.recording && (
                      <a href={c.recording} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline">
                        Recording
                      </a>
                    )}
                    {c.voicemail && (
                      <a href={c.voicemail} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline">
                        Voicemail
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 border border-dashed border-white/10 p-12 text-center mb-8">
          <Phone className="w-8 h-8 text-white/10 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-white/30">
            {process.env.AIRCALL_API_ID
              ? 'No calls yet today.'
              : 'Add AIRCALL_API_ID and AIRCALL_API_TOKEN in Vercel to enable live call log.'}
          </p>
        </div>
      )}

      {/* DB-routed voice calls */}
      {(dbCalls?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">All Routed Calls</h2>
          <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              {(dbCalls ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-colors">
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', {
                    'bg-emerald-400': c.status === 'active' || c.status === 'completed',
                    'bg-red-400':     c.status === 'missed',
                    'bg-amber-400':   c.status === 'voicemail' || c.status === 'escalated',
                    'bg-white/20':    !['active','completed','missed','voicemail','escalated'].includes(c.status),
                  })} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium leading-tight truncate">
                      {c.messagePreview ?? c.chatwootConversationId}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">→ {c.assignedToName ?? '—'}</p>
                  </div>
                  <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0', {
                    'bg-emerald-500/15 text-emerald-400': c.status === 'active' || c.status === 'completed',
                    'bg-red-500/15 text-red-400':         c.status === 'missed',
                    'bg-amber-500/15 text-amber-400':     c.status === 'voicemail' || c.status === 'escalated',
                    'bg-white/5 text-white/30':           !['active','completed','missed','voicemail','escalated'].includes(c.status),
                  })}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <CallsContent />
    </Suspense>
  )
}
