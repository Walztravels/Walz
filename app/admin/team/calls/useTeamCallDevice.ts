'use client'

/**
 * Walz Team Hub V1 — calling client device (1:1 DM + GROUP/CHANNEL
 * conference, sharing ONE registered Twilio Device per browser tab, since
 * a real phone line can only be on one call at a time — the same
 * constraint applies here by construction, not by choice).
 *
 * Mirrors components/admin/TwilioPhonePanel.tsx's @twilio/voice-sdk Device
 * event-handling shape (device.on('incoming', ...), call.accept()/reject(),
 * mute, token refresh 5 min before expiry) but is an entirely separate,
 * isolated implementation — it does not import from or modify
 * TwilioPhonePanel.tsx, and it talks to the brand-new /api/team/twilio/*
 * routes, never the client-calling /api/twilio/* routes.
 *
 * A GROUP/CHANNEL call never rings this Device the way a DM call does —
 * there is no server-initiated inbound leg for a group call in this
 * design (see app/api/team/twilio/voice/route.ts: a group call is only
 * ever an OUTBOUND device.connect() the joining staff member places
 * themselves, into a <Conference>, after their own explicit "Start Call"/
 * "Join Call" tap). `device.on('incoming', ...)` therefore remains
 * exclusively a DM concept.
 *
 * Exports:
 *   - `useTeamCallDevice()` — the raw hook. ONE Device must be registered
 *     per browser tab, so most consumers should NOT call this directly.
 *   - `TeamCallDeviceProvider` — wraps a subtree, calling the raw hook
 *     exactly once, and exposes its state via context.
 *   - `useTeamCallDeviceContext()` — the hook IncomingCallOverlay and
 *     TeamCallButton actually use. A UI-building agent should mount
 *     `<TeamCallDeviceProvider>` once near the Team Hub layout root (it
 *     renders its children as-is — no visual chrome of its own) so both
 *     `<IncomingCallOverlay />` and any number of `<TeamCallButton />`/
 *     group-call UI instances share the same registered Device/identity.
 */

