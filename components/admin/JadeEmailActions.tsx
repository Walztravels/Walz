'use client'

import { useState } from 'react'
import { Mail, Eye, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export function JadeEmailActions({ hasBrief, briefDate }: { hasBrief: boolean; briefDate: string }) {
  const [sending, setSending] = useState(false)
  const [result,  setResult]  = useState<'sent' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function sendTestEmail() {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/jade/brief/test-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ briefDate }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to send')
        setResult('error')
      } else {
        setResult('sent')
      }
    } catch {
      setErrorMsg('Network error — try again')
      setResult('error')
    } finally {
      setSending(false)
    }
  }

  if (!hasBrief) {
    return (
      <p className="text-xs text-white/30 italic">No brief generated today — actions unavailable.</p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={`/api/admin/jade/brief/preview-email?date=${briefDate}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors ring-1 ring-white/10"
      >
        <Eye className="w-4 h-4 text-[#C9A84C]" />
        Preview Email
      </a>

      <button
        onClick={sendTestEmail}
        disabled={sending}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 text-[#C9A84C] text-sm font-medium transition-colors ring-1 ring-[#C9A84C]/20 disabled:opacity-50"
      >
        {sending
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Mail className="w-4 h-4" />
        }
        {sending ? 'Sending…' : 'Send Test to Me'}
      </button>

      {result === 'sent' && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" /> Sent to your email
        </span>
      )}
      {result === 'error' && (
        <span className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
        </span>
      )}
    </div>
  )
}
