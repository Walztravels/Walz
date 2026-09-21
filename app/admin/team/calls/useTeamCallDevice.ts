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
 * ── ONE Device per tab, enforced as a true module-level singleton ────────
 * Three independent trees mount <TeamCallDeviceProvider>: the full
 * /admin/team page, the Inbox's own client-linked Floating Ask Team
 * workspace (app/admin/inbox/team-float), and the Admin-wide Floating Team
 * Hub (app/admin/team/floating). Each of the latter two guards against
 * colliding with the FULL PAGE (the Inbox workspace only exists away from
 * /admin/team; the admin-wide hub force-closes on /admin/team) — but
 * neither guards against the OTHER floating feature, and both are
 * mountable at once on /admin/inbox (Inbox's Ask-Team workspace open with
 * a tab, plus the sidebar's admin-wide Team Hub also opened). Without a
 * shared Device, that would register TWO independent Twilio `Device`
 * objects for the SAME staff identity in the same tab — a real bug (an
 * incoming call could ring on, or be answered from, either one
 * independently, and the two UIs would drift out of sync).
 *
 * All the mutable call state below therefore lives at MODULE scope, not
 * per-hook-instance `useState`/`useRef`. Every `useTeamCallDevice()` call —
 * regardless of which <TeamCallDeviceProvider> it came from — subscribes to
 * this one shared store via `useSyncExternalStore` and shares one
 * reference-counted Device lifecycle: the first mount to run creates and
 * registers the Device, the last mount to unmount destroys it, and every
 * mounted instance (so every <IncomingCallOverlay/>/<TeamCallButton/>
 * anywhere) always observes the exact same live status/incomingCall/
 * activeCall/muted/errorMessage — there is never a second, independently-
 * drifting copy.
 *
 * Exports:
 *   - `useTeamCallDevice()` — the raw hook. Safe to call from more than one
 *     component tree now (it shares the one Device), but most consumers
 *     should still go through the context below.
 *   - `TeamCallDeviceProvider` — wraps a subtree, calling the raw hook
 *     exactly once, and exposes its state via context.
 *   - `useTeamCallDeviceContext()` — the hook IncomingCallOverlay and
 *     TeamCallButton actually use. A UI-building agent should mount
 *     `<TeamCallDeviceProvider>` once near its own Team Hub-adjacent
 *     surface's root (it renders its children as-is — no visual chrome of
 *     its own); it is safe for more than one such surface to do this at
 *     once, since the underlying Device is shared.
 */

import {
  createContext, createElement, useContext, useEffect, useSyncExternalStore,
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

interface SharedCallState {
  status: TeamCallStatus
  incomingCall: IncomingCallInfo | null
  activeCall: ActiveCallMeta | null
  muted: boolean
  errorMessage: string | null
}

const INITIAL_STATE: SharedCallState = {
  status: 'LOADING', incomingCall: null, activeCall: null, muted: false, errorMessage: null,
}

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

// ── Module-level singleton store ──────────────────────────────────────────
// Exported for tests only (see __tests__/team-hub-floating-* / team-float-*
// singleton coverage) — not part of the public UseTeamCallDeviceResult API.
export const __teamCallDeviceInternal = {
  /** Number of currently-mounted useTeamCallDevice() callers sharing this Device. */
  getRefCount: () => refCount,
  /** True once a Device instance has been constructed (register() may still be in flight). */
  hasDevice: () => device !== null,
  /** Simulates one <TeamCallDeviceProvider> mounting, without needing React/jsdom — exactly what the hook's own useEffect does on mount. */
  acquire: () => acquireDevice(),
  /** Simulates one <TeamCallDeviceProvider> unmounting — exactly what the hook's own useEffect cleanup does. */
  release: () => releaseDevice(),
  /** Test-only hard reset between test cases — never called from app code. */
  __resetForTests: () => {
    listeners.clear()
    refCount = 0
    device = null
    activeCallHandle = null
    meta = EMPTY_META
    sharedState = INITIAL_STATE
    initGeneration = 0
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null }
  },
}

let sharedState: SharedCallState = INITIAL_STATE
const listeners = new Set<() => void>()
let refCount = 0
let device: Device | null = null
let activeCallHandle: Call | null = null
let meta: ActiveCallMeta = EMPTY_META
let refreshTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped on every teardown so a slow, in-flight init() from a torn-down
 * lifecycle can never resurrect stale state after a fresh one has started. */
let initGeneration = 0

function notify(): void {
  for (const l of listeners) l()
}

function setState(patch: Partial<SharedCallState>): void {
  sharedState = { ...sharedState, ...patch }
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): SharedCallState {
  return sharedState
}

