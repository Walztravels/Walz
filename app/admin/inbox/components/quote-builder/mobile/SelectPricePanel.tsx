'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — select-&-price bottom
// sheet. Rendered by MobileWorkspace (and reused as-is by the tablet tree —
// see tablet/TabletWorkspace.tsx's comment on that choice) whenever
// `state.pending` is set, restyled from CreateQuoteDrawer.tsx's inline
// pending-offer block (same fields, same disabled conditions, same copy)
// into a dedicated sheet instead of an inline card.
//
// Accessibility: own focus trap + restore-on-close, a visible close control
// (not just backdrop tap), motion-safe transition.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { RefreshCw, AlertTriangle, X } from 'lucide-react'
import { calculateBookingPrice } from '@/lib/pricing/booking-price'
import type { NormalizedFlightOffer } from '@/lib/travel-search/types'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'
import { fmtMinor, type QuoteBuilderState } from '../useQuoteBuilderState'
import { inputCls, labelCls } from '../styles'

export interface SelectPricePanelProps {
  state: QuoteBuilderState
}

export function SelectPricePanel({ state }: SelectPricePanelProps) {
  const { pending, priceChange } = state
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  // Own open/close lifecycle — independent of CreateQuoteDrawer.tsx's own
  // (which this file must not touch): capture the trigger to restore focus
  // to on close, move focus into the sheet, motion-safe slide-in.
  useEffect(() => {
    if (!pending) { setEntered(false); return }
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
    // Re-run only when a pending offer newly opens/closes, not on every
    // field edit inside it (pending's other fields change constantly via
    // setPending while the sheet stays open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending != null])

  if (!pending) return null

  function close() { state.cancelPending() }

  // Every keydown here calls stopPropagation. CreateQuoteDrawer.tsx (not
  // ours to touch) registers its own Escape/Tab handler on `document`,
  // further up the propagation chain than this sheet's own DOM node —
  // without stopping propagation, Escape would close the WHOLE drawer
  // instead of just this sheet, and Tab would cycle through the screen
  // behind the sheet instead of staying trapped inside it.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (e.key === 'Escape') { close(); return }
    if (e.key !== 'Tab') return
    const panel = sheetRef.current
    if (!panel) return
    const focusables = queryDrawerFocusables(panel).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
    cycleTabFocus(e.nativeEvent, focusables, panel)
  }

  const preview = calculateBookingPrice({
    productType: pending.productType, supplier: pending.supplier,
    netAmount: pending.supplierMinor / 100, currency: pending.offerCurrency,
    markupPercent: pending.markupPercent, serviceFee: Number(pending.serviceFeeMajor) || 0,
  })

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="absolute inset-0 bg-walz-deep-navy/40 motion-safe:transition-opacity motion-safe:duration-200"
        style={{ opacity: entered ? 1 : 0 }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Pricing — ${pending.title}`}
        onKeyDown={onKeyDown}
        className="relative bg-white rounded-t-2xl border-t border-walz-border shadow-2xl max-h-[85vh] overflow-y-auto motion-safe:transition-transform motion-safe:duration-200"
        style={{ transform: entered ? 'translateY(0)' : 'translateY(100%)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className={labelCls}>Pricing — {pending.title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close pricing"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-walz-deep-navy"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm text-walz-deep-navy">
            <span>Supplier / net cost</span>
            <span className="font-mono">{fmtMinor(pending.supplierMinor, pending.offerCurrency)}</span>
          </div>

          {state.pendingCurrencyMismatch && (
            <p role="alert" className="text-xs text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Offer is priced in {pending.offerCurrency}; quote is in {state.currency}.
            </p>
          )}

          {pending.type === 'flight' || pending.type === 'hotel' ? (
            pending.revalidateState === 'checking' ? (
              <p className="text-xs text-walz-muted-strong flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 motion-safe:animate-spin" /> Verifying latest price…</p>
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
                    ? void state.revalidateFlight(pending.token, (pending.offer as NormalizedFlightOffer).providerOfferId)
                    : void state.revalidateHotel(pending.token, pending.extra?.rateKey ?? '')}
                  className="text-xs text-walz-navy underline min-h-[44px]"
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
              <label className={labelCls}>Markup %</label>
              <input
                type="number" min={0} value={pending.markupPercent}
                onChange={e => state.setPending(prev => prev ? { ...prev, markupPercent: Number(e.target.value) || 0 } : prev)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Service fee ({pending.offerCurrency})</label>
              <input
                inputMode="decimal" value={pending.serviceFeeMajor}
                onChange={e => state.setPending(prev => prev ? { ...prev, serviceFeeMajor: e.target.value } : prev)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="text-xs space-y-0.5 border-t border-walz-border pt-2">
            <div className="flex justify-between text-walz-muted-strong"><span>Markup</span><span className="font-mono">{pending.offerCurrency} {preview.markupAmount.toLocaleString()}</span></div>
            <div className="flex justify-between font-semibold text-walz-deep-navy text-sm"><span>Client price</span><span className="font-mono">{pending.offerCurrency} {preview.sellingPrice.toLocaleString()}</span></div>
            <div className="flex justify-between text-walz-muted-strong"><span>Margin</span><span className="font-mono">{preview.marginPercent}%</span></div>
          </div>

          {priceChange ? (
            <div className="rounded-lg border border-walz-gold bg-walz-off-white p-3 space-y-2">
              <p role="alert" className="text-xs text-walz-deep-navy flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                This rate&apos;s price has changed from {fmtMinor(priceChange.oldSellingPriceMinor, priceChange.currency)} to{' '}
                {fmtMinor(priceChange.newSellingPriceMinor, priceChange.currency)}. Accept the new price and add to quote?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={state.cancelPriceChange}
                  className="flex-1 min-h-[48px] rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={() => void state.acceptPriceChange()} disabled={state.liveBusy}
                  className="flex-1 min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50">
                  {state.liveBusy ? 'Adding…' : 'Accept new price & add to quote'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={close}
                className="flex-1 min-h-[48px] rounded-lg border border-walz-border text-walz-navy text-sm font-semibold hover:bg-walz-navy/5 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void state.confirmAddPending()}
                disabled={state.liveBusy || state.pendingCurrencyMismatch || ((pending.type === 'flight' || pending.type === 'hotel') && pending.revalidateState !== 'ok')}
                className="flex-1 min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50"
              >
                {state.liveBusy ? 'Adding…' : 'Add to quote'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
