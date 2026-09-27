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
//
// QUOTE BUILDER V1.4 (Agent C) — ONE exception to "the generic form is
// shared verbatim": selecting itemType 'flight' swaps the generic
// price-only fields for a structured flight form (airline, per-journey
// segments, cabin, baggage, cost/price split) and submits through
// addManualFlightItem() instead of addItem() — a manual flight is
// persisted immediately as one QuoteFlightOption+QuoteItem server-side (see
// useQuoteBuilderState.ts's addManualFlightItem for the full rationale),
// not deferred into the flat items[] draft array. Every other itemType is
// completely untouched.

import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { ITEM_TYPES, MANUAL_FLIGHT_CABINS, MAX_MANUAL_FLIGHT_LEGS } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
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

function journeyLabel(i: number, legCount: number): string {
  if (i === 0) return 'Outbound journey'
  if (legCount === 2) return 'Return journey'
  return `Leg ${i + 1}`
}

export function ManualItemPanel({ state, variant }: ManualItemPanelProps) {
  const {
    itemType, setItemType, itemTitle, setItemTitle, itemDesc, setItemDesc, itemPrice, setItemPrice, addItem, applyVisaPreset, currency,
    mfAirline, setMfAirline, mfAirlineCode, setMfAirlineCode, mfCabin, setMfCabin, mfFareClass, setMfFareClass,
    mfBaggage, setMfBaggage, mfCostMajor, setMfCostMajor, mfPriceMajor, setMfPriceMajor, mfNotes, setMfNotes,
    mfLegs, mfUpdateLeg, mfAddLeg, mfRemoveLeg, mfBusy, mfError, addManualFlightItem,
  } = state
  const copy = COPY[variant]
  const isFlight = itemType === 'flight'

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
          {!isFlight && (
            <div>
              <label className={labelCls} htmlFor="dw-item-price">Price ({currency})</label>
              <input id="dw-item-price" inputMode="decimal" value={itemPrice} onChange={e => setItemPrice(e.target.value)} className={inputCls} />
            </div>
          )}
        </div>

        {isFlight ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="dw-mf-airline">Airline</label>
                <input id="dw-mf-airline" value={mfAirline} onChange={e => setMfAirline(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="dw-mf-airline-code">Airline code (optional)</label>
                <input id="dw-mf-airline-code" value={mfAirlineCode} onChange={e => setMfAirlineCode(e.target.value.toUpperCase())} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="dw-mf-cabin">Cabin</label>
                <select id="dw-mf-cabin" value={mfCabin} onChange={e => setMfCabin(e.target.value as typeof mfCabin)} className={inputCls}>
                  {MANUAL_FLIGHT_CABINS.map(c => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="dw-mf-fareclass">Booking class (optional)</label>
                <input id="dw-mf-fareclass" placeholder="e.g. Y, fare basis" value={mfFareClass} onChange={e => setMfFareClass(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="dw-mf-baggage">Baggage</label>
              <input id="dw-mf-baggage" placeholder="e.g. 1 x 23kg checked" value={mfBaggage} onChange={e => setMfBaggage(e.target.value)} className={inputCls} />
            </div>

            {mfLegs.map((leg, i) => (
              <div key={i} className="rounded-lg border border-walz-border/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className={labelCls}>{journeyLabel(i, mfLegs.length)}</p>
                  {i > 0 && (
                    <button type="button" onClick={() => mfRemoveLeg(i)} className="text-xs font-semibold text-red-700 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Origin (e.g. LOS)" value={leg.originCode} onChange={e => mfUpdateLeg(i, { originCode: e.target.value.toUpperCase() })} className={inputCls} />
                  <input placeholder="Destination (e.g. DXB)" value={leg.destinationCode} onChange={e => mfUpdateLeg(i, { destinationCode: e.target.value.toUpperCase() })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" aria-label="Departure date" value={leg.departDate} onChange={e => mfUpdateLeg(i, { departDate: e.target.value })} className={inputCls} />
                  <input type="time" aria-label="Departure time" value={leg.departTime} onChange={e => mfUpdateLeg(i, { departTime: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" aria-label="Arrival date" value={leg.arriveDate} onChange={e => mfUpdateLeg(i, { arriveDate: e.target.value })} className={inputCls} />
                  <input type="time" aria-label="Arrival time" value={leg.arriveTime} onChange={e => mfUpdateLeg(i, { arriveTime: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Flight number" value={leg.flightNumber} onChange={e => mfUpdateLeg(i, { flightNumber: e.target.value })} className={inputCls} />
                  <input type="number" min={0} max={4} placeholder="Stops" value={leg.stops} onChange={e => mfUpdateLeg(i, { stops: e.target.value })} className={inputCls} />
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              {mfLegs.length === 1 && (
                <button type="button" onClick={mfAddLeg} className="text-xs font-semibold text-walz-navy hover:underline">
                  + Add Return
                </button>
              )}
              {mfLegs.length >= 2 && mfLegs.length < MAX_MANUAL_FLIGHT_LEGS && (
                <button type="button" onClick={mfAddLeg} className="text-xs font-semibold text-walz-navy hover:underline">
                  + Add Leg
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="dw-mf-cost">Supplier cost ({currency})</label>
                <input id="dw-mf-cost" inputMode="decimal" value={mfCostMajor} onChange={e => setMfCostMajor(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="dw-mf-price">Client selling price ({currency})</label>
                <input id="dw-mf-price" inputMode="decimal" value={mfPriceMajor} onChange={e => setMfPriceMajor(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="dw-mf-notes">Notes (optional, internal)</label>
              <input id="dw-mf-notes" value={mfNotes} onChange={e => setMfNotes(e.target.value)} className={inputCls} />
            </div>
            {mfError && <p className="text-xs font-semibold text-red-700">{mfError}</p>}
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls} htmlFor="dw-item-title">Item title</label>
              <input id="dw-item-title" value={itemTitle} onChange={e => setItemTitle(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="dw-item-desc">Description (optional)</label>
              <input id="dw-item-desc" value={itemDesc} onChange={e => setItemDesc(e.target.value)} className={inputCls} />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={isFlight ? addManualFlightItem : addItem}
          disabled={isFlight && mfBusy}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60 disabled:opacity-50"
        >
          {isFlight ? (mfBusy ? 'Adding flight…' : 'Add Manual Flight') : variant === 'manual' ? 'Add Custom Item' : 'Add item'}
        </button>
      </div>
    </div>
  )
}
