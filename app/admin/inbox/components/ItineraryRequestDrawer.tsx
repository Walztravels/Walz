'use client'

// ItineraryRequestDrawer — INBOX UX-4.4 (Client Action Centre).
//
// Same interaction language as PaymentRequestDrawer/CreateQuoteDrawer/
// VisaFormDrawer: right sheet, scrim + Esc close, focus in on open /
// restore on close, Tab trapped inside (:disabled-aware), safe-area
// padding, motion-safe slide, stale-response guard on load.
//
// ONE server action (POST — see app/api/admin/inbox/conversations/[id]/
// itinerary-request/route.ts): generate (or attach this conversation to)
// a client intake link. Generation never sends — Copy/Insert/Send is
// staff's choice, via the EXISTING composer send path.
//
// HARD BOUNDARY: this drawer never builds a full itinerary planner in a
// drawer — once a request is submitted, staff convert it via the existing
// admin Trip Requests page, linked to from here.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Copy, MessageSquarePlus, RefreshCw, ExternalLink } from 'lucide-react'
import { useComposerDraft } from '@/app/admin/inbox/ComposerDraftContext'
import type { ProfileField } from '@/lib/inbox/client-profile'
import { CompleteClientProfile } from '@/app/admin/inbox/components/CompleteClientProfile'
import { useClientContext } from '@/lib/inbox/useClientContext'
import { ActionDrawerShell } from '@/app/admin/inbox/components/ActionDrawerShell'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'

interface ItineraryRequestDTO {
  id: string; referenceNumber: string; status: string
  link: string; expiresAt: string | null; submittedAt: string | null; createdAt: string
}

export interface ItineraryRequestDrawerProps {
  open: boolean
  onClose: () => void
  conversationId: number
  onSendMessage: (text: string) => Promise<boolean>
  /** UX-4.1C invalidation signal, threaded through so the shared
   *  client-context cache refetches after a Find/Create link — same token
   *  page.tsx already passes to ClientInfo. */
  identityRefreshToken?: number
}

function statusLabel(status: string): string {
  if (status === 'pending') return 'Intake sent, awaiting client'
  if (status === 'submitted' || status === 'viewed') return 'Client submitted — ready to convert'
  if (status === 'converted') return 'Converted to an itinerary'
  return status
}

// QA gap: expiresAt is in the DTO but was never shown to staff — a
// "pending, awaiting client" request can quietly be stale. Computed
// client-side from the ISO string vs. now; no new API needed.
function expiryLabel(expiresAt: string | null): { text: string; expired: boolean } | null {
  if (!expiresAt) return null
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return { text: 'Expired', expired: true }
  const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)))
  return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, expired: false }
}

