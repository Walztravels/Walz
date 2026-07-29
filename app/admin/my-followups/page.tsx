'use client'

import { useEffect, useState, useCallback } from 'react'
import { Flame, Thermometer, Snowflake, MessageCircle, Mail, Clock, CheckCircle2, ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

// ── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  id:             string
  name:           string
  email:          string | null
  whatsapp:       string | null
  service:        string
  destination:    string | null
  interestLevel:  string | null
  followUpNote:   string | null
  lastContactedAt: string | null
  nextFollowUpAt: string | null
  status:         string
}

interface FollowUps {
  overdue:   Lead[]
  today:     Lead[]
  upcoming:  Lead[]
  noDate:    Lead[]
}

// ── Interest level badge ────────────────────────────────────────────────────

function InterestBadge({ level }: { level: string | null }) {
  if (!level) return null
  const map = {
    hot:  { icon: Flame,       label: 'hot',  cls: 'bg-red-500/20 text-red-400' },
    warm: { icon: Thermometer, label: 'warm', cls: 'bg-amber-500/20 text-amber-400' },
    cold: { icon: Snowflake,   label: 'cold', cls: 'bg-sky-500/20 text-sky-400' },
  } as const
  const cfg = map[level as keyof typeof map]
  if (!cfg) return null
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.cls)}>
      <Icon size={11} /> {cfg.label}
    </span>
  )
}

// ── Snooze menu ─────────────────────────────────────────────────────────────

function SnoozeMenu({ leadId, onSnoozed }: { leadId: string; onSnoozed: () => void }) {
  const [open, setOpen] = useState(false)

  async function snooze(days: number) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(9, 0, 0, 0)
    await fetch(`/api/admin/leads/${leadId}/followup`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nextFollowUpAt: d.toISOString() }),
    })
    setOpen(false)
    onSnoozed()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
      >
        <Clock size={13} />
        Snooze
        <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 right-0 bg-[#152035] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden min-w-[130px]">
          {[
            { label: '+1 day',  days: 1  },
            { label: '+3 days', days: 3  },
            { label: '+1 week', days: 7  },
          ].map(({ label, days }) => (
            <button
              key={days}
              onClick={() => snooze(days)}
              className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lead card ───────────────────────────────────────────────────────────────

function LeadCard({ lead, onUpdate }: { lead: Lead; onUpdate: () => void }) {
  const [marking, setMarking] = useState(false)

  const detail = [lead.service, lead.destination].filter(Boolean).join(' · ')
  const lastContact = lead.lastContactedAt
    ? formatDistanceToNow(new Date(lead.lastContactedAt), { addSuffix: true })
    : null

  async function markDone() {
    setMarking(true)
    await fetch(`/api/admin/leads/${lead.id}/followup`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'Closed' }),
    })
    onUpdate()
  }

  return (
    <div className="bg-[#0d1e35] border border-white/8 rounded-2xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{lead.name}</p>
          {detail && <p className="text-white/40 text-xs mt-0.5">{detail}</p>}
        </div>
        <InterestBadge level={lead.interestLevel} />
      </div>

      {/* Follow-up note */}
      {lead.followUpNote && (
        <p className="text-white/60 text-xs italic leading-relaxed">
          &ldquo;{lead.followUpNote}&rdquo;
        </p>
      )}

      {/* Last contact */}
      {lastContact && (
        <p className="text-white/30 text-[11px]">Last contact: {lastContact}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {lead.whatsapp && (
          <a
            href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 transition-colors"
          >
            <MessageCircle size={13} />
            WhatsApp
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
          >
            <Mail size={13} />
            Email
          </a>
        )}
        <SnoozeMenu leadId={lead.id} onSnoozed={onUpdate} />
        <button
          onClick={markDone}
          disabled={marking}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/8 text-white/40 hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 size={13} />
          Done
        </button>
      </div>
    </div>
  )
}

// ── Section ─────────────────────────────────────────────────────────────────

function Section({
  emoji, title, leads, badge, onUpdate,
}: {
  emoji: string; title: string; leads: Lead[]; badge?: 'urgent'; onUpdate: () => void
}) {
  if (leads.length === 0) return null
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <h2 className={cn(
          'text-sm font-semibold',
          badge === 'urgent' ? 'text-red-400' : 'text-white/70',
        )}>
          {title} <span className="text-white/30 font-normal">({leads.length})</span>
        </h2>
      </div>
      {leads.map(l => (
        <LeadCard key={l.id} lead={l} onUpdate={onUpdate} />
      ))}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MyFollowupsPage() {
  const [data,    setData]    = useState<FollowUps | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/leads/my-followups')
      setData(await res.json() as FollowUps)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const total = data
    ? data.overdue.length + data.today.length + data.upcoming.length + data.noDate.length
    : 0

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-xl">My Follow-ups</h1>
          {data && !loading && (
            <p className="text-white/40 text-xs mt-0.5">{total} active leads assigned to you</p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-xl bg-white/8 text-white/50 hover:text-white/80 hover:bg-white/12 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-16">
          <RefreshCw size={22} className="animate-spin text-white/30" />
        </div>
      )}

      {data && (
        <>
          <Section emoji="⚠️" title="Overdue"    leads={data.overdue}   badge="urgent" onUpdate={load} />
          <Section emoji="📅" title="Today"      leads={data.today}     onUpdate={load} />
          <Section emoji="📆" title="This week"  leads={data.upcoming}  onUpdate={load} />
          <Section emoji="❓" title="No date set" leads={data.noDate}   onUpdate={load} />

          {total === 0 && (
            <div className="text-center py-16">
              <p className="text-white/30 text-sm">No follow-ups assigned to you.</p>
              <p className="text-white/20 text-xs mt-1">Check back later or ask your manager to assign leads.</p>
            </div>
          )}
        </>
      )}

    </div>
  )
}
