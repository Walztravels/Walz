'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string
  amount: number
  currency: string
  type: string
  method: string
  status: string
  provider_reference: string | null
  paid_at: string | null
  notes: string | null
  recorded_by: string | null
}

interface PaymentSummary {
  referenceNumber: string
  itineraryStatus: string
  currency: string
  acceptedTotal: number | null
  deposit: number | null
  paidTotal: number
  outstanding: number | null
  transactions: PaymentRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', NGN: '₦', AED: 'AED ' }
function fmt(amount: number | null | undefined, currency: string) {
  if (amount == null) return '—'
  const sym = CURRENCY_SYM[currency?.toUpperCase()] ?? (currency + ' ')
  return `${sym}${Number(amount).toLocaleString('en-GB')}`
}

function fmtDt(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

function statusChip(status: string) {
  const cfg: Record<string, { bg: string; color: string }> = {
    PAID:     { bg: 'rgba(22,163,74,0.15)',  color: '#4ade80' },
    PENDING:  { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
    FAILED:   { bg: 'rgba(220,38,38,0.15)',  color: '#f87171' },
    REFUNDED: { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' },
  }
  const c = cfg[status?.toUpperCase()] ?? { bg: 'rgba(255,255,255,0.1)', color: '#fff' }
  return (
    <span style={{ background: c.bg, color: c.color, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 6, letterSpacing: '0.04em' }}>
      {status}
    </span>
  )
}

// ── Record Payment Modal ───────────────────────────────────────────────────────

function RecordPaymentModal({
  itineraryId,
  currency,
  onClose,
  onRecorded,
}: {
  itineraryId: string
  currency: string
  onClose: () => void
  onRecorded: () => void
}) {
  const [type, setType]     = useState('BANK_TRANSFER')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [amount, setAmount] = useState('')
  const [notes, setNotes]   = useState('')
  const [status, setStatus] = useState<'PAID' | 'PENDING'>('PAID')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/itineraries/${itineraryId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, method, amount: amt, currency, notes, status }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to record payment.'); setSaving(false); return }
      onRecorded()
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const inp = 'w-full bg-white/[0.07] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-400/60'
  const sel = `${inp} appearance-none`

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 440, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Record Payment</h3>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Payment Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={sel}>
              <option value="DEPOSIT">Deposit</option>
              <option value="BALANCE">Balance</option>
              <option value="FULL">Full Payment</option>
              <option value="MANUAL">Manual / Other</option>
            </select>
          </div>

          <div>
            <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={sel}>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="MANUAL">Manual</option>
              <option value="STRIPE">Stripe (offline)</option>
              <option value="PAYSTACK">Paystack (offline)</option>
            </select>
          </div>

          <div>
            <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Amount ({currency})</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={inp}
            />
          </div>

          <div>
            <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'PAID' | 'PENDING')} className={sel}>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING (awaiting verification)</option>
            </select>
          </div>

          <div>
            <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Transfer ref, bank name, or other notes…"
              className={inp}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: saving ? 'rgba(245,158,11,0.5)' : '#f59e0b', color: '#000', fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function AdminPaymentPanel({ itineraryId }: { itineraryId: string }) {
  const [data, setData]           = useState<PaymentSummary | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/itineraries/${itineraryId}/payments`)
      if (!res.ok) { setError('Failed to load payment data'); setLoading(false); return }
      const json = await res.json() as PaymentSummary
      setData(json)
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }, [itineraryId])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading payment data…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: '#f87171', fontSize: 13 }}>{error ?? 'No payment data'}</p>
        <button onClick={() => void load()} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '6px 14px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>Retry</button>
      </div>
    )
  }

  const { currency, acceptedTotal, deposit, paidTotal, outstanding, transactions } = data
  const canRecord = data.itineraryStatus === 'approved' || data.itineraryStatus === 'revision_accepted'

  return (
    <>
      {recording && (
        <RecordPaymentModal
          itineraryId={itineraryId}
          currency={currency}
          onClose={() => setRecording(false)}
          onRecorded={() => { setRecording(false); void load() }}
        />
      )}

      <div>
        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Accepted Total', val: fmt(acceptedTotal, currency), color: '#f59e0b' },
            { label: 'Deposit',        val: fmt(deposit, currency),       color: 'rgba(255,255,255,0.7)' },
            { label: 'Paid',           val: fmt(paidTotal, currency),     color: paidTotal > 0 ? '#4ade80' : 'rgba(255,255,255,0.4)' },
            { label: 'Outstanding',    val: fmt(outstanding, currency),   color: (outstanding ?? 0) > 0 ? '#fbbf24' : '#4ade80' },
          ].map(t => (
            <div key={t.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t.label}</p>
              <p style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</p>
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {canRecord && (
            <button
              onClick={() => setRecording(true)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              + Record Payment
            </button>
          )}
          <button
            onClick={() => void load()}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Refresh
          </button>
          <a
            href={`/itinerary/${data.referenceNumber}/portal`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            View Client Portal ↗
          </a>
        </div>

        {/* Transaction table */}
        {transactions.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No payments recorded yet
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Date', 'Type', 'Method', 'Amount', 'Status', 'Reference', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, padding: '0 10px 10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 10px 10px 0', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{fmtDt(tx.paid_at)}</td>
                    <td style={{ padding: '10px 10px 10px 0', color: 'rgba(255,255,255,0.7)' }}>{tx.type}</td>
                    <td style={{ padding: '10px 10px 10px 0', color: 'rgba(255,255,255,0.5)' }}>{tx.method}</td>
                    <td style={{ padding: '10px 10px 10px 0', color: '#f59e0b', fontWeight: 700 }}>{fmt(tx.amount, tx.currency)}</td>
                    <td style={{ padding: '10px 10px 10px 0' }}>{statusChip(tx.status)}</td>
                    <td style={{ padding: '10px 10px 10px 0', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.provider_reference ?? '—'}
                    </td>
                    <td style={{ padding: '10px 10px 10px 0', color: 'rgba(255,255,255,0.4)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
