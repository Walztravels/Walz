'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — the full "Your Quote"
// review screen opened via the basket bar's "View Quote" button (mobile),
// and reused as-is inside a persistent sidebar by the tablet tree (see
// tablet/TabletWorkspace.tsx's own comment for why reuse — not a fresh
// implementation — was the right call there).
//
// Button-mapping resolution mirrors CreateQuoteDrawer.tsx EXACTLY (same
// copy, same gating), just restyled for a full-width/sidebar layout instead
// of a narrow drawer column:
//   - no state.quote yet      -> ONE primary "Create Quote" button
//                                (state.handleCreate()) — no separate fake
//                                "Save Draft" path; a draft IS the create.
//   - state.quote, not final  -> "Preview (read-only)" link + "Finalize for
//                                client" (state.handleFinalize()).
//   - state.quote, finalized  -> Copy / Insert / Send / Open-in-editor,
//                                exactly the existing four actions, plus
//                                Create Revision (V1.3, see below).
//
// "Edit" scope decision: useQuoteBuilderState exposes addItem/removeItem
// for manual line items but no update/edit function, so there is no
// business-logic path to "edit" a staged item in place — only Remove
// (state.removeItem, pre-quote only) is wired here. Editing in practice
// means removing and re-adding via the manual item form, which is already
// fully available from the Services screen — this is a scope decision, not
// an oversight. (This does NOT apply to attachedLive items — see V1.3
// below, which closes the equivalent gap for those.)
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  Copy, MessageSquarePlus, Send, RefreshCw, Trash2, ExternalLink, ArrowLeft,
  Pencil, Repeat, X, FilePlus2,
} from 'lucide-react'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'
import {
  CURRENCIES, statusLabel, type QuoteBuilderState, type AttachedLiveItem, type LiveServiceType,
} from '../useQuoteBuilderState'
import { inputCls, labelCls } from '../styles'
import { estimateQuoteTotal } from './QuoteBasketBar'

export interface QuoteBasketSheetProps {
  state: QuoteBuilderState
  /** Mobile passes this (navigates back to the Services screen) and shows
   *  the "Add another service" affordance. The tablet tree omits it — its
   *  service strip is always visible alongside this sidebar, so there is
   *  nothing to "go back" to. */
  onAddAnother?: () => void
  /** V1.3 addition (optional, additive, backward-compatible — matches how
   *  `onAddAnother` above is already optional). Fired after a "Replace" on
   *  an attached item has actually removed it and switched
   *  `state.activeService`/`state.liveTab` to that item's service type
   *  (see `handleReplace` below). MobileWorkspace passes
   *  `() => setScreen('search')` so the mobile flow's own screen state
   *  (this component never touches `MobileScreen` itself) lands back on
   *  that service's search screen, matching what tapping the same service
   *  tile from the Services grid already does. The tablet tree omits it —
   *  both its search form and this sidebar are always visible together, so
   *  selectService() alone (already called unconditionally below) is
   *  enough; there is no separate screen to navigate. */
  onReplaceItem?: () => void
}

