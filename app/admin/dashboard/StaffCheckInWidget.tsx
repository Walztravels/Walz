'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types (match the definitive reference interface exactly) ──────────────────

type SlotStatus = 'admin_panel' | 'call_presence' | 'manual' | 'missed' | 'pending'

interface CheckInSlot {
  id:          string | null
  hour:        string
  windowStart: string
  status:      SlotStatus
  disputed:    boolean
}

interface CheckInData {
  currentSlotLabel:        string
  currentSlotStatus:       'checked_in' | 'pending' | 'outside_hours'
  currentSlotDetail:       string
  todaySlots:              CheckInSlot[]
  weekMissed:              number
  weekDeductions:          number
  currencySymbol:          string
  minutesLeftInSlot:       number | null
  showManualCheckInButton: boolean
}

const STATUS_COLOR: Record<SlotStatus, string> = {
  admin_panel:   '#4ade80',
  call_presence: '#60a5fa',
  manual:        '#f0b040',
  missed:        '#f87171',
  pending:       '#3a4a68',
}

const STATUS_LABEL: Record<SlotStatus, string> = {
  admin_panel:   'Admin panel',
  call_presence: 'On a call',
  manual:        'Manual check-in',
  missed:        'Missed',
  pending:       'Pending',
}

// ── Raw API shapes ────────────────────────────────────────────────────────────

interface RawSlot {
  id:             string | null
  windowStart:    string
  lagosHour:      number
  present:        boolean
  autoDetected:   boolean
  manualCheckin:  boolean
  flagged:        boolean
  waived:         boolean
  dispute:        string | null
  disputeStatus:  string | null
  activitySource: 'call' | 'admin' | 'manual' | null
}

interface RawCurrentSlot extends RawSlot {
  windowEnd:            string
  minutesRemaining:     number
  hasActivityThisSlot:  boolean
}

