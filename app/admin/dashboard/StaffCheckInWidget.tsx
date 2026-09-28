'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
// Attendance is manual-only: a slot is CHECKED_IN if and only if the staff
// member explicitly pressed "Check In" during that window. Admin-panel
// activity, Inbox activity, Team Hub activity, and browser presence never
// factor into any of the values below.
type SlotStatus = 'PENDING' | 'CHECKED_IN' | 'MISSED'

interface RawSlot {
  id:              string | null
  windowStart:     string
  lagosHour:       number
  status:          SlotStatus
  manualCheckin:   boolean
  actualCheckInAt: string | null
  dispute:         string | null
  disputeStatus:   string | null
  waived:          boolean
}

interface RawCurrentSlot {
  id:              string | null
  windowStart:     string
  windowEnd:       string
  lagosHour:       number
  status:          SlotStatus
  manualCheckin:   boolean
  actualCheckInAt: string | null
  open:            boolean
  minutesRemaining: number
}

interface RawApiResponse {
  tracked:     boolean
  name?:       string
  workStart?:  number
  workEnd?:    number
  currentSlot: RawCurrentSlot | null
  todaySlots:  RawSlot[]
  weekSummary: { required: number; completed: number; missed: number; deductionsByCurrency: Record<string, number> }
  currencySymbol?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt12(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:00 ${suffix}`
}

function fmtClock(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDeductions(m: Record<string, number>): string {
  const entries = Object.entries(m).filter(([, v]) => v > 0)
  if (entries.length === 0) return '0'
  const symbol = (c: string) => (c === 'GHS' ? 'GH₵' : c === 'NGN' ? '₦' : `${c} `)
  return entries.map(([c, v]) => `${symbol(c)}${v.toLocaleString()}`).join(' · ')
}

const STATUS_COLOR: Record<SlotStatus, string> = {
  CHECKED_IN: '#4ade80',
  MISSED:     '#f87171',
  PENDING:    '#3a4a68',
}
const STATUS_LABEL: Record<SlotStatus, string> = {
  CHECKED_IN: 'Checked in',
  MISSED:     'Missed',
  PENDING:    'Upcoming',
}

// ── Dispute modal ─────────────────────────────────────────────────────────────
function DisputeModal({ slot, onClose, onDone }: {
  slot:    RawSlot
  onClose: () => void
  onDone:  () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  async function submit() {
    if (!note.trim()) { setErr('Please describe the issue.'); return }
    if (!slot.id)     { setErr('No record to dispute yet — try again after the hour ends.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/check-ins/${slot.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'dispute', note: note.trim() }),
      })
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? 'Failed'); return }
      onDone()
      onClose()
    } catch {
      setErr('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0d1526', borderRadius: 12,
        border: '0.5px solid #1f2b42',
        padding: 24, width: '100%', maxWidth: 360,
      }}>
        <p style={{ margin: '0 0 4px', color: '#ffffff', fontWeight: 500, fontSize: 14 }}>
          Report issue — {fmt12(slot.lagosHour)}
        </p>
        <p style={{ margin: '0 0 12px', color: '#7a8aa8', fontSize: 12 }}>
          Describe why this slot should not count as a miss. An admin will review it.
        </p>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setErr('') }}
          placeholder="e.g. I was on approved leave"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#16213a', border: '0.5px solid #1f2b42',
            borderRadius: 8, color: '#ffffff', fontSize: 12,
            padding: '10px 12px', resize: 'none', outline: 'none',
          }}
        />
        {err && <p style={{ color: '#f87171', fontSize: 11, margin: '4px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 10, fontSize: 12,
            background: '#16213a', color: '#7a8aa8',
            border: '0.5px solid #1f2b42', borderRadius: 8, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} style={{
            flex: 1, padding: 10, fontSize: 12, fontWeight: 500,
            background: '#c9962f', color: '#0d1526',
            border: 'none', borderRadius: 8,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
          }}>
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function StaffCheckInWidget() {
  const [data,        setData]        = useState<RawApiResponse | null>(null)
  const [disputeSlot, setDisputeSlot] = useState<RawSlot | null>(null)
  const [checkingIn,  setCheckingIn]  = useState(false)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/check-ins/my')
      if (!res.ok) return
      const raw = await res.json() as RawApiResponse
      if (!raw.tracked) { setData(null); return }
      setData(raw)
    } catch {
      // silent — widget stays hidden
    }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  async function handleManualCheckIn() {
    setCheckingIn(true)
    try {
      await fetch('/api/admin/check-ins/manual', { method: 'POST' })
      await load()
    } finally {
      setCheckingIn(false)
    }
  }

  if (!data) return null

  const { currentSlot, todaySlots, weekSummary, currencySymbol = '₦', workStart = 8, workEnd = 18 } = data
  const needsCheckIn = !!currentSlot && currentSlot.open && currentSlot.status !== 'CHECKED_IN'

  return (
    <>
      <div style={{
        background: '#0d1526',
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        position: 'relative',
        marginBottom: 24,
      }}>
        <div style={{ padding: '16px 20px 0' }}>
          <p style={{
            margin: '0 0 4px', fontSize: 11, color: '#7a8aa8',
            textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            My check-ins
          </p>
        </div>

        <div style={{ padding: '12px 20px 20px' }}>

          {/* ── Current slot — prominent CHECK-IN REQUIRED / CHECKED IN state ── */}
          <div style={{
            background: needsCheckIn ? '#2a1608' : '#16213a',
            border: needsCheckIn ? '1px solid #c9962f' : 'none',
            borderRadius: 12,
            padding: 18, marginBottom: 16,
          }}>
            {!currentSlot ? (
              <>
                <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>Work hours</span>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7a8aa8' }}>
                  Work hours are {fmt12(workStart)} – {fmt12(workEnd)}
                </p>
              </>
            ) : needsCheckIn ? (
              <>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: '#f0b040', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Check-in required
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 16, color: '#ffffff', fontWeight: 600 }}>
                  {fmt12(currentSlot.lagosHour)} check-in
                </p>
                <button
                  onClick={handleManualCheckIn}
                  disabled={checkingIn}
                  style={{
                    width: '100%', padding: 12,
                    fontSize: 14, fontWeight: 600,
                    background: '#c9962f', color: '#0d1526',
                    border: 'none', borderRadius: 8,
                    cursor: checkingIn ? 'not-allowed' : 'pointer',
                    opacity: checkingIn ? 0.6 : 1,
                  }}
                >
                  {checkingIn ? 'Checking in…' : 'Check In Now'}
                </button>
                {currentSlot.minutesRemaining <= 15 && (
                  <p style={{ margin: '10px 0 0', fontSize: 11, color: '#f0b040' }}>
                    {currentSlot.minutesRemaining} min left in this window
                  </p>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>{fmt12(currentSlot.lagosHour)} slot</span>
                  {currentSlot.status === 'CHECKED_IN' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#16331f', color: '#4ade80', fontSize: 11, padding: '3px 10px', borderRadius: 6 }}>
                      Checked in
                    </span>
                  )}
                  {currentSlot.status === 'MISSED' && (
                    <span style={{ fontSize: 11, color: '#f87171', background: '#3d1a1a', padding: '3px 10px', borderRadius: 6 }}>
                      Missed
                    </span>
                  )}
                </div>
                {currentSlot.status === 'CHECKED_IN' && (
                  <p style={{ margin: '6px 0 0', fontSize: 20, color: '#4ade80', fontWeight: 700 }}>
                    CHECKED IN<br />
                    <span style={{ fontSize: 13, color: '#7a8aa8', fontWeight: 400 }}>{fmtClock(currentSlot.actualCheckInAt)}</span>
                  </p>
                )}
                {currentSlot.status === 'MISSED' && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#7a8aa8' }}>
                    No manual check-in was recorded during the required check-in window.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Today's timeline ──────────────────────────────────── */}
          <p style={{
            fontSize: 11, color: '#7a8aa8', margin: '0 0 8px',
            textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            Today
          </p>
          <div style={{
            background: '#16213a', borderRadius: 12,
            padding: '4px 16px', marginBottom: 16,
          }}>
            {todaySlots.length === 0 ? (
              <p style={{ fontSize: 11, color: '#7a8aa8', padding: '12px 0', margin: 0 }}>
                Today&apos;s history will appear here after the first check-in window opens.
              </p>
            ) : (
              todaySlots.map((slot, i) => (
                <div
                  key={slot.windowStart}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 0',
                    borderBottom: i < todaySlots.length - 1 ? '0.5px solid #1f2b42' : 'none',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: STATUS_COLOR[slot.status], flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: '#ffffff', flex: 1 }}>
                    {fmt12(slot.lagosHour)}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: slot.status === 'MISSED' ? '#d99999' : '#7a8aa8',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {slot.status === 'CHECKED_IN' && slot.actualCheckInAt
                      ? `Checked in ${fmtClock(slot.actualCheckInAt)}`
                      : slot.waived ? 'Missed — waived' : STATUS_LABEL[slot.status]}
                    {slot.status === 'MISSED' && !slot.disputeStatus && (
                      <button
                        onClick={() => setDisputeSlot(slot)}
                        style={{
                          color: '#f0b040', textDecoration: 'underline',
                          background: 'none', border: 'none',
                          fontSize: 11, cursor: 'pointer', padding: 0,
                        }}
                      >
                        Report
                      </button>
                    )}
                    {slot.disputeStatus === 'pending' && (
                      <span style={{ color: '#f0b040' }}>Disputed</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* ── Weekly summary ────────────────────────────────────── */}
          <p style={{
            fontSize: 11, color: '#7a8aa8', margin: '0 0 8px',
            textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            This week
          </p>
          <div style={{
            background: '#16213a', borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#7a8aa8' }}>Required</span>
              <span style={{ fontSize: 12, color: '#ffffff' }}>{weekSummary.required}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#7a8aa8' }}>Completed</span>
              <span style={{ fontSize: 12, color: '#ffffff' }}>{weekSummary.completed}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#7a8aa8' }}>Missed</span>
              <span style={{ fontSize: 12, color: '#ffffff' }}>{weekSummary.missed}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#7a8aa8' }}>Deductions</span>
              <span style={{ fontSize: 12, color: '#ffffff' }}>
                {Object.keys(weekSummary.deductionsByCurrency).length > 0
                  ? fmtDeductions(weekSummary.deductionsByCurrency)
                  : `${currencySymbol}0`}
              </span>
            </div>
          </div>

        </div>
      </div>

      {disputeSlot && (
        <DisputeModal
          slot={disputeSlot}
          onClose={() => setDisputeSlot(null)}
          onDone={load}
        />
      )}
    </>
  )
}