// V1.3 — shared bottom-sheet chrome for the two new small mobile steps below
// (Edit Pricing, Currency-change confirmation). Deliberately NOT extracted
// into its own file / SelectPricePanel.tsx is deliberately NOT modified —
// the integration brief scopes all V1.3 mobile work to this file — so this
// reproduces mobile/SelectPricePanel.tsx's own focus-trap/backdrop/dismiss/
// motion-safe-transition markup and lifecycle verbatim (same classes, same
// captureFocusRestoreTarget/cycleTabFocus/queryDrawerFocusables usage) so
// both new sheets are indistinguishable in behavior from that established
// convention, without a second bespoke overlay mechanism per sheet.
function MobileBottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
    // Mount/unmount only — this component is only ever rendered while its
    // sheet should be open (callers gate with `{condition && <.../>}`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (e.key === 'Escape') { onClose(); return }
    if (e.key !== 'Tab') return
    const panel = sheetRef.current
    if (!panel) return
    const focusables = queryDrawerFocusables(panel).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
    cycleTabFocus(e.nativeEvent, focusables, panel)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-walz-deep-navy/40 motion-safe:transition-opacity motion-safe:duration-200"
        style={{ opacity: entered ? 1 : 0 }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
        className="relative bg-white rounded-t-2xl border-t border-walz-border shadow-2xl max-h-[85vh] overflow-y-auto motion-safe:transition-transform motion-safe:duration-200"
        style={{ transform: entered ? 'translateY(0)' : 'translateY(100%)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className={labelCls}>{title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-walz-deep-navy"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

export function QuoteBasketSheet({ state, onAddAnother, onReplaceItem }: QuoteBasketSheetProps) {
  const {
    title, setTitle, currency, setCurrency, validDays, setValidDays,
    items, removeItem, attachedLive, ctx,
    submitting, submitError, quote, finalizing, copied, sending, sent,
    handleCreate, handleFinalize, handleCopy, handleInsert, handleSendToClient,
    isFinalized, recent,
    liveBusy, liveError, removeAttachedItem, updateAttachedItemPricing, recalculateCurrency, createRevision, selectService,
  } = state

  const total = estimateQuoteTotal(state)

  // ── V1.3 local UI state ──────────────────────────────────────────────
  // All of this is pure navigation/presentation state for the three new
  // mobile steps below — never business data (that all still lives on
  // `state`, per this file's existing convention) — so plain useState/
  // useRef here, nothing added to the shared hook.

  // Edit Pricing sheet: which attached item (if any) is being repriced,
  // and the two draft input values shown in it (pre-filled on open,
  // discarded on close/save — the source of truth stays `attachedLive`).
  const [editingItem, setEditingItem] = useState<AttachedLiveItem | null>(null)
  const [editMarkup, setEditMarkup] = useState('')
  const [editServiceFee, setEditServiceFee] = useState('')
  const [editValidationError, setEditValidationError] = useState<string | null>(null)
  // Set true right before calling updateAttachedItemPricing, cleared by
  // the effect below once liveBusy next settles back to false — that
  // effect runs with THIS render's fresh liveBusy/liveError (React effects
  // never see stale state the way a value read after an `await` inside an
  // async function body would), so it's a reliable "did the save just
  // finish, and did it succeed" signal without needing updateAttachedItem
  // Pricing itself to return anything.
  const editSavingRef = useRef(false)

  useEffect(() => {
    if (editSavingRef.current && !liveBusy) {
      editSavingRef.current = false
      if (!liveError) setEditingItem(null)
      // On failure, leave the sheet open — liveError renders inside it below.
    }
  }, [liveBusy, liveError])

  function openEditPricing(item: AttachedLiveItem) {
    setEditingItem(item)
    setEditMarkup(String(item.markupMinor))
    setEditServiceFee(String(item.serviceFeeMinor))
    setEditValidationError(null)
  }
  function saveEditPricing() {
    if (!editingItem) return
    const markupInput = editMarkup.trim()
    const feeInput = editServiceFee.trim()
    const markupMinor = Math.round(Number(markupInput))
    const serviceFeeMinor = Math.round(Number(feeInput))
    if (
      markupInput === '' || feeInput === '' ||
      !Number.isFinite(markupMinor) || !Number.isFinite(serviceFeeMinor) ||
      markupMinor < 0 || serviceFeeMinor < 0
    ) {
      setEditValidationError('Markup and service fee must be non-negative numbers.')
      return
    }
    setEditValidationError(null)
    editSavingRef.current = true
    void updateAttachedItemPricing(editingItem.key, markupMinor, serviceFeeMinor)
  }

  // Replace: remove, then (only once the removal is actually confirmed
  // gone from `attachedLive` — via the same settle-and-check pattern as
  // above) route to that service's search screen.
  const replacingTypeRef = useRef<LiveServiceType | null>(null)
  useEffect(() => {
    if (replacingTypeRef.current && !liveBusy) {
      const type = replacingTypeRef.current
      replacingTypeRef.current = null
      if (!liveError) {
        selectService(type)
        onReplaceItem?.()
      }
      // On failure, liveError renders in the main list below (same channel
      // Remove already used) and the item stays put — nothing to replace.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBusy, liveError])

  function handleReplace(item: AttachedLiveItem) {
    replacingTypeRef.current = item.type
    void removeAttachedItem(item.key)
  }

  // Currency-change confirmation sheet: the target currency awaiting
  // confirmation, or null when no change is pending. While set, the
  // currency `<select>` below displays this instead of `state.currency`;
  // Cancel clears it (select reverts); a successful recalculate is
  // detected the same settle-and-check way as above and also clears it
  // (the select then reads `state.currency`, already updated by
  // recalculateCurrency itself).
  const [pendingCurrency, setPendingCurrency] = useState<typeof CURRENCIES[number] | null>(null)
  const currencySavingRef = useRef(false)
  useEffect(() => {
    if (currencySavingRef.current && !liveBusy) {
      currencySavingRef.current = false
      if (!liveError) setPendingCurrency(null)
    }
  }, [liveBusy, liveError])

  // V1.3 — Quote Currency control. Previously only rendered before a draft
  // quote existed; now reachable at all times (see the always-rendered
  // block below), but the action a selection triggers depends on state:
  //   - isFinalized            -> control is read-only (see render below);
  //                               this handler never fires.
  //   - quote exists AND has
  //     items already            -> open the confirmation sheet;
  //     recalculateCurrency (the only sanctioned path once real pricing
  //     exists against the current currency) runs only on explicit confirm.
  //   - otherwise (no quote yet, or a quote with no items in it yet)
  //                             -> plain state.setCurrency, exactly as
  //     before finalizing — recalculateCurrency requires an existing
  //     quote server-side and would be a silent no-op without one, and
  //     with no items there is nothing whose labeling could be silently
  //     wrong, so there is nothing to confirm.
  function onCurrencyChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as typeof CURRENCIES[number]
    if (next === currency) return
    const hasItems = items.length > 0 || attachedLive.length > 0
    if (quote && hasItems) {
      setPendingCurrency(next)
    } else {
      setCurrency(next)
    }
  }
  function cancelCurrencyChange() { setPendingCurrency(null) }
  function confirmRecalculate() {
    if (!pendingCurrency) return
    currencySavingRef.current = true
    void recalculateCurrency(pendingCurrency)
  }

  // Create Revision: local result/failure display only — createRevision's
  // own return value is the success signal (reliable directly off the
  // await, no settle-and-check needed since we don't have to decide
  // whether to auto-close anything here); `liveError` is rendered directly
  // from props in the JSX below, never copied into local state, so it's
  // never stale.
  const [revisionResult, setRevisionResult] = useState<{ id: string; reference: string } | null>(null)
  const [revisionFailed, setRevisionFailed] = useState(false)
  async function handleCreateRevision() {
    setRevisionFailed(false)
    const revision = await createRevision()
    if (revision) {
      setRevisionResult(revision)
      window.open(`/admin/quotes/${revision.id}`, '_blank')
    } else {
      setRevisionFailed(true)
    }
  }

  // V1.2.1 P1 fix — see desktop/QuoteSummaryPanel.tsx's identical comment.
  // quote.status is a server field that becomes 'sent' the moment Finalize
  // mints a share link (suppressNotifications:true or not) — it does not
  // mean the client was ever actually messaged. The local `sent` flag (set
  // only after handleSendToClient's onSendMessage succeeds) is the truthful
  // signal; this derives the displayed label from that instead.
  const deliveryStatusLabel = !isFinalized ? statusLabel(quote?.status ?? 'draft') : sent ? 'Sent to client' : 'Ready to share'

  return (
    <div className="p-4 space-y-4">
      {onAddAnother && (
        <button type="button" onClick={onAddAnother} className="inline-flex items-center gap-1 text-xs font-semibold text-walz-navy min-h-[44px]">
          <ArrowLeft className="w-4 h-4" /> Add another service
        </button>
      )}

      {!quote && (
        <fieldset disabled={submitting} className="space-y-3 disabled:opacity-60">
          <div>
            <label htmlFor="mq-title" className={labelCls}>Quote title</label>
            <input
              id="mq-title" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={ctx?.contact?.name ? `${ctx.contact.name} travel quote` : 'Travel quote'}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="mq-valid" className={labelCls}>Valid for (days)</label>
            <input id="mq-valid" inputMode="numeric" value={validDays} onChange={e => setValidDays(e.target.value)} className={inputCls} />
          </div>
        </fieldset>
      )}

      {/* V1.3 — Quote Currency, now reachable at all times (see the
          onCurrencyChange handler above for exactly what a selection does
          in each of the three quote states). */}
      <div>
        <label htmlFor="mq-currency" className={labelCls}>Currency</label>
        {isFinalized ? (
          <p id="mq-currency" className="min-h-[44px] flex items-center px-3 rounded-lg border border-walz-border bg-walz-off-white text-sm font-semibold text-walz-deep-navy">
            {currency}
          </p>
        ) : (
          <select
            id="mq-currency"
            value={pendingCurrency ?? currency}
            onChange={onCurrencyChange}
            disabled={liveBusy}
            className={inputCls}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {isFinalized && (
          <p className="text-xs text-walz-muted-strong mt-1">
            Currency is locked once a quote is finalized — create a revision to change it.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className={labelCls}>Line items</p>
        {items.length === 0 && attachedLive.length === 0 && (
          <p className="text-sm text-walz-muted-strong">No items yet — add a service to get started.</p>
        )}
        {items.length > 0 && (
          <ul className="space-y-1">
            {items.map(i => (
              <li key={i.key} className="flex items-center justify-between gap-2 text-sm text-walz-deep-navy rounded-lg border border-walz-border px-3 py-2">
                <span className="min-w-0 truncate">
                  {i.title} <span className="text-walz-muted-strong text-xs">· {currency} {Number(i.priceMajor).toLocaleString()}</span>
                </span>
                {!quote ? (
                  <button type="button" onClick={() => removeItem(i.key)} aria-label={`Remove ${i.title}`}
                    className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="flex-shrink-0 text-green-700 text-xs font-semibold">Added</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* V1.3 — closes the former "known V1.1 backend gap" (attachedLive
            items rendered permanently read-only, mirrored by the desktop
            tree). Remove/Edit pricing/Replace are now wired to the
            item-level backend the hook already exposes; they're hidden
            once isFinalized since the server already rejects mutating a
            non-draft quote's items and there's no reason to offer a
            control that will just error. */}
        {attachedLive.length > 0 && (
          <ul className="space-y-2">
            {attachedLive.map(i => (
              <li key={i.key} className="rounded-lg border border-walz-border px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm text-walz-deep-navy">
                  <span className="min-w-0 truncate">
                    {i.title} <span className="text-walz-muted-strong text-xs">· {i.currency} {(i.sellingPriceMinor / 100).toLocaleString()} (cost {(i.costMinor / 100).toLocaleString()})</span>
                  </span>
                  <span className="flex-shrink-0 text-green-700 text-xs font-semibold">Added</span>
                </div>
                {!isFinalized && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditPricing(i)}
                      disabled={liveBusy}
                      className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg border border-walz-border text-walz-navy text-xs font-semibold hover:bg-walz-navy/5 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit pricing
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReplace(i)}
                      disabled={liveBusy}
                      className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg border border-walz-border text-walz-navy text-xs font-semibold hover:bg-walz-navy/5 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
                    >
                      <Repeat className="w-3.5 h-3.5" /> Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeAttachedItem(i.key)}
                      disabled={liveBusy}
                      aria-label={`Remove ${i.title}`}
                      className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {liveError && !revisionFailed && <p role="alert" className="text-sm text-red-700">{liveError}</p>}
      </div>

      {(items.length > 0 || attachedLive.length > 0) && (
        <p className="text-sm text-walz-muted-strong border-t border-walz-border pt-2">
          Estimated total — server computes the final total: {currency} {total.toLocaleString()}
        </p>
      )}

      {submitError && <p role="alert" className="text-sm text-red-700">{submitError}</p>}

      {!quote ? (
        <>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={submitting}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            {submitting ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Creating…</>) : 'Create Quote'}
          </button>
          <p className="text-xs text-walz-muted-strong">
            Creating saves a draft only — nothing is sent to the client until you finalize and choose to share it.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-walz-border p-3 space-y-1">
            <p className={labelCls}>{isFinalized ? 'Quote ready to share' : 'Draft created'}</p>
            <p className="text-sm font-semibold text-walz-deep-navy">{quote.reference}</p>
            <p className="text-xs text-walz-muted-strong">Status: {deliveryStatusLabel}</p>
          </div>
          {!isFinalized ? (
            <div className="space-y-2">
              <p className="text-sm text-walz-muted-strong">
                Preview link only — finalize to issue the client-facing share link.
              </p>
              <a href={quote.link} target="_blank" rel="noreferrer" className="text-sm text-walz-navy underline inline-flex items-center gap-1">
                Preview (read-only) <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}
              <button
                type="button"
                onClick={() => void handleFinalize()}
                disabled={finalizing}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
              >
                {finalizing ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Finalizing…</>) : 'Finalize for client'}
              </button>
              <p className="text-xs text-walz-muted-strong">
                Finalizing issues a new link; earlier links stop working. Nothing is sent to the client yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-walz-muted-strong">
                Nothing has been sent to the client yet. Choose how to share it:
              </p>
              <a href={quote.link} target="_blank" rel="noreferrer" className="text-sm text-walz-navy underline inline-flex items-center gap-1">
                Preview <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button type="button" onClick={() => void handleCopy()}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" onClick={handleInsert}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                <MessageSquarePlus className="w-4 h-4" /> Insert into reply (does not send)
              </button>
              <button
                type="button"
                onClick={() => void handleSendToClient()}
                disabled={sending || sent}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy text-white text-sm font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60"
              >
                <Send className="w-4 h-4" /> {sent ? 'Sent to client' : sending ? 'Sending…' : 'Send to client'}
              </button>
              <a href={`/admin/quotes/${quote.id}`} target="_blank" rel="noreferrer"
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg text-walz-navy text-sm font-semibold hover:underline">
                Open in quote editor <ExternalLink className="w-4 h-4" />
              </a>

              {/* V1.3 — Create Revision: the sanctioned path for a commercial
                  change (e.g. currency) on a quote that's already finalized/
                  sent. A pure DB operation — never sends anything to the
                  client — so it's offered alongside, not instead of, the
                  share actions above. */}
              <button
                type="button"
                onClick={() => void handleCreateRevision()}
                disabled={liveBusy}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                <FilePlus2 className="w-4 h-4" /> {liveBusy ? 'Working…' : 'Create Revision'}
              </button>
              {revisionResult && (
                <p role="status" className="text-xs text-green-700">
                  Revision {revisionResult.reference} created.
                </p>
              )}
              {revisionFailed && liveError && <p role="alert" className="text-sm text-red-700">{liveError}</p>}
            </div>
          )}
        </div>
      )}

      {/* QUOTE BUILDER V1.2 closing fix (QA finding #5) — "Recent quotes for
          this conversation" was previously desktop-only (QuoteSummaryPanel
          .tsx). Reused here verbatim (same fields, same statusLabel(), same
          comma-formatted total per QA finding #7) so mobile/tablet staff see
          the exact same context; the tablet tree reuses this component
          unmodified, so this one addition covers both. */}
      {recent.length > 0 && (
        <div className="pt-2 border-t border-walz-border">
          <p className={labelCls}>Quotes for this conversation</p>
          <ul className="space-y-2">
            {recent.map(q => (
              <li key={q.id} className="text-sm text-walz-deep-navy flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{q.title} <span className="text-walz-muted-strong text-xs">· {q.currency} {(q.totalMinor / 100).toLocaleString()}</span></span>
                <span className="flex-shrink-0 text-xs text-walz-muted-strong">{statusLabel(q.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* V1.3 — Edit Pricing bottom sheet, mobile/SelectPricePanel.tsx's own
          focus-trap/backdrop/dismiss mechanics (see MobileBottomSheet
          above). Only ever rendered while an item is actively being
          repriced. */}
      {editingItem && (
        <MobileBottomSheet title={`Edit pricing — ${editingItem.title}`} onClose={() => { setEditingItem(null); setEditValidationError(null) }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mq-edit-markup" className={labelCls}>Markup ({editingItem.currency}, minor units)</label>
              <input
                id="mq-edit-markup" type="number" min={0} inputMode="numeric"
                value={editMarkup} onChange={e => setEditMarkup(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="mq-edit-fee" className={labelCls}>Service fee ({editingItem.currency}, minor units)</label>
              <input
                id="mq-edit-fee" type="number" min={0} inputMode="numeric"
                value={editServiceFee} onChange={e => setEditServiceFee(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          {editValidationError && <p role="alert" className="text-sm text-red-700">{editValidationError}</p>}
          {liveError && <p role="alert" className="text-sm text-red-700">{liveError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => { setEditingItem(null); setEditValidationError(null) }}
              className="flex-1 min-h-[48px] rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={saveEditPricing} disabled={liveBusy}
              className="flex-1 min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50">
              {liveBusy ? (<span className="inline-flex items-center gap-1.5"><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Saving…</span>) : 'Save'}
            </button>
          </div>
        </MobileBottomSheet>
      )}

      {/* V1.3 — Currency-change confirmation bottom sheet. Only rendered
          while a currency change is awaiting confirmation (see
          onCurrencyChange above for when that happens). */}
      {pendingCurrency && (
        <MobileBottomSheet title="Change quote currency?" onClose={cancelCurrencyChange}>
          <p className="text-sm font-semibold text-walz-deep-navy">
            {currency} → {pendingCurrency}
          </p>
          <p className="text-sm text-walz-muted-strong">
            Existing quote items will be recalculated using current exchange rates.
          </p>
          {liveError && <p role="alert" className="text-sm text-red-700">{liveError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cancelCurrencyChange}
              className="flex-1 min-h-[48px] rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={confirmRecalculate} disabled={liveBusy}
              className="flex-1 min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50">
              {liveBusy ? (<span className="inline-flex items-center gap-1.5"><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Recalculating…</span>) : `Recalculate in ${pendingCurrency}`}
            </button>
          </div>
        </MobileBottomSheet>
      )}
    </div>
  )
}
