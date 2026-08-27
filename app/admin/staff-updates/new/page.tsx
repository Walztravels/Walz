'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const CATEGORIES = [
  { value: 'NEW_FEATURE',   label: 'New Feature' },
  { value: 'SYSTEM_UPDATE', label: 'System Update' },
  { value: 'POLICY',        label: 'Policy' },
  { value: 'SUPPLIER',      label: 'Supplier' },
  { value: 'IMPORTANT',     label: 'Important' },
  { value: 'TRAINING',      label: 'Training' },
]

const AUDIENCES = [
  { value: 'EVERYONE',            label: 'Everyone' },
  { value: 'SALES',               label: 'Sales' },
  { value: 'VISA_TEAM',           label: 'Visa Team' },
  { value: 'TRAVEL_CONSULTANTS',  label: 'Travel Consultants' },
  { value: 'FINANCE',             label: 'Finance' },
  { value: 'ADMIN_TEAM',          label: 'Admin' },
  { value: 'MANAGEMENT',          label: 'Management' },
]

const PRIORITIES = [
  { value: 'NORMAL', label: 'Normal', color: 'text-blue-300' },
  { value: 'HIGH',   label: 'High',   color: 'text-amber-300' },
  { value: 'URGENT', label: 'Urgent', color: 'text-red-300' },
]

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
        {label}{required && <span className="text-[#C9A84C] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2.5 bg-[#0d1e35] border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C]/50 transition-colors'

export default function NewAnnouncementPage() {
  const router = useRouter()

  const [title,         setTitle]         = useState('')
  const [category,      setCategory]      = useState('NEW_FEATURE')
  const [summary,       setSummary]       = useState('')
  const [detail,        setDetail]        = useState('')
  const [whatToDo,      setWhatToDo]      = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [relevantUrl,   setRelevantUrl]   = useState('')
  const [audience,      setAudience]      = useState('EVERYONE')
  const [priority,      setPriority]      = useState('NORMAL')
  const [publishAction, setPublishAction] = useState<'DRAFT'|'PUBLISHED'>('DRAFT')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !summary || !detail) {
      setError('Title, summary and detail are required.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, category, summary, detail, whatToDo: whatToDo || null,
          effectiveDate: effectiveDate || null,
          relevantUrl: relevantUrl || null,
          audience, priority,
          status: publishAction,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      router.push(`/admin/staff-updates/${data.announcement.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Back */}
      <Link href="/admin/staff-updates" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Staff Updates
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">New Announcement</h1>
        <p className="text-white/40 text-sm mt-1">Approved announcements appear in the Jade Daily Brief</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Content</h2>

          <Field label="Title" required>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Viator Automated Booking" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" required>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Summary" required>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="One-paragraph overview visible in the brief preview and notification…"
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>

          <Field label="Full Explanation" required>
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="Detailed explanation of the change, why it was made, and how it works…"
              rows={6}
              className={inputCls + ' resize-none'}
            />
          </Field>

          <Field label="What staff need to do">
            <textarea
              value={whatToDo}
              onChange={e => setWhatToDo(e.target.value)}
              placeholder="Specific actions staff should take (optional)…"
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>
        </div>

        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Distribution</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Audience">
              <select value={audience} onChange={e => setAudience(e.target.value)} className={inputCls}>
                {AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </Field>
            <Field label="Effective Date">
              <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Relevant URL / Documentation">
            <input value={relevantUrl} onChange={e => setRelevantUrl(e.target.value)} placeholder="https://…" className={inputCls} />
          </Field>
        </div>

        {/* Publish actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            onClick={() => setPublishAction('DRAFT')}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#112240] border border-white/10 hover:border-white/20 text-white font-medium text-sm rounded-xl transition-colors disabled:opacity-50"
          >
            {saving && publishAction === 'DRAFT' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save as Draft
          </button>
          <button
            type="submit"
            disabled={saving}
            onClick={() => setPublishAction('PUBLISHED')}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-semibold text-sm rounded-xl transition-colors disabled:opacity-50"
          >
            {saving && publishAction === 'PUBLISHED' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Publish Now
          </button>
        </div>

      </form>
    </div>
  )
}
