'use client'

// JadeAssistPanel — V1.4 Jade Staff Communication Intelligence.
//
// A SEPARATE surface from the existing free-form "Staff Jade" copilot
// (InboxJadeCopilot.tsx / useStaffJadeChat.ts, untouched by this file).
// Where that copilot is a chat staff can ask anything, this panel is a
// structured menu of writing-assist TRANSFORMS that act on the composer's
// current text (or on the conversation, for Draft Reply/Summarize), plus a
// staff-triggered "Suggest an Action" lookup.
//
// Product rule (V1.4): Jade assists, staff decides, staff sends. Nothing in
// this file can reach a client — every path here ends at either
// replaceDraft/insertDraft (composer text, reviewed by staff before Send is
// ever clicked) or one of the existing openX() Client Action Centre
// launchers (which themselves require further explicit staff action in
// their own drawers before anything is sent).
//
// Layout — matches InboxJadeCopilot.tsx on both desktop and mobile:
//   - mobile: identical bottom-sheet contract (max-h-[80dvh], scrim, z-[60]
//     = Z_INDEX.drawer) — copied byte-for-byte from InboxJadeCopilot.tsx;
//   - desktop: a peer panel (`w-[400px]`) that takes over the ClientInfo
//     rail's flex slot while open, exactly like the copilot does. An
//     earlier version floated this panel instead (fixed, bottom-right) to
//     avoid touching two frozen source-pin tests
//     (__tests__/inbox-ux2-conversation.test.ts,
//     __tests__/inbox-action-centre-drawer-shell.test.ts) that assert the
//     exact literal `{selected && !copilotOpen && (` for the rail's
//     visibility condition — an independent QA review found that a
//     floating card wide enough to be usable geometrically cannot avoid
//     overlapping either the rail or the composer's Send button at the
//     `lg` breakpoint (the rail is 288px, this panel needs ~380-400px, and
//     both live in the same ~1024px+ viewport alongside the conversation
//     list). Fixed in page.tsx by wrapping the ORIGINAL pinned condition
//     in a new outer `{!jadeAssistOpen && (<>...</>)}` check instead of
//     editing it — the pinned substring is untouched character-for-
//     character, both tests still pass, and this panel now correctly
//     reflows the rail out of the way instead of floating over it.
// Same focus management (focus on open, restore on close, Esc closes) and
// the same "reset local state when conversationId changes" discipline as
// InboxJadeCopilot — required here because useJadeAssist's own epoch guard
// only stops a STALE NETWORK RESPONSE from applying; it can't clear a
// suggestion this component is still showing on screen after staff has
// switched conversations.

import { useEffect, useRef, useState } from 'react'
import {
  X, Wand2, Sparkles, ArrowLeft, AlertTriangle, Undo2, Copy, Loader2, Check,
} from 'lucide-react'
import { useComposerDraft } from '../ComposerDraftContext'
import {
  useJadeAssist,
  JadeTextOperation,
  JadeContextOperation,
  JadeAssistResult,
  JadeSuggestedAction,
  JadeActionType,
  ConversationTurnInput,
} from '../useJadeAssist'

export interface JadeAssistPanelProps {
  open: boolean
  onClose: () => void
  conversationId: number | null
  channel: string
  contactName: string
  contactEmail?: string | null
  contactPhone?: string | null
  recentMessages: ConversationTurnInput[]
  onOpenCreateQuote: () => void
  onOpenPaymentRequest: () => void
  onOpenVisaForm: () => void
  onOpenItineraryRequest: () => void
  onOpenClientIdentity: (mode: 'find' | 'create') => void
}

type PanelView = 'menu' | 'translate' | 'staffNote' | 'review' | 'actions'

interface ReviewState {
  operationLabel: string
  status: 'loading' | 'done' | 'error'
  /** The text sent to Jade — shown as "Original" for text-transform ops. Absent for Draft Reply/Summarize. */
  original?: string
  suggestion?: string
  warnings?: string[]
  protectedFactsPreserved?: boolean
  error?: string
  /** replace = Fix Writing/tone/Translate (transforms what staff typed); insert = Draft Reply (new content); none = Summarize (staff-only, nothing to hand to the composer). */
  insertMode: 'replace' | 'insert' | 'none'
  /** conversationId this request was made for — lets us tell a genuine failure (same conversation) apart from a stale/discarded one (conversation switched mid-flight; the reset effect below already clears this state in that case). */
  forConversationId: number | null
  /** Re-issues the exact same request — same input, not a fresh read of the composer. */
  retry: () => void
}

