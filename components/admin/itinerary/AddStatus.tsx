'use client'

import type { AddState } from './useResearchAdd'

export const addBtnCls =
  'min-h-[44px] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap'
const ghostBtnCls =
  'min-h-[44px] border border-white/20 text-white/80 hover:bg-white/10 text-sm font-semibold px-4 py-2 rounded-lg transition-colors'

/** Add button + inline duplicate / error / success states for one card or rate. */
export function AddControl({
  state, onAdd, onAddAnyway, onCancel, onViewBookings, disabled, disabledReason,
}: {
  state: AddState
  onAdd: () => void
  onAddAnyway: () => void
  onCancel: () => void
  onViewBookings?: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  if (state.status === 'added') {
    return (
      <div className="flex flex-wrap items-center gap-3" role="status">
        <span className="text-green-400 text-sm font-semibold">Added to itinerary</span>
        {onViewBookings && (
          <button type="button" onClick={onViewBookings} className={ghostBtnCls}>View in Bookings</button>
        )}
      </div>
    )
  }
  if (state.status === 'duplicate') {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2" role="alert">
        <p className="text-amber-300 text-sm">{state.message ?? 'Already in this itinerary'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAddAnyway} className={addBtnCls}>Add anyway</button>
          <button type="button" onClick={onCancel} className={ghostBtnCls}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {state.status === 'error' && (
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2" role="alert">{state.message}</p>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || state.status === 'pending'}
        title={disabled ? disabledReason : undefined}
        className={`${addBtnCls} w-full sm:w-auto`}
      >
        {state.status === 'pending' ? 'Adding…' : 'Add to Itinerary'}
      </button>
      {disabled && disabledReason && <p className="text-white/40 text-xs">{disabledReason}</p>}
    </div>
  )
}
