'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ExternalLink, CheckCircle2, Eye, Archive, Edit2,
  Loader2, Calendar, Users, AlertTriangle, ShieldCheck, ClipboardCheck,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

type Announcement = {
  id: string; title: string; category: string; summary: string
  detail: string; whatToDo: string | null; effectiveDate: string | null
  relevantUrl: string | null; audience: string; priority: string
  status: string; publishedAt: string | null; createdAt: string
  author: { name: string; email: string }
}

type AckStatus = { readAt: string | null; acknowledgedAt: string | null }

type AckReportRow = {
  id: string; name: string; role: string; department: string
  readAt: string | null; acknowledgedAt: string | null
}

type AckReport = {
  totalTargeted: number; acknowledgedCount: number; outstandingCount: number
  outstanding: AckReportRow[]; staff: AckReportRow[]
}

const CRITICAL_PRIORITIES = ['HIGH', 'URGENT']

const STATUS_CHIP: Record<string,string> = {
  DRAFT:     'bg-gray-500/10 text-gray-400 border-gray-500/20',
  APPROVED:  'bg-amber-500/10 text-amber-300 border-amber-500/20',
  PUBLISHED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  ARCHIVED:  'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AnnouncementDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const { profile } = useStaffPermissions()
  const isAdmin  = profile?.role === 'super_admin' || profile?.role === 'admin'

  const [ann,     setAnn]     = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const [ackStatus, setAckStatus]     = useState<AckStatus | null>(null)
  const [acking,    setAcking]        = useState(false)
  const [report,    setReport]        = useState<AckReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/announcements/${id}`)
      .then(r => r.json())
      .then(d => setAnn(d.announcement ?? null))
      .finally(() => setLoading(false))
  }, [id])

  // Mark as read + fetch own ack status once the announcement is loaded and
  // published. A viewer who isn't actually targeted by this announcement
  // (e.g. an admin browsing outside their own audience) gets a harmless
  // 403 from the ack route — silently ignored, no UI shown for it.
  useEffect(() => {
    if (!ann || ann.status !== 'PUBLISHED') return
    fetch(`/api/admin/announcements/${id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setAckStatus(d) })
      .catch(() => {})
  }, [ann, id])

  // Super Admin outstanding-acknowledgement report — only surfaced for
  // Critical (HIGH/URGENT) announcements, per the mission's scope for this
  // report; the underlying tracking exists for every priority.
  useEffect(() => {
    if (!ann || !isAdmin || profile?.role !== 'super_admin') return
    if (!CRITICAL_PRIORITIES.includes(ann.priority)) return
    setReportLoading(true)
    fetch(`/api/admin/announcements/${id}/ack/report`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setReport(d) })
      .finally(() => setReportLoading(false))
  }, [ann, id, isAdmin, profile?.role])

  async function acknowledge() {
    setAcking(true)
    try {
      const res = await fetch(`/api/admin/announcements/${id}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge' }),
      })
      if (res.ok) setAckStatus(await res.json())
    } finally {
      setAcking(false)
    }
  }

  async function changeStatus(newStatus: string) {
    if (!ann) return
    setSaving(true)
    const res = await fetch(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const d = await res.json()
    setAnn(d.announcement)
    setSaving(false)
  }

  if (loading) return <div className="animate-pulse h-64 bg-[#112240] rounded-2xl" />
  if (!ann)    return <div className="text-white/40 text-center py-20">Announcement not found</div>

  return (
    <div className="max-w-2xl space-y-6">

      <Link href="/admin/staff-updates" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Staff Updates
      </Link>

      {/* Header card */}
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[#C9A84C] text-[11px] font-bold uppercase tracking-wider">
                {ann.category.replace(/_/g, ' ')}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_CHIP[ann.status]}`}>
                {ann.status}
              </span>
              {ann.priority !== 'NORMAL' && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  ann.priority === 'URGENT' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {ann.priority}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white">{ann.title}</h1>
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {saving && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
              {ann.status === 'DRAFT' && (
                <button onClick={() => changeStatus('APPROVED')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
              )}
              {ann.status === 'APPROVED' && (
                <button onClick={() => changeStatus('PUBLISHED')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                  <Eye className="w-3.5 h-3.5" /> Publish
                </button>
              )}
              {ann.status === 'PUBLISHED' && (
                <button onClick={() => changeStatus('ARCHIVED')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 transition-colors">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              )}
            </div>
          )}
        </div>

        <p className="text-white/70 text-sm leading-relaxed">{ann.summary}</p>

        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/5 text-xs text-white/40">
          <div>
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">By</span>
            {ann.author.name}
          </div>
          <div>
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">Published</span>
            {fmt(ann.publishedAt)}
          </div>
          <div>
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">Effective</span>
            {fmt(ann.effectiveDate)}
          </div>
        </div>
      </div>

      {/* Full explanation */}
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Full Explanation</h2>
        <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{ann.detail}</p>
      </div>

      {/* What to do */}
      {ann.whatToDo && (
        <div className="bg-[#112240] rounded-2xl ring-1 ring-[#C9A84C]/20 p-6 space-y-3">
          <h2 className="text-xs font-semibold text-[#C9A84C]/80 uppercase tracking-wider">What You Need to Do</h2>
          <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{ann.whatToDo}</p>
        </div>
      )}

      {/* Source link */}
      {ann.relevantUrl && (
        <a
          href={ann.relevantUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#112240] rounded-2xl ring-1 ring-white/5 p-4 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4 text-[#C9A84C]" />
          View Documentation / Source
        </a>
      )}

      {/* Acknowledgement — Critical announcements only. Acknowledging means
          "I have received and reviewed this" — it is never framed as, and
          must never be read as, agreement with the content. */}
      {ann.status === 'PUBLISHED' && CRITICAL_PRIORITIES.includes(ann.priority) && ackStatus && (
        <div className={`rounded-2xl ring-1 p-5 flex items-center justify-between gap-4 ${
          ackStatus.acknowledgedAt
            ? 'bg-emerald-500/5 ring-emerald-500/20'
            : 'bg-amber-500/5 ring-amber-500/20'
        }`}>
          <div className="flex items-start gap-3">
            <ClipboardCheck className={`w-5 h-5 mt-0.5 flex-shrink-0 ${ackStatus.acknowledgedAt ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div>
              <p className="text-white text-sm font-semibold">
                {ackStatus.acknowledgedAt ? 'Acknowledged' : 'Acknowledgement required'}
              </p>
              <p className="text-white/50 text-xs mt-0.5">
                {ackStatus.acknowledgedAt
                  ? `You acknowledged receipt and review of this notice on ${fmt(ackStatus.acknowledgedAt)}.`
                  : 'This is a critical staff update. Please confirm you have received and reviewed it.'}
              </p>
            </div>
          </div>
          {!ackStatus.acknowledgedAt && (
            <button
              onClick={acknowledge}
              disabled={acking}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8943d] disabled:opacity-50 transition-colors"
            >
              {acking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              I acknowledge receipt &amp; review
            </button>
          )}
        </div>
      )}

      {/* Super Admin — outstanding acknowledgement report (Critical only) */}
      {isAdmin && profile?.role === 'super_admin' && CRITICAL_PRIORITIES.includes(ann.priority) && (
        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Acknowledgement Report</h2>
          </div>

          {reportLoading ? (
            <div className="animate-pulse h-16 bg-white/5 rounded-xl" />
          ) : !report ? (
            <p className="text-white/30 text-xs">No data yet.</p>
          ) : (
            <>
              <p className="text-white text-sm">
                Acknowledged <span className="font-bold text-emerald-300">{report.acknowledgedCount}</span> of{' '}
                <span className="font-bold">{report.totalTargeted}</span>
                {report.outstandingCount > 0 && (
                  <span className="text-amber-300"> — {report.outstandingCount} outstanding</span>
                )}
              </p>
              {report.outstanding.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  {report.outstanding.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-white/70">{s.name}</span>
                      <span className="text-white/30">{s.readAt ? 'Read, not acknowledged' : 'Not yet opened'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}