export function ItineraryRequestDrawer({ open, onClose, conversationId, onSendMessage, identityRefreshToken = 0 }: ItineraryRequestDrawerProps) {
  const { insertDraft } = useComposerDraft()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  // Phase 1 (Agent A — Inbox Performance): client-context now comes from the
  // shared cache/hook (deduped with the rail/overlay ClientInfo and the
  // sibling action drawers) instead of an independent fetch here.
  const { state: ctxState, retry: retryCtx } = useClientContext(open ? conversationId : null, identityRefreshToken)
  const ctx = ctxState.phase === 'ready' ? ctxState.context : null
  const ctxError = ctxState.phase === 'error'
  const [existing, setExisting] = useState<ItineraryRequestDTO | null>(null)
  const [conflict, setConflict] = useState<{ kind: 'itinerary'; ref: string } | { kind: 'ambiguous' } | null>(null)

  // Create-request form state (all optional — the client fills the rest in)
  const [destination, setDestination] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [numberOfTravellers, setNumberOfTravellers] = useState('')
  const [creating, setCreating] = useState(false)

  const [error, setError] = useState<string | null>(null)
  // Profile Completeness gate (shared layer) — the client IS VERIFIED/LINKED;
  // their profile just lacks data this action needs. Distinct from
  // !identityOk. Rendered before the create-form/existing/conflict views so
  // whatever staff already typed below (destination/dates/travellers) is
  // preserved across the round-trip — those fields are untouched here.
  const [profileGate, setProfileGate] = useState<{
    missingFields: ProfileField[]; availableFields: Partial<Record<ProfileField, string>>
    crossRecordConflicts: ProfileField[]
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const loadSeqRef = useRef(0)
  const loadExisting = useCallback(async () => {
    const seq = ++loadSeqRef.current
    try {
      const rRes = await fetch(`/api/admin/inbox/conversations/${conversationId}/itinerary-request`)
      if (seq !== loadSeqRef.current) return
      if (rRes.ok) {
        const rData = await rRes.json()
        if (seq !== loadSeqRef.current) return
        const requests: ItineraryRequestDTO[] = Array.isArray(rData?.requests) ? rData.requests : []
        setExisting(requests[0] ?? null)
      }
    } catch { /* existing-request lookup is supplementary — silent failure, as before */ }
  }, [conversationId])

  useEffect(() => {
    if (!open) { setEntered(false); return }
    setDestination(''); setDepartureDate(''); setReturnDate(''); setNumberOfTravellers('')
    setExisting(null); setConflict(null); setProfileGate(null)
    setError(null); setSent(false); setCopied(false)
    void loadExisting()
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open, loadExisting])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = queryDrawerFocusables(panel).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
      cycleTabFocus(e, focusables, panel)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const identityOk = ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    setError(null)
    setConflict(null)
    setProfileGate(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/itinerary-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destination.trim() || undefined,
          departureDate: departureDate || undefined,
          returnDate: returnDate || undefined,
          numberOfTravellers: numberOfTravellers ? Number(numberOfTravellers) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.code === 'CLIENT_PROFILE_INCOMPLETE') {
          setProfileGate({
            missingFields: Array.isArray(data?.missingFields) ? data.missingFields : [],
            availableFields: data?.availableFields ?? {},
            crossRecordConflicts: Array.isArray(data?.crossRecordConflicts)
              ? data.crossRecordConflicts.map((c: { field: ProfileField }) => c.field) : [],
          })
        } else if (data?.code === 'REQUEST_ALREADY_EXISTS' && data?.existing) {
          setExisting(data.existing)
        } else if (data?.code === 'ITINERARY_ALREADY_EXISTS') {
          setConflict({ kind: 'itinerary', ref: data.itineraryRef ?? 'an existing itinerary' })
        } else if (data?.code === 'AMBIGUOUS_REQUEST') {
          setConflict({ kind: 'ambiguous' })
        } else {
          setError(data?.error ?? 'Could not create the itinerary request. Retry.')
        }
        return
      }
      setExisting(data.result)
    } catch {
      setError('Could not create the itinerary request. Retry.')
    } finally {
      setCreating(false)
    }
  }

  function buildRequestMessage(): string {
    return `Hello! Here's your personalised trip planning form (${existing?.referenceNumber}):\n${existing?.link}\n\nTell us your travel preferences and we'll put together options tailored to you — reach out any time if you have questions.`
  }

  async function handleCopy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) }
  }
  function handleInsert(text: string) {
    insertDraft(text)   // fills the composer — DOES NOT SEND
    onClose()
  }
  async function handleSendToClient(text: string) {
    if (sending || sent) return
    setSending(true)
    setError(null)
    try {
      const ok = await onSendMessage(text)
      if (ok) setSent(true)
      else setError('The message could not be sent. Try again.')
    } catch {
      setError('The message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  const inputCls = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-walz-border bg-white text-sm text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold/60'
  const labelCls = 'block text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1'

  return (
    <ActionDrawerShell
      panelRef={panelRef}
      closeRef={closeRef}
      entered={entered}
      onClose={onClose}
      title="Itinerary request"
      role="dialog"
      panelTransitionClassName="motion-safe:transition-transform motion-safe:duration-200"
      panelSafeAreaStyle={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
          {ctxError ? (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">Could not load client context.</p>
              <button onClick={() => { retryCtx(); void loadExisting() }} className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                Retry
              </button>
            </div>
          ) : !ctx ? (
            <>
              <span className="sr-only" role="status">Loading client</span>
              <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
                <div className="h-4 w-40 rounded bg-walz-navy/10" />
                <div className="h-3 w-28 rounded bg-walz-navy/10" />
              </div>
            </>
          ) : !identityOk ? (
            <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
              <p className="text-xs font-bold text-walz-deep-navy">Client identity required</p>
              <p className="text-xs text-walz-muted-strong mt-1">
                Verify or link the client before using the Itinerary Request action.
              </p>
            </div>
          ) : profileGate ? (
            <CompleteClientProfile
              conversationId={conversationId}
              missingFields={profileGate.missingFields}
              availableFields={profileGate.availableFields}
              crossRecordConflicts={profileGate.crossRecordConflicts}
              onComplete={() => { setProfileGate(null); retryCtx(); void loadExisting() }}
            />
          ) : conflict ? (
            /* Client-wide duplicate found — never offer to create a second one */
            <div className="space-y-3">
              <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
                {conflict.kind === 'itinerary' ? (
                  <>
                    <p className="text-xs font-bold text-walz-deep-navy">Already has an itinerary in progress</p>
                    <p className="text-xs text-walz-navy font-mono mt-1">{conflict.ref}</p>
                    <p className="text-xs text-walz-muted-strong mt-1">Find it in the itinerary planner rather than starting a new intake.</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-walz-deep-navy">Multiple existing requests found</p>
                    <p className="text-xs text-walz-muted-strong mt-1">This client matches more than one existing itinerary request or itinerary — resolve via Client Identity before generating a new one.</p>
                  </>
                )}
              </div>
              <a href="/admin/trip-requests" target="_blank" rel="noreferrer"
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                Open Trip Requests <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : existing ? (
            /* A request already exists (this conversation, or just created/linked) */
            <div className="space-y-3">
              <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
                <p className={labelCls}>Client</p>
                <p className="text-sm font-semibold text-walz-deep-navy">{ctx.contact?.name ?? 'Client on file'}</p>
                <p className="text-xs text-walz-navy font-mono mt-1">{existing.referenceNumber}</p>
                <p className="text-xs text-walz-muted-strong">{statusLabel(existing.status)}</p>
                {(() => {
                  const exp = expiryLabel(existing.expiresAt)
                  if (!exp) return null
                  return (
                    <p className={`text-[11px] font-semibold mt-1 ${exp.expired ? 'text-red-700' : 'text-walz-muted-strong'}`}>
                      {exp.text}
                    </p>
                  )
                })()}
              </div>
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              {existing.status === 'pending' ? (
                <div className="space-y-2">
                  <p className="text-xs text-walz-navy break-all">{existing.link}</p>
                  <p className="text-xs text-walz-muted-strong">Nothing has been sent to the client yet. Choose how to share it:</p>
                  <button onClick={() => void handleCopy(existing.link)} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                    <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button onClick={() => handleInsert(buildRequestMessage())} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                    <MessageSquarePlus className="w-3.5 h-3.5" /> Insert into reply (does not send)
                  </button>
                  <button
                    onClick={() => void handleSendToClient(buildRequestMessage())}
                    disabled={sending || sent}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" /> {sent ? 'Sent to client' : sending ? 'Sending…' : 'Send to client'}
                  </button>
                </div>
              ) : (
                <button onClick={() => void handleCopy(existing.link)} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link again'}
                </button>
              )}
              <a href={`/admin/trip-requests/${existing.id}`} target="_blank" rel="noreferrer"
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-walz-navy text-xs font-semibold hover:underline">
                Open in Trip Requests <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            /* No request yet — minimal, optional pre-fill form */
            <fieldset disabled={creating} className="space-y-3 disabled:opacity-60">
              <p className="text-xs text-walz-muted-strong">No itinerary request exists for this client yet. Everything below is optional — the client fills in the full details themselves.</p>
              <div>
                <label htmlFor="ir-dest" className={labelCls}>Destination (optional)</label>
                <input id="ir-dest" value={destination} onChange={e => setDestination(e.target.value)} className={inputCls} placeholder="e.g. Dubai" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="ir-depart" className={labelCls}>Departure (optional)</label>
                  <input id="ir-depart" type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="ir-return" className={labelCls}>Return (optional)</label>
                  <input id="ir-return" type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="ir-travellers" className={labelCls}>Number of travellers (optional)</label>
                <input id="ir-travellers" type="number" min={1} max={50} value={numberOfTravellers} onChange={e => setNumberOfTravellers(e.target.value)} className={inputCls} />
              </div>
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              <button
                onClick={() => void handleCreate()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
              >
                {creating ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Generating…</>) : 'Generate intake link'}
              </button>
            </fieldset>
          )}
    </ActionDrawerShell>
  )
}