import {
  createContext, createElement, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'
import type { Call, Device } from '@twilio/voice-sdk'

export type TeamCallStatus = 'LOADING' | 'READY' | 'INITIATING' | 'RINGING' | 'ANSWERED' | 'ERROR'
export type TerminalCallStatus = 'ANSWERED' | 'DECLINED' | 'BUSY' | 'MISSED' | 'ENDED' | 'FAILED'

export interface IncomingCallInfo {
  callSid: string
  /** Raw Twilio From identity, e.g. "client:staff-<callerId>" */
  fromIdentity: string
}

export interface ActiveCallMeta {
  type: 'DM' | 'GROUP' | null
  conversationId: string | null
  calleeStaffId: string | null
  callRecordId: string | null
}

export interface UseTeamCallDeviceResult {
  status: TeamCallStatus
  incomingCall: IncomingCallInfo | null
  activeCall: ActiveCallMeta | null
  muted: boolean
  errorMessage: string | null
  placeCall: (conversationId: string, calleeStaffId: string) => Promise<void>
  /** Start (or join, if one is already active — see startOrJoinGroupCall) a GROUP/CHANNEL conference call. */
  startOrJoinGroupCall: (conversationId: string) => Promise<void>
  /** Join an ALREADY-KNOWN active group call by its callRecordId (e.g. from the "X started a call — Join" banner, where /calls has already told the UI which call is active). */
  joinGroupCall: (conversationId: string, callRecordId: string) => Promise<void>
  answer: () => void
  decline: () => void
  hangUp: () => void
  toggleMute: () => void
}

const EMPTY_META: ActiveCallMeta = { type: null, conversationId: null, calleeStaffId: null, callRecordId: null }

/** DM only — the PATCH .../calls/[callId] status route. */
async function patchCallStatus(
  conversationId: string | null,
  callRecordId: string | null,
  status: TerminalCallStatus,
): Promise<void> {
  if (!conversationId || !callRecordId) return
  try {
    await fetch(`/api/admin/team/conversations/${conversationId}/calls/${callRecordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  } catch {
    // Best-effort status sync — never blocks the call UI on a network hiccup.
  }
}

/** GROUP/CHANNEL only — ends THIS staff member's own participation (never the whole call). */
async function leaveGroupCallOnServer(conversationId: string | null, callRecordId: string | null): Promise<void> {
  if (!conversationId || !callRecordId) return
  try {
    await fetch(`/api/admin/team/conversations/${conversationId}/calls/${callRecordId}/leave`, { method: 'POST' })
  } catch {
    // Best-effort — never blocks the call UI on a network hiccup.
  }
}

export function useTeamCallDevice(): UseTeamCallDeviceResult {
  const [status, setStatus]             = useState<TeamCallStatus>('LOADING')
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null)
  const [activeCall, setActiveCall]     = useState<ActiveCallMeta | null>(null)
  const [muted, setMuted]               = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const deviceRef  = useRef<Device | null>(null)
  const callRef    = useRef<Call | null>(null)
  const metaRef    = useRef<ActiveCallMeta>(EMPTY_META)
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLocalCallState = useCallback(() => {
    callRef.current = null
    metaRef.current = EMPTY_META
    setActiveCall(null)
    setIncomingCall(null)
    setMuted(false)
  }, [])

  /**
   * Called from a Call SDK terminal event — syncs the server-side status
   * (DM: PATCH a terminal status; GROUP: POST .../leave, ending only this
   * participant's own membership, never the whole call — the server
   * transitions the call itself to ENDED only once the LAST participant
   * leaves, per lib/team/calls.ts's leaveGroupCall), then resets UI to READY.
   */
  const endLocalCall = useCallback((finalStatus: TerminalCallStatus) => {
    const { type, conversationId, callRecordId } = metaRef.current
    if (type === 'GROUP') {
      void leaveGroupCallOnServer(conversationId, callRecordId)
    } else {
      void patchCallStatus(conversationId, callRecordId, finalStatus)
    }
    clearLocalCallState()
    setStatus('READY')
  }, [clearLocalCallState])

  const answer = useCallback(() => {
    if (!callRef.current) return
    callRef.current.accept()
    setIncomingCall(null)
    setStatus('ANSWERED')
    void patchCallStatus(metaRef.current.conversationId, metaRef.current.callRecordId, 'ANSWERED')
  }, [])

  const decline = useCallback(() => {
    if (!callRef.current) return
    callRef.current.reject()
    void patchCallStatus(metaRef.current.conversationId, metaRef.current.callRecordId, 'DECLINED')
    clearLocalCallState()
    setStatus('READY')
  }, [clearLocalCallState])

  const hangUp = useCallback(() => {
    // The call's own 'disconnect' handler (wired below, for both outgoing
    // and incoming calls) calls endLocalCall('ENDED') — mirrors
    // TwilioPhonePanel's hangUp/resetCall shape.
    callRef.current?.disconnect()
  }, [])

  const toggleMute = useCallback(() => {
    if (!callRef.current) return
    const next = !muted
    callRef.current.mute(next)
    setMuted(next)
  }, [muted])

  const placeCall = useCallback(async (conversationId: string, calleeStaffId: string) => {
    const device = deviceRef.current
    if (!device) {
      setErrorMessage('Calling is not ready yet.')
      return
    }
    setErrorMessage(null)
    setStatus('INITIATING')
    try {
      const res = await fetch(`/api/admin/team/conversations/${conversationId}/calls`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(body.error ?? 'Could not start the call.')
      }
      const { callRecordId, calleeId } = await res.json() as { callRecordId: string; calleeId?: string }
      // Prefer the server-resolved callee (it independently derived the DM's
      // other participant) but fall back to the caller-supplied id for the
      // dial param if the response ever omits it.
      const resolvedCalleeId = calleeId ?? calleeStaffId

      metaRef.current = { type: 'DM', conversationId, calleeStaffId: resolvedCalleeId, callRecordId }
      setActiveCall(metaRef.current)

      const call = await device.connect({
        params: {
          CalleeStaffId: resolvedCalleeId,
          ConversationId: conversationId,
          CallRecordId: callRecordId,
        },
      })
      callRef.current = call
      setStatus('RINGING')

      call.on('accept', () => {
        setStatus('ANSWERED')
        void patchCallStatus(conversationId, callRecordId, 'ANSWERED')
      })
      call.on('disconnect', () => endLocalCall('ENDED'))
      call.on('cancel',     () => endLocalCall('MISSED'))
      call.on('reject',     () => endLocalCall('DECLINED'))
      call.on('error',      () => endLocalCall('FAILED'))
    } catch (e) {
      setErrorMessage((e as Error).message ?? 'Could not start the call.')
      setStatus('ERROR')
      clearLocalCallState()
    }
  }, [endLocalCall, clearLocalCallState])

  /** Shared by startOrJoinGroupCall and joinGroupCall — the actual Device.connect() into a <Conference>, once a valid callRecordId is known. */
  const connectToGroupCall = useCallback(async (conversationId: string, callRecordId: string) => {
    const device = deviceRef.current
    if (!device) {
      setErrorMessage('Calling is not ready yet.')
      return
    }
    setErrorMessage(null)
    setStatus('INITIATING')
    // Tracks whether the server-side join (participant row) succeeded, so
    // the catch block below knows whether it needs to roll that back.
    let joined = false
    try {
      // Re-verified server-side on every join, fresh — see the route's own
      // header comment. This call must succeed BEFORE we ever attempt to
      // connect the audio leg, since it's what actually records this
      // staff member as a participant (and the voice webhook independently
      // re-checks membership again regardless).
      const joinRes = await fetch(`/api/admin/team/conversations/${conversationId}/calls/${callRecordId}/join`, { method: 'POST' })
      if (!joinRes.ok) {
        const body = await joinRes.json().catch(() => ({} as { error?: string }))
        throw new Error(body.error ?? 'Could not join the call.')
      }
      joined = true

      metaRef.current = { type: 'GROUP', conversationId, calleeStaffId: null, callRecordId }
      setActiveCall(metaRef.current)

      const call = await device.connect({
        params: { ConversationId: conversationId, CallRecordId: callRecordId },
      })
      callRef.current = call
      // A conference join has no ring cadence — the leg connects immediately.
      setStatus('ANSWERED')

      call.on('disconnect', () => endLocalCall('ENDED'))
      call.on('cancel',     () => endLocalCall('FAILED'))
      call.on('error',      () => endLocalCall('FAILED'))
    } catch (e) {
      // QA finding (CONCERN, fixed): if the server-side join succeeded but
      // the audio leg then failed to connect, the participant row must be
      // rolled back — otherwise it's a phantom participant (leftAt stays
      // null forever), inflating participantCount for everyone else and
      // potentially preventing the call from ever reaching ENDED.
      if (joined) void leaveGroupCallOnServer(conversationId, callRecordId)
      setErrorMessage((e as Error).message ?? 'Could not join the call.')
      setStatus('ERROR')
      clearLocalCallState()
    }
  }, [endLocalCall, clearLocalCallState])

  const startOrJoinGroupCall = useCallback(async (conversationId: string) => {
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/admin/team/conversations/${conversationId}/calls`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(body.error ?? 'Could not start the call.')
      }
      const { callRecordId } = await res.json() as { callRecordId: string }
      await connectToGroupCall(conversationId, callRecordId)
    } catch (e) {
      setErrorMessage((e as Error).message ?? 'Could not start the call.')
      setStatus('ERROR')
    }
  }, [connectToGroupCall])

  const joinGroupCall = useCallback(async (conversationId: string, callRecordId: string) => {
    await connectToGroupCall(conversationId, callRecordId)
  }, [connectToGroupCall])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { Device: TwilioDevice } = await import('@twilio/voice-sdk')

        const res = await fetch('/api/team/twilio/token', { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(body.error ?? 'Team Hub calling is not available.')
        }
        const { token } = await res.json() as { token: string }
        if (cancelled) return

        const device = new TwilioDevice(token, { logLevel: 1 })
        deviceRef.current = device

        device.on('registered', () => setStatus('READY'))
        device.on('error', (err: Error) => { setErrorMessage(err.message); setStatus('ERROR') })

        device.on('incoming', (call: Call) => {
          callRef.current = call
          const fromIdentity = call.parameters?.From ?? 'Unknown'
          const callSid      = call.parameters?.CallSid ?? ''
          const callRecordId   = call.customParameters?.get('CallRecordId')   ?? null
          const conversationId = call.customParameters?.get('ConversationId') ?? null

          metaRef.current = { type: 'DM', conversationId, calleeStaffId: null, callRecordId }
          setActiveCall(metaRef.current)
          setIncomingCall({ callSid, fromIdentity })
          setStatus('RINGING')

          call.on('cancel',     () => endLocalCall('MISSED'))
          call.on('disconnect', () => endLocalCall('ENDED'))
        })

        device.register()

        // Refresh 5 min before the 1-hour token expires.
        refreshRef.current = setTimeout(async () => {
          try {
            const r = await fetch('/api/team/twilio/token', { method: 'POST' })
            if (r.ok) {
              const { token: t } = await r.json() as { token: string }
              device.updateToken(t)
            }
          } catch { /* ignore refresh errors */ }
        }, 55 * 60 * 1000)
      } catch (e) {
        if (!cancelled) {
          setErrorMessage((e as Error).message ?? 'Connection failed')
          setStatus('ERROR')
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      if (refreshRef.current) clearTimeout(refreshRef.current)
      deviceRef.current?.destroy()
    }
  }, [endLocalCall])

  // QA finding (CONCERN, fixed): a tab refresh/close mid-group-call
  // previously left a phantom TeamCallParticipant row (leftAt never
  // stamped) — the Device is destroyed by the effect cleanup above, but
  // nothing ever told the server this participant left. Best-effort only
  // (sendBeacon has no delivery guarantee, and there is intentionally no
  // "resume my call on reload" feature) — it meaningfully reduces, not
  // eliminates, the phantom-row window versus doing nothing at all.
  useEffect(() => {
    function leaveOnUnload() {
      const { type, conversationId, callRecordId } = metaRef.current
      if (type !== 'GROUP' || !conversationId || !callRecordId) return
      try {
        navigator.sendBeacon?.(`/api/admin/team/conversations/${conversationId}/calls/${callRecordId}/leave`, new Blob([], { type: 'text/plain' }))
      } catch { /* best-effort */ }
    }
    window.addEventListener('pagehide', leaveOnUnload)
    return () => window.removeEventListener('pagehide', leaveOnUnload)
  }, [])

  return {
    status, incomingCall, activeCall, muted, errorMessage,
    placeCall, startOrJoinGroupCall, joinGroupCall, answer, decline, hangUp, toggleMute,
  }
}

// ── Shared context — one Device per tab ──────────────────────────────────────

const TeamCallDeviceContext = createContext<UseTeamCallDeviceResult | null>(null)

export function TeamCallDeviceProvider({ children }: { children: ReactNode }) {
  const value = useTeamCallDevice()
  return createElement(TeamCallDeviceContext.Provider, { value }, children)
}

/** Consumer hook for IncomingCallOverlay/TeamCallButton — throws if used outside a <TeamCallDeviceProvider>. */
export function useTeamCallDeviceContext(): UseTeamCallDeviceResult {
  const ctx = useContext(TeamCallDeviceContext)
  if (!ctx) {
    throw new Error('useTeamCallDeviceContext() must be used within a <TeamCallDeviceProvider>')
  }
  return ctx
}
