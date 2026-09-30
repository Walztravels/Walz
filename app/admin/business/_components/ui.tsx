'use client'

// app/admin/business/_components/ui.tsx — Walz Business (Release 2) shared
// admin UI primitives. Tailwind only (never inline style={{}} — see the
// contrast-defect guardrail in
// __tests__/business-admin-organizations-page-contrast.test.ts), using the
// established Walz Admin dark tokens: text-white / text-white/60 /
// text-white/40, bg-[#0f1c33] + border-white/8 panels, gold #C9A84C accent.

import { useState, type ReactNode } from 'react'

export const inputCls =
  'px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50'
export const buttonCls =
  'px-4 py-2 rounded-xl bg-[#C9A84C] text-[#0a1628] font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d9ba5c] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50'
export const ghostButtonCls =
  'px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs hover:bg-white/5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50'

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bg-[#0f1c33] rounded-xl border border-white/8 p-4 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-white font-semibold text-sm">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 rounded-xl mb-3 text-sm">
      {message}
    </div>
  )
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="status" className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-2 rounded-xl mb-3 text-sm">
      {message}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'gold' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/10 text-white/70',
    good: 'bg-emerald-500/15 text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-300',
    bad: 'bg-red-500/15 text-red-300',
    gold: 'bg-[#C9A84C]/15 text-[#C9A84C]',
  }
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${tones[tone]}`}>{children}</span>
}

export function statusTone(status: string): 'neutral' | 'good' | 'warn' | 'bad' | 'gold' {
  if (['ACTIVE', 'APPROVED', 'COMPLETED', 'claimed'].includes(status)) return 'good'
  if (['ONBOARDING', 'INVITED', 'SUBMITTED', 'AWAITING_APPROVAL', 'PENDING', 'pending', 'IN_PROGRESS'].includes(status)) return 'warn'
  if (['SUSPENDED', 'CLOSED', 'REJECTED', 'CANCELLED', 'REMOVED', 'expired'].includes(status)) return 'bad'
  return 'neutral'
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d)
}

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/**
 * A mutation form that ALWAYS requires a reason (every admin mutation in
 * Walz Business is reason-required + audited server-side; this mirrors it
 * in the UI so the requirement is visible, not a surprise 400).
 */
export function ReasonForm({
  label, submitLabel, onSubmit, children, disabled,
}: {
  label: string
  submitLabel: string
  onSubmit: (reason: string) => Promise<string | null>
  children?: ReactNode
  disabled?: boolean
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) { setError('A reason is required'); return }
    setBusy(true); setError(null); setDone(null)
    const err = await onSubmit(reason.trim())
    setBusy(false)
    if (err) setError(err)
    else { setReason(''); setDone('Saved') }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label={label}>
      <ErrorBanner message={error} />
      <SuccessBanner message={done} />
      <div className="flex gap-2 flex-wrap items-center">
        {children}
        <input
          required
          aria-label={`${label} — reason`}
          placeholder="Reason (required, audited)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          className={`${inputCls} flex-[1_1_220px] text-sm`}
        />
        <button type="submit" disabled={busy || disabled} className={buttonCls}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export function humanizeAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
