'use client'

// QUOTE BUILDER V1.2 (desktop) — 7-entry Trip Services rail (left column).
//
// Counting rule for the 3 manual-form-backed entries (no dedicated
// "walz_service" item type exists in the schema — this is a pure UI framing
// choice, not a data model change):
//   - visa:          state.items with type === 'visa_service'
//   - walz_service:  state.items with type === 'custom' (the closest
//                     existing ITEM_TYPES value to a generic "Walz service"
//                     line item — itemType's own default value)
//   - manual:        every other state.items entry (flight/hotel/activity/
//                     transfer/tour/package typed manual items included —
//                     they didn't come from live search, so they belong
//                     here, not under those live-search rail counts)
import { Activity, Car, FileText, Hotel, Plane, Sparkles, Stamp } from 'lucide-react'
import type { QuoteBuilderState, ServiceKey } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'

export interface ServicesRailProps {
  state: QuoteBuilderState
}

const ROWS: { key: ServiceKey; label: string; icon: typeof Plane }[] = [
  { key: 'flight', label: 'Flight', icon: Plane },
  { key: 'hotel', label: 'Hotel', icon: Hotel },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'transfer', label: 'Transfer', icon: Car },
  { key: 'visa', label: 'Visa', icon: Stamp },
  { key: 'walz_service', label: 'Walz Service', icon: Sparkles },
  { key: 'manual', label: 'Manual Item', icon: FileText },
]

function countFor(state: QuoteBuilderState, key: ServiceKey): number {
  if (key === 'flight' || key === 'hotel' || key === 'activity' || key === 'transfer') {
    return state.attachedLive.filter(i => i.type === key).length
  }
  if (key === 'visa') return state.items.filter(i => i.type === 'visa_service').length
  if (key === 'walz_service') return state.items.filter(i => i.type === 'custom').length
  // manual — everything not claimed by visa/walz_service above
  return state.items.filter(i => i.type !== 'visa_service' && i.type !== 'custom').length
}

export function ServicesRail({ state }: ServicesRailProps) {
  return (
    <nav aria-label="Trip services" className="p-2 space-y-1">
      {ROWS.map(row => {
        const active = state.activeService === row.key
        const count = countFor(state, row.key)
        const Icon = row.icon
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => state.selectService(row.key)}
            aria-current={active ? 'true' : undefined}
            className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60
              ${active ? 'bg-walz-navy text-white' : 'text-walz-navy hover:bg-walz-navy/5'}`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-walz-gold' : 'text-walz-muted-strong'}`} />
            <span className="flex-1 text-left truncate">{row.label}</span>
            {count > 0 && (
              <span
                className={`flex-shrink-0 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center
                  ${active ? 'bg-walz-gold text-walz-deep-navy' : 'bg-walz-navy/10 text-walz-navy'}`}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
