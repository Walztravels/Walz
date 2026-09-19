'use client'

// QUOTE BUILDER V1.2 (desktop) — "Select & Price" focused pricing panel.
// Rendered as a centered overlay over the center workspace column whenever
// state.pending is set — a deliberate focused step before anything mutates
// the quote, matching the brief. Reproduces exactly what the current
// drawer's inline pending block shows: supplier/net cost, currency-mismatch
// warning, flight/hotel revalidation status, editable markup%/service fee,
// a live calculateBookingPrice preview, and the price-change acceptance
// flow — never auto-accepting a changed price.
//
// Net/supplier cost figures here are staff-only by construction (this whole
// admin workspace is staff-facing) — nothing in this panel is exported or
// shareable with a client.
//
// QUOTE BUILDER V1.2 closing fix (QA finding #1) — dialog/focus semantics
// matching mobile/SelectPricePanel.tsx's own implementation exactly (own
// focus trap + restore-on-close, role="dialog"/aria-modal, Escape ->
// cancelPending, Tab cycled within this panel only via the same
// cycleTabFocus/queryDrawerFocusables helpers, and stopPropagation so these
// keydown events never also trigger CreateQuoteDrawer.tsx's outer Escape/Tab
// handler further up the DOM).

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import type { NormalizedFlightOffer } from '@/lib/travel-search/types'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'
import { fmtMinor, type QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'

export interface SelectPricePanelProps {
  state: QuoteBuilderState
}

export function SelectPricePanel({ state }: SelectPricePanelProps) {
  const {
    pending, setPending, currency, pendingCurrencyMismatch, priceChange,
    revalidateFlight, revalidateHotel, cancelPending, confirmAddPending,
    cancelPriceChange, acceptPriceChange, liveBusy,
  } = state

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // Own open/close lifecycle — independent of CreateQuoteDrawer.tsx's own
  // (which this file must not touch): capture the trigger to restore focus
  // to on close, move focus into the panel. Mirrors mobile/SelectPricePanel
  // .tsx's identical effect (minus the motion-safe slide transition, which
  // this panel's markup never had and this fix does not add).
  useEffect(() => {
    if (!pending) return
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    return () => { restoreRef.current?.focus() }
    // Re-run only when a pending offer newly opens/closes, not on every
    // field edit inside it (pending's other fields change constantly via
    // setPending while the panel stays open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending != null])

  if (!pending) return null

  // Every keydown here calls stopPropagation. CreateQuoteDrawer.tsx (not
  // ours to touch) registers its own Escape/Tab handler on `document`,
  // further up the propagation chain than this panel's own DOM node —
  // without stopping propagation, Escape would close the WHOLE drawer
  // instead of just this panel, and Tab would cycle through the workspace
  // behind the panel instead of staying trapped inside it.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (e.key === 'Escape') { cancelPending(); return }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = queryDrawerFocusables(panel).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
    cycleTabFocus(e.nativeEvent, focusables, panel)
  }

  const preview = calculateBookingPrice({
    productType: pending.productType, supplier: pending.supplier,
    netAmount: pending.supplierMinor / 100, currency: pending.offerCurrency,
    markupPercent: pending.markupPercent, serviceFee: Number(pending.serviceFeeMajor) || 0,
  })

  const addDisabled = liveBusy || pendingCurrencyMismatch
    || ((pending.type === 'flight' || pending.type === 'hotel') && pending.revalidateState !== 'ok')

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-walz-deep-navy/40 p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Pricing — ${pending.title}`}
        onKeyDown={onKeyDown}
        className="w-full max-w-lg rounded-2xl border border-walz-gold/60 bg-white shadow-2xl p-5 space-y-3 mt-4"
      >
        <div className="flex items-start justify-between gap-2">
          <p className={labelCls}>Pricing — {pending.title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={cancelPending}
            aria-label="Close pricing panel"
            className="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center text-walz-muted-strong hover:text-walz-deep-navy rounded focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-between text-sm text-walz-deep-navy">
          <span>Supplier / net cost</span>
          <span className="font-mono">{fmtMinor(pending.supplierMinor, pending.offerCurrency)}</span>
        </div>

        {pendingCurrencyMismatch && (
          <p role="alert" className="text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Offer is priced in {pending.offerCurrency}; quote is in {currency}.
          </p>
        )}

        {pending.type === 'flight' || pending.type === 'hotel' ? (
          pending.revalidateState === 'checking' ? (
            <p className="text-xs text-walz-muted-strong flex items-center gap-1">
              <RefreshCw className="w-3 h-3 motion-safe:animate-spin" /> Verifying latest price…
            </p>
          ) : pending.revalidateState === 'stale' ? (
            <p role="alert" className="text-xs text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {pending.revalidateMessage ?? 'This offer has changed. Please re-search.'}
            </p>
          ) : pending.revalidateState === 'error' ? (
            <div className="space-y-1">
              <p role="alert" className="text-xs text-red-700">{pending.revalidateMessage ?? 'Could not verify this offer.'}</p>
              <button
                type="button"
                onClick={() => pending.type === 'flight'
                  ? void revalidateFlight(pending.token, (pending.offer as NormalizedFlightOffer).providerOfferId)
                  : void revalidateHotel(pending.token, pending.extra?.rateKey ?? '')}
                className="text-xs text-walz-navy underline focus:outline-none focus:ring-2 focus:ring-walz-gold/60 rounded"
              >
                Retry check
              </button>
            </div>
          ) : (
            <p className="text-xs text-green-700">Verified — price and availability current.</p>
          )
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="dw-sp-markup">Markup %</label>
            <input
              id="dw-sp-markup"
              type="number"
              min={0}
              value={pending.markupPercent}
              onChange={e => setPending(prev => prev ? { ...prev, markupPercent: Number(e.target.value) || 0 } : prev)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-sp-fee">Service fee ({pending.offerCurrency})</label>
            <input
              id="dw-sp-fee"
              inputMode="decimal"
              value={pending.serviceFeeMajor}
              onChange={e => setPending(prev => prev ? { ...prev, serviceFeeMajor: e.target.value } : prev)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="text-sm space-y-1 border-t border-walz-border pt-3">
          <div className="flex justify-between text-walz-muted-strong">
            <span>Markup</span><span className="font-mono">{pending.offerCurrency} {preview.markupAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold text-walz-deep-navy">
            <span>Client price</span><span className="font-mono">{pending.offerCurrency} {preview.sellingPrice.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-walz-muted-strong">
            <span>Margin</span><span className="font-mono">{preview.marginPercent}%</span>
          </div>
        </div>

        {priceChange ? (
          <div className="rounded-lg border border-walz-gold bg-walz-off-white p-3 space-y-2">
            <p role="alert" className="text-xs text-walz-deep-navy flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              This rate&apos;s price has changed from {fmtMinor(priceChange.oldSellingPriceMinor, priceChange.currency)} to{' '}
              {fmtMinor(priceChange.newSellingPriceMinor, priceChange.currency)}. Accept the new price and add to quote?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelPriceChange}
                className="flex-1 min-h-[44px] rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void acceptPriceChange()}
                disabled={liveBusy}
                className="flex-1 min-h-[44px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                {liveBusy ? 'Adding…' : 'Accept new price & add to quote'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelPending}
              className="flex-1 min-h-[44px] rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmAddPending()}
              disabled={addDisabled}
              className="flex-1 min-h-[44px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
            >
              {liveBusy ? 'Adding…' : 'Add to Quote'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
