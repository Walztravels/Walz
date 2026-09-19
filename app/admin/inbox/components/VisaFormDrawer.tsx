'use client'

// VisaFormDrawer — INBOX UX-4.3 (Client Action Centre).
//
// Same interaction language as PaymentRequestDrawer/CreateQuoteDrawer:
// right sheet, scrim + Esc close, focus in on open / restore on close,
// Tab trapped inside (:disabled-aware), safe-area padding, motion-safe
// slide, stale-response guard on load.
//
// Three server actions (one POST endpoint, action-discriminated — see
// app/api/admin/inbox/conversations/[id]/visa/route.ts):
//  - CREATE CASE: only shown when the linked client has no visa case yet.
//  - SEND/RESEND FORM: mints a secure client-form link for the linked
//    case. Generation never sends — Copy/Insert/Send is staff's choice.
//  - REQUEST DOCUMENTS: creates a document request and returns the
//    upload link, same Copy/Insert/Send discipline.
//
// HARD BOUNDARY: this drawer never touches Letter Generator or Dummy
// Ticket Generator — it only reads/writes VisaApplication, VisaApplication-
// Token, and DocumentRequest via the dedicated action-centre service.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Copy, MessageSquarePlus, RefreshCw, FileText, ExternalLink } from 'lucide-react'
import { useComposerDraft } from '@/app/admin/inbox/ComposerDraftContext'
import { VISA_TYPES, VISA_TYPE_LABELS, DESTINATION_OPTIONS, type VisaType } from '@/lib/action-centre/constants'
import type { ProfileField } from '@/lib/inbox/client-profile'
import { CompleteClientProfile } from '@/app/admin/inbox/components/CompleteClientProfile'
import { useClientContext } from '@/lib/inbox/useClientContext'
import { ActionDrawerShell } from '@/app/admin/inbox/components/ActionDrawerShell'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'

interface RecentAction {
  kind: 'form_link' | 'document_request'
  id: string; createdAt: string; expiresAt: string
  used?: boolean; status?: string
}

export interface VisaFormDrawerProps {
  open: boolean
  onClose: () => void
  conversationId: number
  onSendMessage: (text: string) => Promise<boolean>
  /** UX-4.1C invalidation signal, threaded through so the shared
   *  client-context cache refetches after a Find/Create link — same token
   *  page.tsx already passes to ClientInfo. */
  identityRefreshToken?: number
}

type View = 'case' | 'link' | 'documents'