interface RawApiResponse {
  tracked:        boolean
  name?:          string
  workStart?:     number
  workEnd?:       number
  currentSlot:    RawCurrentSlot | null
  todaySlots:     RawSlot[]
  weekSummary:    { missed: number; waived: number; totalDeductions: number }
  currencySymbol?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt12(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:00 ${suffix}`
}

function toSlotStatus(s: RawSlot): SlotStatus {
  if (s.present) {
    if (s.activitySource === 'call')   return 'call_presence'
    if (s.activitySource === 'manual') return 'manual'
    return 'admin_panel'
  }
  if (s.flagged && !s.waived) return 'missed'
  return 'pending'
}

function buildCheckInData(raw: RawApiResponse): CheckInData {
  const { currentSlot, todaySlots, weekSummary, currencySymbol = '₦', workStart = 8, workEnd = 18 } = raw

  const mappedSlots: CheckInSlot[] = todaySlots.map(s => ({
    id:          s.id,
    hour:        fmt12(s.lagosHour),
    windowStart: s.windowStart,
    status:      toSlotStatus(s),
    disputed:    s.disputeStatus !== null && s.disputeStatus !== undefined,
  }))

  let currentSlotLabel:        string                              = 'Work hours'
  let currentSlotStatus:       CheckInData['currentSlotStatus']   = 'outside_hours'
  let currentSlotDetail:       string                              = `Work hours are ${fmt12(workStart)} – ${fmt12(workEnd)}`
  let minutesLeftInSlot:       number | null                       = null
  let showManualCheckInButton: boolean                             = false

  if (currentSlot) {
    currentSlotLabel = `${fmt12(currentSlot.lagosHour)} slot`
    const isPresent  = currentSlot.present || currentSlot.hasActivityThisSlot

    if (isPresent) {
      currentSlotStatus = 'checked_in'
      if      (currentSlot.activitySource === 'call')   currentSlotDetail = 'Detected via call presence'
      else if (currentSlot.activitySource === 'manual') currentSlotDetail = 'Manual check-in recorded'
      else                                               currentSlotDetail = 'Detected via admin panel activity'
    } else {
      currentSlotStatus = 'pending'
      currentSlotDetail = 'No activity detected yet for this slot'
      if (currentSlot.minutesRemaining <= 15) {
        minutesLeftInSlot = currentSlot.minutesRemaining
      } else {
        showManualCheckInButton = true
      }
    }
  }

  return {
    currentSlotLabel,
    currentSlotStatus,
    currentSlotDetail,
    todaySlots:              mappedSlots,
    weekMissed:              weekSummary.missed,
    weekDeductions:          weekSummary.totalDeductions,
    currencySymbol,
    minutesLeftInSlot,
    showManualCheckInButton,
  }
}

// ── Dispute modal ─────────────────────────────────────────────────────────────

function DisputeModal({ slot, onClose, onDone }: {
  slot:    CheckInSlot
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
          Report issue — {slot.hour}
        </p>
        <p style={{ margin: '0 0 12px', color: '#7a8aa8', fontSize: 12 }}>
          Describe why this slot should not count as a miss. An admin will review it.
        </p>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setErr('') }}
          placeholder="e.g. I was on a client call outside the system"
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
  const [data,        setData]        = useState<CheckInData | null>(null)
  const [disputeSlot, setDisputeSlot] = useState<CheckInSlot | null>(null)
  const [checkingIn,  setCheckingIn]  = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/check-ins/my')
      if (!res.ok) return
      const raw = await res.json() as RawApiResponse
      if (!raw.tracked) { setData(null); return }
      setData(buildCheckInData(raw))
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

  // Renders null for untracked staff — never fetches again once null is confirmed
  if (!data) return null

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

          {/* ── Current slot ──────────────────────────────────────── */}
          <div style={{
            background: '#16213a', borderRadius: 12,
            padding: 18, marginBottom: 16,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 4,
            }}>
              <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>
                {data.currentSlotLabel}
              </span>

              {data.currentSlotStatus === 'checked_in' && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#16331f', color: '#4ade80',
                  fontSize: 11, padding: '3px 10px', borderRadius: 6,
                }}>
                  Checked in
                </span>
              )}
              {data.currentSlotStatus === 'outside_hours' && (
                <span style={{ fontSize: 11, color: '#7a8aa8' }}>
                  Outside work hours
                </span>
              )}
              {data.currentSlotStatus === 'pending' && (
                <span style={{
                  fontSize: 11, color: '#f0b040',
                  background: '#4a2b0a', padding: '3px 10px', borderRadius: 6,
                }}>
                  Awaiting activity
                </span>
              )}
            </div>

            <p style={{ margin: 0, fontSize: 11, color: '#7a8aa8' }}>
              {data.currentSlotDetail}
            </p>

            {data.showManualCheckInButton && (
              <button
                onClick={handleManualCheckIn}
                disabled={checkingIn}
                style={{
                  marginTop: 12, width: '100%', padding: 10,
                  fontSize: 13, fontWeight: 500,
                  background: '#c9962f', color: '#0d1526',
                  border: 'none', borderRadius: 8,
                  cursor: checkingIn ? 'not-allowed' : 'pointer',
                  opacity: checkingIn ? 0.6 : 1,
                }}
              >
                {checkingIn ? 'Checking in…' : 'Check in now'}
              </button>
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
            {data.todaySlots.length === 0 ? (
              <p style={{ fontSize: 11, color: '#7a8aa8', padding: '12px 0', margin: 0 }}>
                Today&apos;s history will appear here after the first work-hour slot is processed.
              </p>
            ) : (
              data.todaySlots.map((slot, i) => (
                <div
                  key={slot.windowStart}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 0',
                    borderBottom: i < data.todaySlots.length - 1 ? '0.5px solid #1f2b42' : 'none',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: STATUS_COLOR[slot.status], flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: '#ffffff', flex: 1 }}>
                    {slot.hour}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: slot.status === 'missed' ? '#d99999' : '#7a8aa8',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {STATUS_LABEL[slot.status]}
                    {slot.status === 'missed' && !slot.disputed && (
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
                    {slot.disputed && (
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
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 6,
            }}>
              <span style={{ fontSize: 12, color: '#7a8aa8' }}>Check-ins missed</span>
              <span style={{ fontSize: 12, color: '#ffffff' }}>{data.weekMissed}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#7a8aa8' }}>Deductions</span>
              <span style={{ fontSize: 12, color: '#ffffff' }}>
                {data.currencySymbol}{data.weekDeductions.toLocaleString()}
              </span>
            </div>
          </div>

        </div>

        {/* ── Urgent prompt (≤ 15 min, no activity) ────────────────── */}
        {data.minutesLeftInSlot !== null && (
          <div style={{
            margin: '0 16px 16px',
            background: '#4a2b0a', border: '0.5px solid #6b4515',
            borderRadius: 10, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 12, color: '#f0b040', flex: 1 }}>
              {data.minutesLeftInSlot} min left in this slot — no activity yet
            </span>
            <button
              onClick={handleManualCheckIn}
              disabled={checkingIn}
              style={{
                fontSize: 12, padding: '6px 12px',
                background: '#c9962f', color: '#0d1526',
                border: 'none', borderRadius: 6,
                fontWeight: 500, flexShrink: 0,
                cursor: checkingIn ? 'not-allowed' : 'pointer',
                opacity: checkingIn ? 0.6 : 1,
              }}
            >
              {checkingIn ? '…' : 'Check in'}
            </button>
          </div>
        )}
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
