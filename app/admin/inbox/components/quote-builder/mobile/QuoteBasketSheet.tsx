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
//                                exactly the existing four actions.
//
// "Edit" scope decision: useQuoteBuilderState exposes addItem/removeItem
// for manual line items but no update/edit function, so there is no
// business-logic path to "edit" a staged item in place — only Remove
// (state.removeItem, pre-quote only) is wired here. Editing in practice
// means removing and re-adding via the manual item form, which is already
// fully available from the Services screen — this is a scope decision, not
// an oversight.
import { Copy, MessageSquarePlus, Send, RefreshCw, Trash2, ExternalLink, ArrowLeft } from 'lucide-react'
import { CURRENCIES, statusLabel, type QuoteBuilderState } from '../useQuoteBuilderState'
import { inputCls, labelCls } from '../styles'
import { estimateQuoteTotal } from './QuoteBasketBar'

export interface QuoteBasketSheetProps {
  state: QuoteBuilderState
  /** Mobile passes this (navigates back to the Services screen) and shows
   *  the "Add another service" affordance. The tablet tree omits it — its
   *  service strip is always visible alongside this sidebar, so there is
   *  nothing to "go back" to. */
  onAddAnother?: () => void
}

export function QuoteBasketSheet({ state, onAddAnother }: QuoteBasketSheetProps) {
  const {
    title, setTitle, currency, setCurrency, validDays, setValidDays,
    items, removeItem, attachedLive, ctx,
    submitting, submitError, quote, finalizing, copied, sending, sent,
    handleCreate, handleFinalize, handleCopy, handleInsert, handleSendToClient,
    isFinalized, recent,
  } = state

  const total = estimateQuoteTotal(state)

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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mq-currency" className={labelCls}>Currency</label>
              <select id="mq-currency" value={currency} onChange={e => setCurrency(e.target.value as typeof currency)} className={inputCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mq-valid" className={labelCls}>Valid for (days)</label>
              <input id="mq-valid" inputMode="numeric" value={validDays} onChange={e => setValidDays(e.target.value)} className={inputCls} />
            </div>
          </div>
        </fieldset>
      )}

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
        {/* Known V1.1 backend gap (mirrored by the desktop tree, per the
            shared V1.2 scope resolution) — live-search items attach via
            add-to-quote and useQuoteBuilderState exposes no corresponding
            removal route, so they render read-only "Added" here, exactly
            as they always have in the pre-V1.2 drawer. */}
        {attachedLive.length > 0 && (
          <ul className="space-y-1">
            {attachedLive.map(i => (
              <li key={i.key} className="flex items-center justify-between gap-2 text-sm text-walz-deep-navy rounded-lg border border-walz-border px-3 py-2">
                <span className="min-w-0 truncate">
                  {i.title} <span className="text-walz-muted-strong text-xs">· {i.currency} {(i.sellingPriceMinor / 100).toLocaleString()} (cost {(i.costMinor / 100).toLocaleString()})</span>
                </span>
                <span className="flex-shrink-0 text-green-700 text-xs font-semibold">Added</span>
              </li>
            ))}
          </ul>
        )}
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
            <p className="text-xs text-walz-navy break-all">{quote.link}</p>
            <p className="text-xs text-walz-muted-strong">Status: {statusLabel(quote.status)}</p>
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
    </div>
  )
}