function getServerSnapshot(): SharedCallState {
  return INITIAL_STATE
}

function clearLocalCallState(): void {
  activeCallHandle = null
  meta = EMPTY_META
  setState({ activeCall: null, incomingCall: null, muted: false })
}

/**
 * Called from a Call SDK terminal event — syncs the server-side status
 * (DM: PATCH a terminal status; GROUP: POST .../leave, ending only this
 * participant's own membership, never the whole call — the server
 * transitions the call itself to ENDED only once the LAST participant
 * leaves, per lib/team/calls.ts's leaveGroupCall), then resets UI to READY.
 */
function endLocalCall(finalStatus: TerminalCallStatus): void {
  const { type, conversationId, callRecordId } = meta
  if (type === 'GROUP') {
    void leaveGroupCallOnServer(conversationId, callRecordId)
  } else {
    void patchCallStatus(conversationId, callRecordId, finalStatus)
  }
  clearLocalCallState()
  setState({ status: 'READY' })
}

function answer(): void {
  if (!activeCallHandle) return
  activeCallHandle.accept()
  setState({ incomingCall: null, status: 'ANSWERED' })
  void patchCallStatus(meta.conversationId, meta.callRecordId, 'ANSWERED')
}

function decline(): void {
  if (!activeCallHandle) return
  activeCallHandle.reject()
  void patchCallStatus(meta.conversationId, meta.callRecordId, 'DECLINED')
  clearLocalCallState()
  setState({ status: 'READY' })
}

function hangUp(): void {
  // The call's own 'disconnect' handler (wired below, for both outgoing
  // and incoming calls) calls endLocalCall('ENDED') — mirrors
  // TwilioPhonePanel's hangUp/resetCall shape.
  activeCallHandle?.disconnect()
}

function toggleMute(): void {
  if (!activeCallHandle) return
  const next = !sharedState.muted
  activeCallHandle.mute(next)
  setState({ muted: next })
}

async function placeCall(conversationId: string, calleeStaffId: string): Promise<void> {
  if (!device) {
    setState({ errorMessage: 'Calling is not ready yet.' })
    return
  }
  setState({ errorMessage: null, status: 'INITIATING' })
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

    meta = { type: 'DM', conversationId, calleeStaffId: resolvedCalleeId, callRecordId }
    setState({ activeCall: meta })

    const call = await device.connect({
      params: {
        CalleeStaffId: resolvedCalleeId,
        ConversationId: conversationId,
        CallRecordId: callRecordId,
      },
    })
    activeCallHandle = call
    setState({ status: 'RINGING' })

    call.on('accept', () => {
      setState({ status: 'ANSWERED' })
      void patchCallStatus(conversationId, callRecordId, 'ANSWERED')
    })
    call.on('disconnect', () => endLocalCall('ENDED'))
    call.on('cancel',     () => endLocalCall('MISSED'))
    call.on('reject',     () => endLocalCall('DECLINED'))
    call.on('error',      () => endLocalCall('FAILED'))
  } catch (e) {
    setState({ errorMessage: (e as Error).message ?? 'Could not start the call.', status: 'ERROR' })
    clearLocalCallState()
  }
}

/** Shared by startOrJoinGroupCall and joinGroupCall — the actual Device.connect() into a <Conference>, once a valid callRecordId is known. */
async function connectToGroupCall(conversationId: string, callRecordId: string): Promise<void> {
  if (!device) {
    setState({ errorMessage: 'Calling is not ready yet.' })
    return
  }
  setState({ errorMessage: null, status: 'INITIATING' })
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

    meta = { type: 'GROUP', conversationId, calleeStaffId: null, callRecordId }
    setState({ activeCall: meta })

    const call = await device.connect({
      params: { ConversationId: conversationId, CallRecordId: callRecordId },
    })
    activeCallHandle = call
    // A conference join has no ring cadence — the leg connects immediately.
    setState({ status: 'ANSWERED' })

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
    setState({ errorMessage: (e as Error).message ?? 'Could not join the call.', status: 'ERROR' })
    clearLocalCallState()
  }
}

async function startOrJoinGroupCall(conversationId: string): Promise<void> {
  setState({ errorMessage: null })
  try {
    const res = await fetch(`/api/admin/team/conversations/${conversationId}/calls`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }))
      throw new Error(body.error ?? 'Could not start the call.')
    }
    const { callRecordId } = await res.json() as { callRecordId: string }
    await connectToGroupCall(conversationId, callRecordId)
  } catch (e) {
    setState({ errorMessage: (e as Error).message ?? 'Could not start the call.', status: 'ERROR' })
  }
}

