'use client'

/**
 * Walz Team Hub V1 — incoming/active call overlay.
 *
 * Self-contained: reads all its state from useTeamCallDeviceContext(), so a
 * UI-building agent can drop `<IncomingCallOverlay />` anywhere inside a
 * `<TeamCallDeviceProvider>` subtree (mount the provider once near the Team
 * Hub layout root) and it renders itself only when there's something to
 * show — otherwise it renders nothing.
 */

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react'
import { useTeamCallDeviceContext } from './useTeamCallDevice'

function fmt(secs: number): string {
  return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`
}

/** "client:staff-<id>" or "staff-<id>" → bare Staff.id. */
function staffIdFromIdentity(identity: string): string {
  return identity.replace(/^client:/, '').replace(/^staff-/, '')
}

/** Resolves a Staff.id to a display name via the directory's exact-id lookup mode. Falls back to the raw id if the lookup fails (never blocks showing the incoming-call screen). */
function useStaffName(staffId: string | null): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    setName(null)
    if (!staffId) return
    let cancelled = false
    fetch(`/api/admin/team/directory?id=${encodeURIComponent(staffId)}`)
      .then(res => res.json())
      .then((data: { results?: Array<{ id: string; name: string }> }) => {
        if (cancelled) return
        setName(data.results?.[0]?.name ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [staffId])
  return name
}

export function IncomingCallOverlay() {
  const { status, incomingCall, activeCall, muted, answer, decline, hangUp, toggleMute } = useTeamCallDeviceContext()
  const [elapsed, setElapsed] = useState(0)
  const declineRef = useRef<HTMLButtonElement>(null)

  const callerId = incomingCall ? staffIdFromIdentity(incomingCall.fromIdentity) : null
  const callerName = useStaffName(status === 'RINGING' ? callerId : null)

  useEffect(() => {
    if (status !== 'ANSWERED') {
      setElapsed(0)
      return
    }
    const id = setInterval(() => setElapsed(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  // Accessibility (QA finding): move focus into the ringing dialog and
  // handle Escape as Decline — this overlay interrupts the user and must
  // be reachable/dismissable without a mouse.
  useEffect(() => {
    if (status !== 'RINGING') return
    declineRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') decline() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [status, decline])

  if (status === 'RINGING' && incomingCall) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Incoming Team Hub call"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div className="w-80 rounded-2xl bg-[#0d1e35] ring-1 ring-white/10 shadow-2xl p-6 text-center space-y-5">
          <p className="text-[10px] uppercase tracking-widest text-white/40">Incoming Team Hub Call</p>
          <p className="text-lg font-semibold text-white truncate">{callerName ?? callerId} is calling…</p>
          <div className="flex gap-3 pt-1">
            <button
              ref={declineRef}
              onClick={decline}
              aria-label="Decline call"
              className="flex-1 min-h-[44px] bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-400/70"
            >
              <PhoneOff className="w-4 h-4" /> Decline
            </button>
            <button
              onClick={answer}
              aria-label="Answer call"
              className="flex-1 min-h-[44px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
            >
              <Phone className="w-4 h-4" /> Answer
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'ANSWERED' && activeCall) {
    const isGroup = activeCall.type === 'GROUP'
    // "Leave Call" for a group conference (ending YOUR OWN participation
    // only — the call continues for everyone else until the last
    // participant leaves, per lib/team/calls.ts's leaveGroupCall) vs.
    // "End Call" for a 1:1 DM (there's only ever two parties, so ending
    // your side ends the call for both). Same hangUp() handler either way
    // — useTeamCallDevice.ts's endLocalCall already branches server-side
    // behavior on activeCall.type; this is purely a label difference.
    return (
      <div
        role="region"
        aria-label={`Active Team Hub ${isGroup ? 'group ' : ''}call, ${fmt(elapsed)} elapsed`}
        className="fixed bottom-6 right-6 z-[100] w-72 rounded-2xl bg-[#0d1e35] ring-1 ring-white/10 shadow-2xl p-4 space-y-4"
      >
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{isGroup ? 'Team Hub Group Call' : 'Team Hub Call'}</p>
          <p className="text-base font-semibold text-white font-mono tabular-nums">{fmt(elapsed)}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            className={`flex-1 min-h-[44px] rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 ${
              muted ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={hangUp}
            aria-label={isGroup ? 'Leave call' : 'End call'}
            className="flex-1 min-h-[44px] bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-400/70"
          >
            <PhoneOff className="w-4 h-4" /> {isGroup ? 'Leave Call' : 'End Call'}
          </button>
        </div>
      </div>
    )
  }

  return null
}
