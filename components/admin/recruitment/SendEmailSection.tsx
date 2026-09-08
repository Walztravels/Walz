'use client'
import { useState, useEffect, useCallback } from 'react'
import { Mail, Send } from 'lucide-react'

/**
 * Explicit human email sending to one candidate: pick a template, edit
 * freely, preview the substitutions, send. Nothing is sent automatically.
 */

interface Template { id: string; key: string; name: string; subject: string; body: string; isActive: boolean }

export default function SendEmailSection({ applicationId, candidateEmail }: {
  applicationId: string; candidateEmail: string
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected,  setSelected]  = useState('')
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')
  const [open,      setOpen]      = useState(false)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')
  const [notice,    setNotice]    = useState('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/admin/recruitment/templates')
      const data = await res.json()
      if (res.ok) setTemplates((data.templates ?? []).filter((t: Template) => t.isActive))
    } catch { /* stays empty */ }
  }, [])
  useEffect(() => { void load() }, [load])

  function pick(id: string) {
    setSelected(id)
    const t = templates.find(x => x.id === id)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }

  async function send() {
    if (!subject.trim() || !body.trim()) return
    if (!confirm(`Send this email to ${candidateEmail} now?`)) return
    setBusy(true); setError(''); setNotice('')
    const t = templates.find(x => x.id === selected)
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, templateKey: t?.key }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Send failed'); return }
    setNotice(`Email sent to ${candidateEmail} and recorded in the Email Hub.`)
    setSubject(''); setBody(''); setSelected(''); setOpen(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-[#C9A84C]" /> Email the candidate
        </h2>
        <button onClick={() => setOpen(v => !v)}
          className="text-xs font-bold text-[#0B1F3A] bg-[#C9A84C] px-3 py-1.5 rounded-lg">
          {open ? 'Close' : 'Compose'}
        </button>
      </div>
      {error  && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {notice && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{notice}</p>}

      {open && (
        <div className="space-y-2.5">
          <select value={selected} onChange={e => pick(e.target.value)}
            aria-label="Start from a template"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <option value="">Start from a template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
            placeholder="Subject" aria-label="Email subject"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={9} maxLength={10000}
            placeholder="Write your message… placeholders like {{firstName}}, {{jobTitle}} and {{reference}} are filled in automatically."
            aria-label="Email body"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 font-mono" />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] text-gray-400">
              To: {candidateEmail} · sent under your name, recorded in the Email Hub. You choose when this goes — nothing sends automatically.
            </p>
            <button onClick={() => void send()} disabled={busy || !subject.trim() || !body.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-bold bg-[#0B1F3A] text-white px-4 py-2 rounded-xl disabled:opacity-40">
              <Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