export function VisaFormDrawer({ open, onClose, conversationId, onSendMessage, identityRefreshToken = 0 }: VisaFormDrawerProps) {
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
  const [recent, setRecent] = useState<RecentAction[]>([])
  const [view, setView] = useState<View>('case')

  // Create-case form state
  const [destinationIso2, setDestinationIso2] = useState('')
  const [visaType, setVisaType] = useState<VisaType>('tourist')
  const [purposeOfVisit, setPurposeOfVisit] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [creating, setCreating] = useState(false)

  // Mint-link result
  const [minting, setMinting] = useState(false)
  const [linkResult, setLinkResult] = useState<{ link: string; expiresAt: string } | null>(null)

  // Request-documents form + result
  const [docsInput, setDocsInput] = useState('')
  const [docsMessage, setDocsMessage] = useState('')
  const [requestingDocs, setRequestingDocs] = useState(false)
  const [docsResult, setDocsResult] = useState<{ uploadLink: string; requestedDocs: string[] } | null>(null)

  const [error, setError] = useState<string | null>(null)
  // Profile Completeness gate (shared layer) — set on CLIENT_PROFILE_INCOMPLETE
  // from ANY of the three actions below. Distinct from an identity failure:
  // the client IS VERIFIED/LINKED; their profile just lacks data this
  // action needs. Blocks all three views uniformly (create/link/documents
  // all route through the same requireLinkedIdentity in the service).
  const [profileGate, setProfileGate] = useState<{
    missingFields: ProfileField[]; availableFields: Partial<Record<ProfileField, string>>
    crossRecordConflicts: ProfileField[]
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const loadSeqRef = useRef(0)
  const loadRecent = useCallback(async () => {
    const seq = ++loadSeqRef.current
    try {
      const aRes = await fetch(`/api/admin/inbox/conversations/${conversationId}/visa`)
      if (seq !== loadSeqRef.current) return
      if (aRes.ok) {
        const aData = await aRes.json()
        if (seq !== loadSeqRef.current) return
        setRecent(Array.isArray(aData?.actions) ? aData.actions : [])
      }
    } catch { /* recent list is supplementary — silent failure, as before */ }
  }, [conversationId])

  useEffect(() => {
    if (!open) { setEntered(false); return }
    setDestinationIso2(''); setVisaType('tourist'); setPurposeOfVisit(''); setArrivalDate('')
    setLinkResult(null); setDocsResult(null); setDocsInput(''); setDocsMessage('')
    setView('case'); setError(null); setSent(false); setCopied(false)
    setProfileGate(null)
    setRecent([])
    void loadRecent()
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open, loadRecent])

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
  const hasCase = !!ctx?.application

  async function handleCreateCase() {
    if (creating) return
    if (!destinationIso2) { setError('Choose a destination country.'); return }
    setCreating(true)
    setError(null)
    setProfileGate(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/visa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_case', destinationIso2, visaType,
          purposeOfVisit: purposeOfVisit.trim() || undefined,
          arrivalDate: arrivalDate || undefined,
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
          return
        }
        setError(data?.error ?? 'Could not create the visa case. Retry.')
        return
      }
      await retryCtx()   // re-fetch so ctx.application reflects the new case
    } catch {
      setError('Could not create the visa case. Retry.')
    } finally {
      setCreating(false)
    }
  }

  async function handleMintLink() {
    if (minting) return
    setMinting(true)
    setError(null)
    setProfileGate(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/visa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mint_link', applicationId: ctx?.application?.id }),
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
          return
        }
        setError(data?.error ?? 'Could not generate the form link. Retry.')
        return
      }
      setLinkResult({ link: data.result.link, expiresAt: data.result.expiresAt })
      setView('link')
    } catch {
      setError('Could not generate the form link. Retry.')
    } finally {
      setMinting(false)
    }
  }

  async function handleRequestDocuments() {
    if (requestingDocs) return
    const docs = docsInput.split(',').map(d => d.trim()).filter(Boolean)
    if (docs.length === 0) { setError('List at least one document (comma-separated).'); return }
    setRequestingDocs(true)
    setError(null)
    setProfileGate(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/visa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_documents', applicationId: ctx?.application?.id,
          requestedDocs: docs, message: docsMessage.trim() || undefined,
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
          return
        }
        setError(data?.error ?? 'Could not create the document request. Retry.')
        return
      }
      setDocsResult({ uploadLink: data.result.uploadLink, requestedDocs: data.result.requestedDocs })
    } catch {
      setError('Could not create the document request. Retry.')
    } finally {
      setRequestingDocs(false)
    }
  }

  function buildFormLinkMessage(): string {
    return `Hello! Here is your secure visa application form for ${ctx?.application?.walzRef}:\n${linkResult?.link}\n\nPlease complete it at your convenience — we're here if you have any questions.`
  }
  function buildDocumentsMessage(): string {
    return `Hello! To continue with your visa application (${ctx?.application?.walzRef}), please upload the following via this secure link:\n${docsResult?.uploadLink}\n\nDocuments needed: ${docsResult?.requestedDocs.join(', ')}`
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

  function shareBlock(text: string, linkOnly: string) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-walz-navy break-all">{linkOnly}</p>
        <p className="text-xs text-walz-muted-strong">Nothing has been sent to the client yet. Choose how to share it:</p>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        <button onClick={() => void handleCopy(linkOnly)} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
          <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <button onClick={() => handleInsert(text)} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
          <MessageSquarePlus className="w-3.5 h-3.5" /> Insert into reply (does not send)
        </button>
        <button
          onClick={() => void handleSendToClient(text)}
          disabled={sending || sent}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60"
        >
          <Send className="w-3.5 h-3.5" /> {sent ? 'Sent to client' : sending ? 'Sending…' : 'Send to client'}
        </button>
      </div>
    )
  }

  return (
    <ActionDrawerShell
      panelRef={panelRef}
      closeRef={closeRef}
      entered={entered}
      onClose={onClose}
      title="Visa form"
      role="dialog"
      panelTransitionClassName="motion-safe:transition-transform motion-safe:duration-200"
      panelSafeAreaStyle={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
          {ctxError ? (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">Could not load client context.</p>
              <button onClick={() => { retryCtx(); void loadRecent() }} className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
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
                Verify or link the client before using the Visa Form action.
              </p>
            </div>
          ) : profileGate ? (
            <CompleteClientProfile
              conversationId={conversationId}
              missingFields={profileGate.missingFields}
              availableFields={profileGate.availableFields}
              crossRecordConflicts={profileGate.crossRecordConflicts}
              onComplete={() => { setProfileGate(null); retryCtx(); void loadRecent() }}
            />
          ) : !hasCase ? (
            /* 6B — no case yet: minimal create form */
            <fieldset disabled={creating} className="space-y-3 disabled:opacity-60">
              <p className="text-xs text-walz-muted-strong">No visa case is linked to this client yet.</p>
              <div>
                <label htmlFor="vf-dest" className={labelCls}>Destination country</label>
                <select id="vf-dest" value={destinationIso2} onChange={e => setDestinationIso2(e.target.value)} className={inputCls}>
                  <option value="">Choose…</option>
                  {DESTINATION_OPTIONS.map(d => <option key={d.iso2} value={d.iso2}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="vf-type" className={labelCls}>Visa type</label>
                <select id="vf-type" value={visaType} onChange={e => setVisaType(e.target.value as VisaType)} className={inputCls}>
                  {VISA_TYPES.map(t => <option key={t} value={t}>{VISA_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="vf-purpose" className={labelCls}>Purpose of visit (optional)</label>
                <input id="vf-purpose" value={purposeOfVisit} onChange={e => setPurposeOfVisit(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="vf-arrival" className={labelCls}>Expected travel date (optional)</label>
                <input id="vf-arrival" type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} className={inputCls} />
              </div>
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              <button
                onClick={() => void handleCreateCase()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
              >
                {creating ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Creating…</>) : 'Create visa case'}
              </button>
            </fieldset>
          ) : view === 'link' && linkResult ? (
            shareBlock(buildFormLinkMessage(), linkResult.link)
          ) : view === 'documents' && docsResult ? (
            shareBlock(buildDocumentsMessage(), docsResult.uploadLink)
          ) : (
            /* 6A — case exists: summary + actions */
            <div className="space-y-3">
              <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
                <p className={labelCls}>Client</p>
                <p className="text-sm font-semibold text-walz-deep-navy">{ctx.contact?.name ?? 'Client on file'}</p>
                <p className="text-xs text-walz-navy font-mono mt-1">{ctx.application?.walzRef}</p>
                <p className="text-xs text-walz-muted-strong">{ctx.application?.applicationType} · {ctx.application?.status}</p>
              </div>
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              <button
                onClick={() => void handleMintLink()}
                disabled={minting}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
              >
                {minting ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Generating…</>) : 'Send / resend form'}
              </button>
              <button
                onClick={() => setView('documents')}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> Request documents
              </button>
              <a href={`/admin/visa-applications/${ctx.application?.id}`} target="_blank" rel="noreferrer"
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-walz-navy text-xs font-semibold hover:underline">
                Open application <ExternalLink className="w-3 h-3" />
              </a>

              {view === 'documents' && !docsResult && (
                <fieldset disabled={requestingDocs} className="space-y-2 rounded-lg border border-dashed border-walz-border p-3 disabled:opacity-60">
                  <div>
                    <label htmlFor="vf-docs" className={labelCls}>Documents needed (comma-separated)</label>
                    <input id="vf-docs" value={docsInput} onChange={e => setDocsInput(e.target.value)} placeholder="Passport bio page, Bank statement" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="vf-docs-msg" className={labelCls}>Message (optional)</label>
                    <input id="vf-docs-msg" value={docsMessage} onChange={e => setDocsMessage(e.target.value)} className={inputCls} />
                  </div>
                  <button
                    onClick={() => void handleRequestDocuments()}
                    className="w-full min-h-[44px] rounded-lg bg-walz-navy text-walz-gold text-xs font-semibold hover:bg-walz-deep-navy transition-colors"
                  >
                    {requestingDocs ? 'Creating…' : 'Create document request'}
                  </button>
                </fieldset>
              )}

              {recent.length > 0 && (
                <div className="pt-2 border-t border-walz-border">
                  <p className={labelCls}>Recent</p>
                  <ul className="space-y-1">
                    {recent.map(r => (
                      <li key={`${r.kind}-${r.id}`} className="text-xs text-walz-deep-navy flex items-baseline justify-between gap-2">
                        <span>{r.kind === 'form_link' ? 'Form link' : 'Document request'}</span>
                        <span className="text-walz-muted-strong">{r.kind === 'form_link' ? (r.used ? 'Used' : 'Pending') : r.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
    </ActionDrawerShell>
  )
}
