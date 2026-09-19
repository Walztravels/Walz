'use client'

// QUOTE BUILDER V1.2 (desktop) — Visa / Walz Service / Custom Item center
// workspace. All three rail entries route to the SAME underlying mechanism
// (state.items/addItem/removeItem/applyVisaPreset) — there is no dedicated
// "walz_service" item type in the schema, and this component does not add
// one. Only the framing text and (for visa) preset prominence differ per
// variant; the generic form below is shared verbatim.
//
// Deliberately does NOT auto-set state.itemType when the variant changes:
// itemType/itemTitle/itemDesc/itemPrice are shared fields across all three
// framings (per the hook's design), and silently overwriting whatever the
// staff member already picked while flipping between rail entries would be
// more surprising than helpful. Staff choose the type from the dropdown
// exactly as they always could.

import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { ITEM_TYPES } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'
import { UK_VISA_FEES } from '@/lib/config/visa-fees'

export interface ManualItemPanelProps {
  state: QuoteBuilderState
  variant: 'visa' | 'walz_service' | 'manual'
}

const COPY: Record<ManualItemPanelProps['variant'], { title: string; blurb: string }> = {
  visa: {
    title: 'Visa Service',
    blurb: 'Apply a standard UK visa priority fee, or add a custom visa line item below.',
  },
  walz_service: {
    title: 'Walz Service',
    blurb: 'Add a Walz-branded service (concierge, planning, etc.) as a line item on this quote.',
  },
  manual: {
    title: 'Custom Item',
    blurb: 'Add any other line item that doesn’t come from live search — package, tour, or a custom charge.',
  },
}

export function ManualItemPanel({ state, variant }: ManualItemPanelProps) {
  const { itemType, setItemType, itemTitle, setItemTitle, itemDesc, setItemDesc, itemPrice, setItemPrice, addItem, applyVisaPreset, currency } = state
  const copy = COPY[variant]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-walz-deep-navy uppercase tracking-wide">{copy.title}</h2>
        <p className="text-xs text-walz-muted-strong">{copy.blurb}</p>
      </div>

      {variant === 'visa' && (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => applyVisaPreset('priorityService')}
            className="min-h-[44px] px-4 rounded-lg border border-walz-border text-sm font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            UK Priority (£{UK_VISA_FEES.priorityService.amount})
          </button>
          <button
            type="button"
            onClick={() => applyVisaPreset('superPriorityService')}
            className="min-h-[44px] px-4 rounded-lg border border-walz-border text-sm font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            UK Super Priority (£{UK_VISA_FEES.superPriorityService.amount})
          </button>
        </div>
      )}

      <div className="rounded-xl border border-walz-border bg-white p-4 space-y-3">
        <p className={labelCls}>{variant === 'visa' ? 'Or add a custom line item' : 'Custom item'}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="dw-item-type">Type</label>
            <select id="dw-item-type" value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)} className={inputCls}>
              {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-item-price">Price ({currency})</label>
            <input id="dw-item-price" inputMode="decimal" value={itemPrice} onChange={e => setItemPrice(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="dw-item-title">Item title</label>
          <input id="dw-item-title" value={itemTitle} onChange={e => setItemTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="dw-item-desc">Description (optional)</label>
          <input id="dw-item-desc" value={itemDesc} onChange={e => setItemDesc(e.target.value)} className={inputCls} />
        </div>
        <button
          type="button"
          onClick={addItem}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
        >
          {variant === 'manual' ? 'Add Custom Item' : 'Add item'}
        </button>
      </div>
    </div>
  )
}