interface ActionsState {
  status: 'loading' | 'done' | 'error'
  identityResolution?: 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
  actions?: JadeSuggestedAction[]
  error?: string
  forConversationId: number | null
}

const TEXT_OPS: Array<{ key: JadeTextOperation; label: string }> = [
  { key: 'fix_writing', label: 'Fix Writing' },
  { key: 'professionalize', label: 'Make Professional' },
  { key: 'friendly', label: 'Make Friendlier' },
  { key: 'formal', label: 'More Formal' },
  { key: 'shorten', label: 'Shorten' },
  { key: 'clarify', label: 'Explain Clearly' },
]

const PRESET_LANGUAGES = ['Spanish', 'French', 'Portuguese', 'Arabic', 'Hindi', 'Mandarin Chinese']

const ACTION_LABELS: Record<JadeActionType, string> = {
  CREATE_QUOTE: 'Create Flight Quote',
  REQUEST_PAYMENT: 'Request Payment',
  VISA_FORM: 'Start Visa Form',
  ITINERARY_REQUEST: 'Request Itinerary',
}

function describeActionFields(action: JadeSuggestedAction): string {
  const f = action.fields as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
  switch (action.type) {
    case 'CREATE_QUOTE': {
      const route = [str(f.origin), str(f.destination)].filter(Boolean).join(' → ')
      const dates = [str(f.departureDate), str(f.returnDate)].filter(Boolean).join(' – ')
      const pax = num(f.passengers) != null ? `${f.passengers} passenger${f.passengers === 1 ? '' : 's'}` : undefined
      return [route, dates, pax, str(f.serviceType), str(f.currency)].filter(Boolean).join(' · ') || 'No details extracted'
    }
    case 'REQUEST_PAYMENT':
      return str(f.purpose) ? `Purpose: ${str(f.purpose)}` : 'No details extracted'
    case 'VISA_FORM':
      return [str(f.destinationCountry), str(f.visaType)].filter(Boolean).join(' · ') || 'No details extracted'
    case 'ITINERARY_REQUEST': {
      const dates = [str(f.departureDate), str(f.returnDate)].filter(Boolean).join(' – ')
      const travellers = num(f.travellers) != null ? `${f.travellers} traveller${f.travellers === 1 ? '' : 's'}` : undefined
      return [str(f.destination), dates, travellers].filter(Boolean).join(' · ') || 'No details extracted'
    }
    default:
      return 'No details extracted'
  }
}

