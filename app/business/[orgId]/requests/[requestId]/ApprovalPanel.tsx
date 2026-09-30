'use client'

// Approve / Reject controls wired to the existing CAS-protected
// POST .../requests/[requestId]/approve route. A 409 ("already decided") is
// a normal outcome under concurrency, not an error: the panel switches to a
// read-only "already decided" state showing the winning decision and
// refreshes the page data.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ApprovalPanel({
  orgId, requestId, existingDecision,
}: { orgId: string; requestId: string; existingDecision: string | null }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null)
  const [error, setError] = useState<string | null>(null)
  const [decided, setDecided] = useState<{ decision: string; mine: boolean } | null>(
    existingDecision && existingDecision !== 'PENDING' ? { decision: existingDecision, mine: true } : null,
  )

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !reason.trim()) {
      setError('Please give a reason when rejecting a request.')
      return
    }
    setBusy(decision); setError(null)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDecided({ decision, mine: true })
        router.refresh()
      } else if (res.status === 409) {
        // Lost the race / already decided — show the recorded outcome.
        setDecided({ decision: data.decision ?? 'DECIDED', mine: false })
        router.refresh()
      } else {
        setError(data.error ?? 'Could not record your decision. Please try again.')
      }
    } catch {
      setError('Could not record your decision. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  if (decided) {
    const approved = decided.decision === 'APPROVED'
    return (
      <div role="status" style={{ padding: 12, borderRadius: 8, background: approved ? '#eefaf0' : '#fdf0f0', border: `1px solid ${approved ? '#b7e4c0' : '#f3c2c2'}`, color: approved ? '#1d5f2c' : '#8a1f1f' }}>
        {decided.mine
          ? <>Your decision has been recorded: <strong>{decided.decision}</strong>.</>
          : <>This approval had already been decided (<strong>{decided.decision}</strong>) — decisions can&apos;t be changed once recorded.</>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
      {error && <div role="alert" style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 10, borderRadius: 6 }}>{error}</div>}
      <textarea
        aria-label="Reason (required to reject)"
        placeholder="Reason (required to reject, optional to approve)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        rows={2}
        maxLength={2000}
        style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => decide('APPROVED')} disabled={!!busy}
          style={{ padding: '8px 16px', borderRadius: 6, background: '#1d7a3a', color: '#fff', border: 'none', fontWeight: 600 }}>
          {busy === 'APPROVED' ? 'Approving…' : 'Approve'}
        </button>
        <button type="button" onClick={() => decide('REJECTED')} disabled={!!busy}
          style={{ padding: '8px 16px', borderRadius: 6, background: '#a32020', color: '#fff', border: 'none', fontWeight: 600 }}>
          {busy === 'REJECTED' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
