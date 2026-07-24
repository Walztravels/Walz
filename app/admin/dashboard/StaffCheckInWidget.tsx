'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckSquare, Clock, ChevronDown, ChevronUp, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SlotInfo {
  id: string | null
  windowStart: string
  lagosHour: number
  present: boolean
  autoDetected: boolean
  manualCheckin: boolean
  flagged: boolean
  waived: boolean
  dispute: string | null
  disputeStatus: string | null
  activitySource: 'call' | 'admin' | 'manual' | null
}

interface CurrentSlot extends SlotInfo {
  windowEnd: string
  minutesRemaining: number
  hasActivityThisSlot: boolean
}

interface MyData {
  tracked: boolean
  name?: string
  workStart?: number
  workEnd?: number
  currentSlot: CurrentSlot | null
  todaySlots: SlotInfo[]
  weekSummary: { missed: number; waived: number; totalDeductions: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt12(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:00 ${suffix}`
}

function fmtNaira(n: number) {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`
}

// ── Dispute modal ─────────────────────────────────────────────────────────────
function DisputeModal({ recordId, slotHour, onClose, onDone }: {
  recordId: string; slotHour: number; onClose: () => void; onDone: () => void
}) {
  const [note, setNote]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [err,  setErr]        = useState('')

  async function submit() {
    if (!note.trim()) { setErr('Please describe the issue.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/check-ins/${recordId}`, {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1e35] rounded-2xl ring-1 ring-white/10 p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Report Issue — {fmt12(slotHour)}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-white/50 mb-3">
          Describe why this slot should not count as a miss. An admin will review it.
        </p>
        <textarea
          className="w-full bg-white/5 rounded-xl ring-1 ring-white/10 text-white text-sm px-3 py-2.5 resize-none focus:outline-none focus:ring-amber-400/40 placeholder-white/20"
          rows={4}
          placeholder="e.g. I was on a client call outside the system"
          value={note}
          onChange={e => { setNote(e.target.value); setErr('') }}
        />
        {err && <p className="text-red-400 text-xs mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-white/50 ring-1 ring-white/10 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-[#0a1628] hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Urgent check-in prompt (floating overlay) ─────────────────────────────────
function UrgentPrompt({ slot, onCheckedIn }: {
  slot: CurrentSlot; onCheckedIn: () => void
}) {
  const [busy,      setBusy]      = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [mins,      setMins]      = useState(slot.minutesRemaining)

  // live countdown
  useEffect(() => {
    const id = setInterval(() => {
      const now     = new Date()
      const end     = new Date(slot.windowEnd)
      const diffMs  = end.getTime() - now.getTime()
      setMins(Math.max(0, Math.ceil(diffMs / 60000)))
    }, 30000)
    return () => clearInterval(id)
  }, [slot.windowEnd])

  if (dismissed) return null

  async function checkIn() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/check-ins/manual', { method: 'POST' })
      if (res.ok) { onCheckedIn(); setDismissed(true) }
    } finally {
      setBusy(false)
    }
  }

  const isUrgent = mins <= 5

  return (
    <div className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl shadow-2xl ring-1 transition-all
      ${isUrgent
        ? 'bg-[#2d1208] ring-red-500/30'
        : 'bg-[#0d1e35] ring-amber-400/20'
      }`}>
      <div className="p-5">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-white/30 hover:text-white/70 transition-colors"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
            ${isUrgent ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
            <Clock size={16} className={isUrgent ? 'text-red-400' : 'text-amber-400'} />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">
              No activity detected for the {fmt12(slot.lagosHour)} slot
            </p>
            <p className={`text-xs font-medium mt-0.5 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}>
              Check in within {mins} minute{mins !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <button
          onClick={checkIn}
          disabled={busy}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-60
            ${isUrgent
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-amber-500 text-[#0a1628] hover:bg-amber-400'
            }`}
        >
          {busy ? 'Checking in…' : 'Check in now'}
        </button>

        <p className="text-white/30 text-xs text-center mt-3 leading-relaxed">
          Being active on a call or in the admin panel checks you in automatically.
          This appears only when neither has been detected.
        </p>
      </div>
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────
export function StaffCheckInWidget() {
  const [data,        setData]        = useState<MyData | null>(null)
  const [expanded,    setExpanded]    = useState(true)
  const [checkingIn,  setCheckingIn]  = useState(false)
  const [disputeSlot, setDisputeSlot] = useState<SlotInfo | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/check-ins/my')
      if (!res.ok) return
      const json = await res.json() as MyData
      setData(json)
    } catch {
      // silently ignore — widget just won't show
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
      const res = await fetch('/api/admin/check-ins/manual', { method: 'POST' })
      if (res.ok) await load()
    } finally {
      setCheckingIn(false)
    }
  }

  if (!data || !data.tracked) return null

  const { currentSlot, todaySlots, weekSummary } = data

  // Show urgent prompt when < 15 min left, not checked in, no auto-detection
  const showUrgentPrompt = !!(
    currentSlot &&
    !currentSlot.present &&
    !currentSlot.hasActivityThisSlot &&
    currentSlot.minutesRemaining <= 15
  )

  // Current slot label/colour
  function currentSlotBadge() {
    if (!currentSlot) return null
    if (currentSlot.present || currentSlot.hasActivityThisSlot) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
          <CheckSquare size={12} />
          Checked in for the {fmt12(currentSlot.lagosHour)} slot
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs font-medium">
        <Clock size={12} />
        {currentSlot.minutesRemaining} min left in {fmt12(currentSlot.lagosHour)} slot
      </span>
    )
  }

  // Next slot time
  function nextSlotLabel() {
    if (!currentSlot) return null
    const nextHour = currentSlot.lagosHour + 1
    if (!data?.workEnd || nextHour >= data.workEnd) return null
    return `Next check-in due by ${fmt12(nextHour)}`
  }

  return (
    <>
      {/* Urgent floating prompt */}
      {showUrgentPrompt && currentSlot && (
        <UrgentPrompt slot={currentSlot} onCheckedIn={load} />
      )}

      {/* Dispute modal */}
      {disputeSlot?.id && (
        <DisputeModal
          recordId={disputeSlot.id}
          slotHour={disputeSlot.lagosHour}
          onClose={() => setDisputeSlot(null)}
          onDone={load}
        />
      )}

      {/* Main card */}
      <div className="mb-6 bg-[#112240] rounded-2xl ring-1 ring-white/5">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <CheckSquare size={14} className="text-amber-400" />
            </div>
            <span className="font-semibold text-white text-sm">My Check-Ins</span>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {expanded && (
          <div className="p-5 space-y-5">

            {/* Current status */}
            {currentSlot ? (
              <div className="bg-white/3 rounded-xl p-4 space-y-2">
                {currentSlotBadge()}
                {nextSlotLabel() && (
                  <p className="text-xs text-white/40 pt-0.5">{nextSlotLabel()}</p>
                )}

                {/* Manual check-in button — only when no auto-detection */}
                {!currentSlot.present && !currentSlot.hasActivityThisSlot && (
                  <button
                    onClick={handleManualCheckIn}
                    disabled={checkingIn}
                    className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-[#0a1628] hover:bg-amber-400 disabled:opacity-60 transition-all active:scale-95"
                  >
                    {checkingIn ? 'Checking in…' : 'Check in now'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/40 text-center py-2">Outside work hours</p>
            )}

            {/* Today's timeline */}
            <div>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">Today</p>
              {todaySlots.length === 0 ? (
                <p className="text-xs text-white/30 py-2">
                  Today&apos;s check-in history will appear here once the system processes your first working day.
                </p>
              ) : (
                <div className="space-y-1">
                  {todaySlots.map((slot) => {
                    const isPresent  = slot.present
                    const isMissed   = slot.flagged && !slot.waived
                    const isWaived   = slot.waived
                    const isDisputed = slot.disputeStatus === 'pending'

                    let dotColor  = 'bg-white/10'
                    let timeColor = 'text-white/50'
                    let statusLabel: React.ReactNode = <span className="ml-auto text-xs text-white/20">Pending</span>

                    if (isPresent) {
                      const src = slot.activitySource
                      dotColor     = src === 'call' ? 'bg-blue-400' : src === 'manual' ? 'bg-amber-400' : 'bg-emerald-400'
                      timeColor    = 'text-white'
                      statusLabel  = (
                        <span className={`ml-auto text-xs font-medium ${src === 'call' ? 'text-blue-400' : src === 'manual' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {src === 'call' ? 'On call' : src === 'manual' ? 'Manual' : 'Admin panel'}
                        </span>
                      )
                    } else if (isWaived) {
                      dotColor     = 'bg-blue-400'
                      timeColor    = 'text-white/70'
                      statusLabel  = <span className="ml-auto text-xs font-medium text-blue-400">Waived</span>
                    } else if (isDisputed) {
                      dotColor     = 'bg-amber-400'
                      timeColor    = 'text-white/70'
                      statusLabel  = <span className="ml-auto text-xs font-medium text-amber-400">Under review</span>
                    } else if (isMissed) {
                      dotColor     = 'bg-red-400'
                      timeColor    = 'text-white/70'
                      statusLabel  = (
                        <button
                          onClick={() => setDisputeSlot(slot)}
                          className="ml-auto text-xs font-medium text-red-400 hover:text-amber-400 underline underline-offset-2 transition-colors"
                        >
                          Missed — report
                        </button>
                      )
                    }

                    return (
                      <div key={slot.windowStart} className="flex items-center gap-3 py-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                        <span className={`text-sm font-medium w-24 flex-shrink-0 ${timeColor}`}>
                          {fmt12(slot.lagosHour)}
                        </span>
                        {statusLabel}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* This week */}
            <div>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">This Week</p>
              <div className="bg-white/3 rounded-xl divide-y divide-white/5">
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-sm text-white/60">Check-ins missed</span>
                  <span className={`text-sm font-semibold ${weekSummary.missed > 0 ? 'text-red-400' : 'text-white'}`}>
                    {weekSummary.missed}
                  </span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-sm text-white/60">Deductions</span>
                  <span className={`text-sm font-semibold ${weekSummary.totalDeductions > 0 ? 'text-red-400' : 'text-white'}`}>
                    {fmtNaira(weekSummary.totalDeductions)}
                  </span>
                </div>
              </div>
            </div>


          </div>
        )}
      </div>
    </>
  )
}
