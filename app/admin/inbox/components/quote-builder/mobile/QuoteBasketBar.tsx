'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — persistent bottom basket
// bar. Rendered by MobileWorkspace (and reused, unmodified, by the tablet
// tree's own basket UI where it makes sense) whenever any item exists on
// `state` — never local component state, so nothing here can ever diverge
// from what the rest of the workspace shows.

import type { QuoteBuilderState } from '../useQuoteBuilderState'

// Client-side ESTIMATE only — the server computes the authoritative total on
// create/finalize (exactly the "Estimated total — server computes the final
// total" discipline the pre-V1.2 drawer already used for state.items alone;
// this just also folds in state.attachedLive's already-priced selling
// price, since the mobile basket needs one combined number). Never
// re-derives pricing, never calls a pricing function of its own — pure
// arithmetic over numbers `state` already computed.
export function estimateQuoteTotal(state: QuoteBuilderState): number {
  const itemsTotal = state.items.reduce((sum, i) => sum + (Number(i.priceMajor) || 0), 0)
  const liveTotal = state.attachedLive.reduce((sum, i) => sum + i.sellingPriceMinor / 100, 0)
  return itemsTotal + liveTotal
}

export interface QuoteBasketBarProps {
  state: QuoteBuilderState
  onView: () => void
}

// Sits inside MobileWorkspace's own `fixed inset-0` root (see that file's
// header comment for the full z-index rationale) — a `fixed`-positioned
// ancestor with its own z-index establishes a fresh stacking context, so
// the z-20 here only has to out-rank ITS OWN siblings inside that
// workspace (the current screen's content, which is unpositioned, and
// nothing else) and stay below SelectPricePanel's z-30 overlay. It never
// needs to reference lib/admin/chrome.ts's global Z_INDEX scale directly —
// that scale only governs where the WHOLE workspace sits relative to the
// rest of the admin shell, which MobileWorkspace's own root z-index
// handles once for everything inside it.
export function QuoteBasketBar({ state, onView }: QuoteBasketBarProps) {
  const count = state.items.length + state.attachedLive.length
  const total = estimateQuoteTotal(state)
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-3 border-t border-walz-border bg-walz-deep-navy px-4 min-h-[56px] motion-safe:transition-transform motion-safe:duration-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="text-sm text-white font-semibold truncate">
        {count} item{count === 1 ? '' : 's'} · Est. {state.currency} {total.toLocaleString()}
      </span>
      <button
        type="button"
        onClick={onView}
        className="flex-shrink-0 min-h-[44px] px-4 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
      >
        View Quote
      </button>
    </div>
  )
}
