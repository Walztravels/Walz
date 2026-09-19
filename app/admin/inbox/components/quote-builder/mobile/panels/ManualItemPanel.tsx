'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — the manual line-item form,
// shared by three of the seven Services entries. visa/walz_service/manual
// all route to the SAME hook state/functions
// (state.items/addItem/removeItem/applyVisaPreset/itemType/itemTitle/
// itemDesc/itemPrice) — no new item type, no new pricing path; only the
// entry framing (which preset buttons show, which items list is filtered
// in) differs per `variant`.
import { Trash2, Stamp } from 'lucide-react'
import { UK_VISA_FEES } from '@/lib/config/visa-fees'
import { ITEM_TYPES, type QuoteBuilderState } from '../../useQuoteBuilderState'
import { inputCls, labelCls } from '../../styles'

export interface ManualItemPanelProps {
  state: QuoteBuilderState
  variant: 'visa' | 'walz_service' | 'manual'
}

export function ManualItemPanel({ state, variant }: ManualItemPanelProps) {
  const {
    items, itemType, setItemType, itemTitle, setItemTitle, itemDesc, setItemDesc, itemPrice, setItemPrice,
    addItem, removeItem, applyVisaPreset, currency,
  } = state

  // QUOTE BUILDER V1.2 closing fix (QA finding #4) — walz_service maps to
  // the ITEM_TYPES value 'custom' (the generic/catch-all Quote item type —
  // matches desktop's ServicesRail.tsx counting predicate exactly; 'package'
  // denotes an actual bundled travel package product, a different, real
  // item type). Deliberately does NOT auto-set itemType when the variant
  // changes — mirrors desktop/panels/ManualItemPanel.tsx's own documented
  // approach: itemType/itemTitle/itemDesc/itemPrice are shared fields across
  // all three framings, and silently overwriting whatever the staff member
  // already picked while flipping between rail entries would be more
  // surprising than helpful (and, as originally written here, never got
  // restored afterwards). Staff choose the type from the dropdown exactly
  // as they always could.
  const relevantItems = items.filter(i => {
    if (variant === 'visa') return i.type === 'visa_service'
    if (variant === 'walz_service') return i.type === 'custom'
    return i.type !== 'visa_service' && i.type !== 'custom'
  })

  return (
    <div className="p-4 space-y-4">
      {variant === 'visa' && (
        <div className="space-y-2">
          <p className={labelCls}>UK visa presets</p>
          <button
            type="button"
            onClick={() => applyVisaPreset('priorityService')}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg border border-walz-border text-sm font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors"
          >
            <Stamp className="w-4 h-4" /> UK Priority (£{UK_VISA_FEES.priorityService.amount}) · {UK_VISA_FEES.priorityService.turnaround}
          </button>
          <button
            type="button"
            onClick={() => applyVisaPreset('superPriorityService')}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg border border-walz-border text-sm font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors"
          >
            <Stamp className="w-4 h-4" /> UK Super Priority (£{UK_VISA_FEES.superPriorityService.amount}) · {UK_VISA_FEES.superPriorityService.turnaround}
          </button>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-dashed border-walz-border p-3">
        <p className={labelCls}>
          {variant === 'manual' ? 'Line item' : variant === 'visa' ? 'Visa service item' : 'Walz service item'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)} className={inputCls}>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input inputMode="decimal" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder={`Price (${currency})`} className={inputCls} />
        </div>
        <input value={itemTitle} onChange={e => setItemTitle(e.target.value)} placeholder="Item title" className={inputCls} />
        <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Description (optional)" className={inputCls} />
        <button
          type="button"
          onClick={addItem}
          className="w-full min-h-[48px] rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
        >
          Add item
        </button>
      </div>

      {relevantItems.length > 0 && (
        <div>
          <p className={labelCls}>Added</p>
          <ul className="space-y-1">
            {relevantItems.map(i => (
              <li key={i.key} className="flex items-center justify-between gap-2 text-sm text-walz-deep-navy rounded-lg border border-walz-border px-3 py-2">
                <span className="min-w-0 truncate">{i.title} <span className="text-walz-muted-strong text-xs">· {currency} {Number(i.priceMajor).toLocaleString()}</span></span>
                <button
                  type="button"
                  onClick={() => removeItem(i.key)}
                  aria-label={`Remove ${i.title}`}
                  className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