async function joinGroupCall(conversationId: string, callRecordId: string): Promise<void> {
  await connectToGroupCall(conversationId, callRecordId)
}

/** refCount 0 -> 1 only: actually create + register the shared Device. Every subsequent acquire() while refCount > 0 just increments and reuses it. */
function initDevice(): void {
  const generation = ++initGeneration

  async function init() {
    try {
      const { Device: TwilioDevice } = await import('@twilio/voice-sdk')

      const res = await fetch('/api/team/twilio/token', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(body.error ?? 'Team Hub calling is not available.')
      }
      const { token } = await res.json() as { token: string }
      // A teardown (last consumer unmounted before the token round-trip
      // resolved) or a fresh init() (rapid unmount+remount) invalidates this
      // in-flight attempt — never resurrect a Device for a generation nobody
      // is waiting on anymore.
      if (generation !== initGeneration) return

      const d = new TwilioDevice(token, { logLevel: 1 })
      device = d

      d.on('registered', () => { if (generation === initGeneration) setState({ status: 'READY' }) })
      d.on('error', (err: Error) => {
        if (generation === initGeneration) setState({ errorMessage: err.message, status: 'ERROR' })
      })

      d.on('incoming', (call: Call) => {
        if (generation !== initGeneration) return
        activeCallHandle = call
        const fromIdentity = call.parameters?.From ?? 'Unknown'
        const callSid      = call.parameters?.CallSid ?? ''
        const callRecordId   = call.customParameters?.get('CallRecordId')   ?? null
        const conversationId = call.customParameters?.get('ConversationId') ?? null

        meta = { type: 'DM', conversationId, calleeStaffId: null, callRecordId }
        setState({ activeCall: meta, incomingCall: { callSid, fromIdentity }, status: 'RINGING' })

        call.on('cancel',     () => endLocalCall('MISSED'))
        call.on('disconnect', () => endLocalCall('ENDED'))
      })

      d.register()

      // Refresh 5 min before the 1-hour token expires.
      refreshTimer = setTimeout(async () => {
        if (generation !== initGeneration) return
        try {
          const r = await fetch('/api/team/twilio/token', { method: 'POST' })
          if (r.ok) {
            const { token: t } = await r.json() as { token: string }
            d.updateToken(t)
          }
        } catch { /* ignore refresh errors */ }
      }, 55 * 60 * 1000)
    } catch (e) {
      if (generation === initGeneration) {
        setState({ errorMessage: (e as Error).message ?? 'Connection failed', status: 'ERROR' })
      }
    }
  }

  void init()
}

function teardownDevice(): void {
  initGeneration += 1 // invalidate any in-flight init() for the outgoing generation
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null }
  device?.destroy()
  device = null
  activeCallHandle = null
  meta = EMPTY_META
  sharedState = INITIAL_STATE
  notify()
}

/** Reference-counted acquire/release — the actual "ONE Device per tab" enforcement. First acquire() (0 -> 1) creates it; only the last release() (1 -> 0) destroys it. Any acquire() in between just shares what's already there. */
function acquireDevice(): void {
  refCount += 1
  if (refCount === 1) initDevice()
}

function releaseDevice(): void {
  refCount = Math.max(0, refCount - 1)
  if (refCount === 0) teardownDevice()
}

// QA finding (CONCERN, fixed): a tab refresh/close mid-group-call previously
// left a phantom TeamCallParticipant row (leftAt never stamped) — the
// Device is destroyed on last release() above, but nothing ever told the
// server this participant left. Best-effort only (sendBeacon has no
// delivery guarantee, and there is intentionally no "resume my call on
// reload" feature) — it meaningfully reduces, not eliminates, the
// phantom-row window versus doing nothing at all. Registered ONCE at
// module load (not once per mounted <TeamCallDeviceProvider>) since `meta`
// is shared module state now — this also incidentally fixes what would
// otherwise be a duplicate sendBeacon() per concurrently-mounted provider.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const { type, conversationId, callRecordId } = meta
    if (type !== 'GROUP' || !conversationId || !callRecordId) return
    try {
      navigator.sendBeacon?.(`/api/admin/team/conversations/${conversationId}/calls/${callRecordId}/leave`, new Blob([], { type: 'text/plain' }))
    } catch { /* best-effort */ }
  })
}

export function useTeamCallDevice(): UseTeamCallDeviceResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    acquireDevice()
    return () => releaseDevice()
  }, [])

  return {
    status: state.status,
    incomingCall: state.incomingCall,
    activeCall: state.activeCall,
    muted: state.muted,
    errorMessage: state.errorMessage,
    placeCall,
    startOrJoinGroupCall,
    joinGroupCall,
    answer,
    decline,
    hangUp,
    toggleMute,
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