export function JadeAssistPanel({
  open, onClose, conversationId, channel, contactName, recentMessages,
  onOpenCreateQuote, onOpenPaymentRequest, onOpenVisaForm, onOpenItineraryRequest, onOpenClientIdentity,
}: JadeAssistPanelProps) {
  const { getComposerText, replaceDraft, insertDraft } = useComposerDraft()
  const { busy, error, clearError, runTextOperation, runContextOperation, runSuggestActions } =
    useJadeAssist({ conversationId })

  const [view, setView] = useState<PanelView>('menu')
  const [review, setReview] = useState<ReviewState | null>(null)
  const [actionsState, setActionsState] = useState<ActionsState | null>(null)
  const [inlineNotice, setInlineNotice] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ text: string } | null>(null)

  const [translateLang, setTranslateLang] = useState('')
  const [translateVariant, setTranslateVariant] = useState<'plain' | 'professional'>('plain')
  const [staffNoteFor, setStaffNoteFor] = useState<JadeContextOperation | null>(null)
  const [staffNoteText, setStaffNoteText] = useState('')

  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-current conversationId, readable from inside an async continuation
  // that resumed after the component re-rendered with a new one (a plain
  // render-scope variable would still read the OLD value there).
  const conversationIdRef = useRef<number | null>(conversationId)
  conversationIdRef.current = conversationId

  // Focus management: on open, focus the panel; on close, restore focus to
  // whatever had it before — same contract as InboxJadeCopilot.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
      const raf = requestAnimationFrame(() => panelRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
    restoreFocusRef.current?.focus?.()
    restoreFocusRef.current = null
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset ALL local review/suggestion state whenever the conversation
  // changes. useJadeAssist's own epoch guard already stops a stale network
  // response from being applied — this is the separate, UI-side half of
  // owner decision 12: a suggestion already ON SCREEN for conversation A
  // must not linger (and be clickable via "Use This") once staff has moved
  // to conversation B. Copies InboxJadeCopilot's prevConvIdRef pattern.
  const prevConvIdRef = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (prevConvIdRef.current !== undefined && prevConvIdRef.current !== conversationId) {
      setView('menu')
      setReview(null)
      setActionsState(null)
      setInlineNotice(null)
      setUndo(null)
      setStaffNoteFor(null)
      setStaffNoteText('')
      setTranslateLang('')
      clearError()
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
    prevConvIdRef.current = conversationId
  }, [conversationId, clearError])

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  if (!open) return null

  function applyTextResult(result: JadeAssistResult | null, forConversationId: number | null) {
    setReview(prev => {
      if (!prev) return prev
      if (result === null) {
        // Either a stale/discarded response (conversation changed mid-flight
        // — the effect above already reset this state) or a genuine network
        // failure the hook flagged via its own `error` (read live at render
        // time below, never via a closure captured before this await).
        if (forConversationId !== conversationIdRef.current) return prev
        return { ...prev, status: 'error' }
      }
      if (result.ok) {
        return {
          ...prev,
          status: 'done',
          suggestion: result.suggestion,
          warnings: result.warnings,
          protectedFactsPreserved: result.protectedFactsPreserved,
        }
      }
      return { ...prev, status: 'error', error: result.error }
    })
  }

  function beginTextReview(operationLabel: string, insertMode: ReviewState['insertMode'], original: string | undefined, run: () => Promise<JadeAssistResult | null>) {
    const forConversationId = conversationId
    setReview({ operationLabel, status: 'loading', original, insertMode, forConversationId, retry: () => runAgain() })
    setView('review')
    function runAgain() {
      setReview(prev => (prev ? { ...prev, status: 'loading', error: undefined } : prev))
      void run().then(r => applyTextResult(r, forConversationId))
    }
    void run().then(r => applyTextResult(r, forConversationId))
  }

  function handleTextOp(op: JadeTextOperation, label: string, targetLanguage?: string) {
    clearError()
    const { text } = getComposerText()
    if (!text.trim()) {
      setInlineNotice('Type something in the composer first.')
      return
    }
    setInlineNotice(null)
    const input = targetLanguage ? { operation: op, text, targetLanguage } : { operation: op, text }
    beginTextReview(label, 'replace', text, () => runTextOperation(input))
  }

  function handleContextOp(op: JadeContextOperation, label: string, staffNote: string | undefined) {
    clearError()
    const input = {
      operation: op,
      recentMessages,
      channel: channel || undefined,
      contactName: contactName || undefined,
      ...(staffNote && staffNote.trim() ? { staffNote: staffNote.trim() } : {}),
    }
    beginTextReview(label, op === 'draft_reply' ? 'insert' : 'none', undefined, () => runContextOperation(input))
  }

  function handleUseThis() {
    if (!review || review.status !== 'done' || review.suggestion == null) return
    if (review.insertMode === 'replace') {
      const prevText = getComposerText().text
      replaceDraft(review.suggestion)
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      setUndo({ text: prevText })
      undoTimerRef.current = setTimeout(() => setUndo(null), 8000)
      setView('menu')
      setReview(null)
      // Panel stays open — staff may chain another transform, and the Undo
      // banner needs somewhere to live while the message is still unsent.
    } else if (review.insertMode === 'insert') {
      insertDraft(review.suggestion)
      setView('menu')
      setReview(null)
      onClose() // mirrors InboxJadeCopilot's Insert-into-Reply: closes so a mobile keyboard doesn't pop under the sheet
    }
  }

  function handleCancelReview() {
    setReview(null)
    setView('menu')
  }

  async function handleCopySummary() {
    if (!review?.suggestion) return
    try { await navigator.clipboard.writeText(review.suggestion) } catch { /* clipboard may be unavailable — non-fatal */ }
  }

  async function handleSuggestActions() {
    clearError()
    const forConversationId = conversationId
    setActionsState({ status: 'loading', forConversationId })
    setView('actions')
    const result = await runSuggestActions({ recentMessages, channel: channel || undefined, contactName: contactName || undefined })
    setActionsState(prev => {
      if (!prev) return prev
      if (result === null) {
        if (forConversationId !== conversationIdRef.current) return prev
        return { ...prev, status: 'error' }
      }
      if (result.ok) return { ...prev, status: 'done', identityResolution: result.identityResolution, actions: result.actions }
      return { ...prev, status: 'error', error: result.error }
    })
  }

  function launchAction(type: JadeActionType) {
    switch (type) {
      case 'CREATE_QUOTE': onOpenCreateQuote(); break
      case 'REQUEST_PAYMENT': onOpenPaymentRequest(); break
      case 'VISA_FORM': onOpenVisaForm(); break
      case 'ITINERARY_REQUEST': onOpenItineraryRequest(); break
    }
  }

  const btnBase = 'text-left text-xs font-semibold text-walz-navy bg-walz-off-white hover:bg-blue-50 border border-walz-border rounded-lg px-3 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  const header = (
    <div className="flex-shrink-0 flex items-start justify-between gap-2 px-4 py-3 border-b border-walz-border bg-white">
      <div className="min-w-0">
        <p className="text-sm font-bold text-walz-deep-navy flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-blue-600" /> Write with Jade
        </p>
        <p className="text-[10px] text-walz-muted-strong">
          Structured writing help for your reply — nothing is sent automatically.
        </p>
        {conversationId != null && (
          <p className="text-[10px] text-walz-muted-strong truncate mt-0.5">
            {[contactName, channel, `Conversation #${conversationId}`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )

  const undoBanner = undo && (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
      <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 flex-shrink-0" /> Draft replaced.</span>
      <button
        onClick={() => { replaceDraft(undo.text); setUndo(null); if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }}
        className="flex items-center gap-1 font-semibold underline hover:no-underline"
      >
        <Undo2 className="w-3 h-3" /> Undo
      </button>
    </div>
  )

  const errorBanner = (message: string | null | undefined) => message && (
    <p role="alert" className="flex items-center gap-1.5 text-xs text-red-700">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {message}
    </p>
  )

  let body: React.ReactNode

  if (view === 'menu') {
    body = (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {conversationId == null ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <Wand2 className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-walz-muted-strong">Select a conversation to use Jade&apos;s writing tools</p>
          </div>
        ) : (
          <>
            {inlineNotice && (
              <p className="text-xs text-walz-muted-strong bg-walz-off-white border border-walz-border rounded-lg px-3 py-2">{inlineNotice}</p>
            )}
            <div>
              <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1.5">Improve what you&apos;ve typed</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEXT_OPS.map(op => (
                  <button key={op.key} disabled={busy} className={btnBase} onClick={() => handleTextOp(op.key, op.label)}>
                    {op.label}
                  </button>
                ))}
                <button
                  disabled={busy}
                  className={btnBase}
                  onClick={() => {
                    clearError()
                    const { text } = getComposerText()
                    if (!text.trim()) { setInlineNotice('Type something in the composer first.'); return }
                    setInlineNotice(null)
                    setTranslateLang('')
                    setTranslateVariant('plain')
                    setView('translate')
                  }}
                >
                  Translate
                </button>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1.5">Generate from the conversation</p>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  disabled={busy}
                  className={btnBase}
                  onClick={() => { setStaffNoteFor('draft_reply'); setStaffNoteText(''); setView('staffNote') }}
                >
                  Draft Reply
                </button>
                <button
                  disabled={busy}
                  className={btnBase}
                  onClick={() => { setStaffNoteFor('summarize'); setStaffNoteText(''); setView('staffNote') }}
                >
                  Summarize Conversation <span className="font-normal text-walz-muted-strong">(internal only)</span>
                </button>
              </div>
            </div>

            <div className="pt-1 border-t border-walz-border">
              <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1.5 mt-2">More</p>
              <button disabled={busy} className={`${btnBase} w-full flex items-center gap-1.5`} onClick={() => void handleSuggestActions()}>
                <Sparkles className="w-3.5 h-3.5 text-walz-gold flex-shrink-0" /> Suggest an Action
              </button>
            </div>
          </>
        )}
      </div>
    )
  } else if (view === 'translate') {
    body = (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        <button onClick={() => setView('menu')} className="flex items-center gap-1 text-xs font-semibold text-walz-navy hover:text-blue-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <p className="text-sm font-bold text-walz-deep-navy">Translate</p>
        <p className="text-xs text-walz-muted-strong">Which language?</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_LANGUAGES.map(l => (
            <button
              key={l}
              type="button"
              aria-pressed={translateLang === l}
              onClick={() => setTranslateLang(l)}
              className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors ${
                translateLang === l
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-walz-off-white text-walz-navy border-walz-border hover:bg-blue-50'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={translateLang}
          onChange={e => setTranslateLang(e.target.value)}
          placeholder="Or type any language…"
          className="w-full bg-walz-off-white border border-walz-border focus:border-blue-400 rounded-lg px-3 py-2 text-xs text-walz-deep-navy placeholder:text-walz-muted-strong/60 focus:outline-none"
        />
        <div>
          <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1.5">Style</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-pressed={translateVariant === 'plain'}
              onClick={() => setTranslateVariant('plain')}
              className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${
                translateVariant === 'plain' ? 'bg-blue-600 text-white border-blue-600' : 'bg-walz-off-white text-walz-navy border-walz-border'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              aria-pressed={translateVariant === 'professional'}
              onClick={() => setTranslateVariant('professional')}
              className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${
                translateVariant === 'professional' ? 'bg-blue-600 text-white border-blue-600' : 'bg-walz-off-white text-walz-navy border-walz-border'
              }`}
            >
              Professional
            </button>
          </div>
        </div>
        <button
          disabled={!translateLang.trim() || busy}
          onClick={() => handleTextOp(
            translateVariant === 'professional' ? 'professional_translate' : 'translate',
            `Translate to ${translateLang.trim()}`,
            translateLang.trim(),
          )}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Translate
        </button>
      </div>
    )
  } else if (view === 'staffNote' && staffNoteFor) {
    const label = staffNoteFor === 'draft_reply' ? 'Draft a Reply' : 'Summarize Conversation'
    body = (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        <button onClick={() => setView('menu')} className="flex items-center gap-1 text-xs font-semibold text-walz-navy hover:text-blue-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <p className="text-sm font-bold text-walz-deep-navy">{label}</p>
        <label className="block text-xs text-walz-muted-strong">
          Anything specific to mention? (optional)
          <textarea
            value={staffNoteText}
            onChange={e => setStaffNoteText(e.target.value)}
            placeholder={staffNoteFor === 'draft_reply' ? 'e.g. mention we can offer a payment plan' : 'e.g. focus on the visa document status'}
            rows={3}
            className="mt-1 w-full bg-walz-off-white border border-walz-border focus:border-blue-400 rounded-lg px-3 py-2 text-xs text-walz-deep-navy placeholder:text-walz-muted-strong/60 focus:outline-none resize-none"
          />
        </label>
        <div className="flex gap-1.5">
          <button
            disabled={busy}
            onClick={() => handleContextOp(staffNoteFor, label, staffNoteText)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Generate
          </button>
          <button
            disabled={busy}
            onClick={() => handleContextOp(staffNoteFor, label, undefined)}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-walz-border text-walz-navy hover:bg-walz-navy/5 disabled:opacity-40 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    )
  } else if (view === 'review' && review) {
    const errMsg = review.error ?? error ?? 'Jade is unavailable right now. Your original message has not been changed.'
    body = (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        <button onClick={handleCancelReview} className="flex items-center gap-1 text-xs font-semibold text-walz-navy hover:text-blue-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <p className="text-sm font-bold text-walz-deep-navy">{review.operationLabel}</p>

        {review.status === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-walz-muted-strong py-4">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            {review.insertMode === 'insert' ? 'Jade is preparing your reply…' : 'Jade is working on it…'}
          </div>
        )}

        {review.status === 'error' && (
          <>
            {errorBanner(errMsg)}
            <div className="flex gap-1.5">
              <button onClick={review.retry} disabled={busy} className="flex-1 text-xs font-semibold rounded-lg px-3 py-2 border border-walz-border text-walz-navy hover:bg-walz-navy/5 disabled:opacity-40 transition-colors">
                Try Again
              </button>
              <button onClick={handleCancelReview} className="text-xs font-semibold rounded-lg px-3 py-2 text-walz-muted-strong hover:text-walz-navy transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}

        {review.status === 'done' && (
          <>
            {review.warnings && review.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
                {review.warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {w}
                  </p>
                ))}
              </div>
            )}
            {review.protectedFactsPreserved === false && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                A previously-mentioned detail (date, price, or similar) may have changed — check carefully before using.
              </p>
            )}

            {review.original != null && (
              <div>
                <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1">Original</p>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-walz-border bg-walz-off-white px-3 py-2 text-xs text-walz-muted-strong whitespace-pre-wrap">
                  {review.original}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-walz-gold" />
                {review.insertMode === 'none' ? 'Summary (internal only)' : 'Jade suggestion'}
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-walz-border bg-white px-3 py-2 text-xs text-walz-deep-navy whitespace-pre-wrap">
                {review.suggestion}
              </div>
            </div>

            <div className="flex gap-1.5">
              {review.insertMode !== 'none' ? (
                <button onClick={handleUseThis} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  <Check className="w-3.5 h-3.5" /> Use This
                </button>
              ) : (
                <button onClick={() => void handleCopySummary()} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-walz-off-white border border-walz-border text-walz-navy hover:bg-blue-50 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              )}
              <button onClick={review.retry} disabled={busy} className="text-xs font-semibold rounded-lg px-3 py-2 border border-walz-border text-walz-navy hover:bg-walz-navy/5 disabled:opacity-40 transition-colors">
                Try Again
              </button>
              <button onClick={handleCancelReview} className="text-xs font-semibold rounded-lg px-3 py-2 text-walz-muted-strong hover:text-walz-navy transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    )
  } else if (view === 'actions') {
    const st = actionsState
    const errMsg = st?.error ?? error ?? 'Jade is unavailable right now.'
    body = (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        <button onClick={() => setView('menu')} className="flex items-center gap-1 text-xs font-semibold text-walz-navy hover:text-blue-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <p className="text-sm font-bold text-walz-deep-navy flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-walz-gold" /> Suggested Actions
        </p>

        {(!st || st.status === 'loading') && (
          <div className="flex items-center gap-2 text-xs text-walz-muted-strong py-4">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Looking at the conversation…
          </div>
        )}

        {st?.status === 'error' && (
          <>
            {errorBanner(errMsg)}
            <button onClick={() => void handleSuggestActions()} disabled={busy} className="text-xs font-semibold rounded-lg px-3 py-2 border border-walz-border text-walz-navy hover:bg-walz-navy/5 disabled:opacity-40 transition-colors">
              Try Again
            </button>
          </>
        )}

        {st?.status === 'done' && st.actions && st.actions.length === 0 && (
          <p className="text-xs text-walz-muted-strong">No clear next action found in this conversation.</p>
        )}

        {st?.status === 'done' && st.actions && st.actions.map((a, i) => {
          const canLaunch = st.identityResolution === 'VERIFIED' || st.identityResolution === 'LINKED'
          return (
            <div key={i} className="rounded-lg border border-walz-border bg-white px-3 py-2.5 space-y-1.5">
              <p className="text-xs font-bold text-walz-deep-navy">{ACTION_LABELS[a.type]}</p>
              <p className="text-[11px] text-walz-muted-strong">{describeActionFields(a)}</p>
              {canLaunch ? (
                <button
                  onClick={() => launchAction(a.type)}
                  className="text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-3 py-1.5 transition-colors"
                >
                  Review &amp; Start
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                  <span className="text-[11px] text-amber-900">Link this client first to start this action.</span>
                  <button
                    onClick={() => onOpenClientIdentity('find')}
                    className="text-[11px] font-semibold text-amber-900 underline hover:no-underline flex-shrink-0"
                  >
                    Link Client
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const inner = (
    <div ref={panelRef} tabIndex={-1} className="flex-1 min-h-0 flex flex-col outline-none">
      {header}
      {undoBanner}
      {body}
    </div>
  )

  return (
    <>
      {/* Desktop — peer panel replacing the ClientInfo rail's slot while
          open, exactly matching InboxJadeCopilot's own treatment (see file
          header comment for why an earlier floating-card version was
          replaced). page.tsx hides ClientInfo whenever jadeAssistOpen is
          true, so this panel and the rail never occupy the same space. */}
      <div className="hidden lg:flex flex-col w-[400px] flex-shrink-0 min-h-0 h-full bg-white border-l border-walz-border">
        {inner}
      </div>

      {/* Mobile/tablet scrim */}
      <div className="lg:hidden fixed inset-0 bg-black/30 z-[60]" onClick={onClose} aria-hidden="true" />

      {/* Mobile — bottom sheet; z-[60] = Z_INDEX.drawer (lib/admin/chrome.ts) */}
      <div className="lg:hidden fixed inset-x-0 bottom-[var(--walz-bottom-nav-safe,0px)] md:bottom-0 max-h-[80dvh] bg-white border-t border-walz-border rounded-t-2xl shadow-2xl flex flex-col z-[60]">
        {inner}
      </div>
    </>
  )
}
