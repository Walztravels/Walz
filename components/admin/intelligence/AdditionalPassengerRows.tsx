'use client'

import { useEffect, useRef } from 'react'
import type { ExtraPassengerRow, PaxType } from '@/lib/dummy-ticket/passengers'
import { blankRowIds, blankRowsWarning } from '@/lib/dummy-ticket/passengers'

export const MAX_EXTRA_PASSENGER_ROWS = 8

const FIELD = 'w-full h-11 sm:h-10 px-3 border border-gray-200 rounded-lg text-sm text-[#0B1F3A] bg-white outline-none focus:border-[#C9A84C]'
const LABEL = 'text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block'

interface Props {
  rows: ExtraPassengerRow[]
  /** ONE updater keyed by row id — every field edit goes through it. */
  onUpdate: (id: string, patch: Partial<Omit<ExtraPassengerRow, 'id'>>) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

/** Additional (non-lead) passenger rows: labelled controls, one explicit object per row. */
export default function AdditionalPassengerRows({ rows, onUpdate, onRemove, onAdd }: Props) {
  const blank = new Set(blankRowIds(rows))
  // Focus the NEW row's name input only after an explicit Add click (never on other re-renders/removals).
  const pendingFocus = useRef(false)
  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    const last = rows[rows.length - 1]
    if (last) document.getElementById(`${last.id}-name`)?.focus()
  }, [rows])
  const warning = blankRowsWarning(blank.size)
  return (
    <div data-testid="additional-passengers">
      {rows.length > 0 && (
        <div className="space-y-3 mb-2">
          {rows.map((row, i) => {
            const n = i + 2
            const isBlank = blank.has(row.id)
            return (
              <div key={row.id} data-row-id={row.id} data-testid={`passenger-row-${n}`}
                className={`rounded-xl border p-3 ${isBlank ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wide">Passenger {n}</span>
                  {isBlank && <span className="text-[11px] font-semibold text-amber-700">No name — will not be included{row.passport.trim() ? ' (passport entered)' : ''}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-[5rem_7rem_minmax(0,1fr)_11rem_2.75rem] gap-2 items-end">
                  <div>
                    <label htmlFor={`${row.id}-title`} className={LABEL}>Title</label>
                    <select id={`${row.id}-title`} aria-label={`Passenger ${n} title`} className={FIELD} value={row.title}
                      onChange={e => onUpdate(row.id, { title: e.target.value })}>
                      <option value="MR">Mr</option>
                      <option value="MRS">Mrs</option>
                      <option value="MISS">Miss</option>
                      <option value="MSTR">Mstr</option>
                      <option value="DR">Dr</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${row.id}-type`} className={LABEL}>Type</label>
                    <select id={`${row.id}-type`} aria-label={`Passenger ${n} type`} className={FIELD} value={row.type}
                      onChange={e => onUpdate(row.id, { type: e.target.value as PaxType })}>
                      <option value="Adult">Adult</option>
                      <option value="Child">Child</option>
                      <option value="Infant">Infant</option>
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={`${row.id}-name`} className={LABEL}>Full name</label>
                    <input id={`${row.id}-name`} aria-label={`Passenger ${n} full name`} className={FIELD} value={row.name}
                      onChange={e => onUpdate(row.id, { name: e.target.value })} placeholder="Full name" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={`${row.id}-passport`} className={LABEL}>Passport (optional)</label>
                    <input id={`${row.id}-passport`} aria-label={`Passenger ${n} passport number`} className={FIELD} value={row.passport}
                      onChange={e => onUpdate(row.id, { passport: e.target.value })} placeholder="Passport number" />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex sm:block justify-end">
                    <button type="button" aria-label={`Remove passenger ${n}`} onClick={() => onRemove(row.id)}
                      className="h-11 sm:h-10 w-11 sm:w-full flex items-center justify-center text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg transition bg-white">
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {warning && (
        <p role="status" data-testid="blank-rows-warning" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
          {warning}
        </p>
      )}
      {rows.length < MAX_EXTRA_PASSENGER_ROWS && (
        <button type="button" onClick={() => { pendingFocus.current = true; onAdd() }}
          className="text-xs text-[#C9A84C] font-semibold hover:text-[#0B1F3A] transition flex items-center gap-1 min-h-[44px] sm:min-h-0">
          + Add Passenger
        </button>
      )}
    </div>
  )
}
