'use client'

import { useCallback, useRef, useState } from 'react'

export interface AddedResult {
  kind: 'flight' | 'hotel'
  booking: Record<string, unknown>
  flights: Record<string, unknown>[]
  hotels: Record<string, unknown>[]
}

export type AddStatus = 'idle' | 'pending' | 'added' | 'duplicate' | 'error'
export interface AddState { status: AddStatus; message?: string; bookingId?: string }

const IDLE: AddState = { status: 'idle' }

/**
 * Add-to-itinerary POST with per-card state. Sends ONLY identifiers (the
 * caller builds the payload). Double-click protected (ref guard + pending),
 * never auto-retries.
 */
export function useResearchAdd(itinId: string, onAdded?: (r: AddedResult) => void, existingBookingIds?: string[]) {
  const [states, setStates] = useState<Record<string, AddState>>({})
  const inFlight = useRef<Set<string>>(new Set())

  const set = (key: string, st: AddState) => setStates((p) => ({ ...p, [key]: st }))

  const add = useCallback(
    async (key: string, payload: Record<string, unknown>, allowDuplicate = false) => {
      if (inFlight.current.has(key)) return
      inFlight.current.add(key)
      set(key, { status: 'pending' })
      try {
        const res = await fetch(`/api/admin/itineraries/${itinId}/research-add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(allowDuplicate ? { ...payload, allowDuplicate: true } : payload),
        })
        let data: Record<string, unknown> = {}
        try { data = await res.json() } catch { /* non-JSON body */ }
        if (res.status === 409 && data.duplicate) {
          set(key, { status: 'duplicate', message: 'Already in this itinerary' })
        } else if (!res.ok || data.ok === false) {
          const expired = res.status === 410 || /expired/i.test(String(data.error ?? ''))
          set(key, {
            status: 'error',
            message: expired
              ? 'This offer has expired. Search again to get a fresh offer.'
              : String(data.error ?? 'Could not add to itinerary. Please try again.'),
          })
        } else {
          const bid = (data.booking as { id?: unknown } | undefined)?.id
          set(key, { status: 'added', bookingId: typeof bid === 'string' ? bid : undefined })
          onAdded?.({
            kind: data.kind as 'flight' | 'hotel',
            booking: (data.booking ?? {}) as Record<string, unknown>,
            flights: (data.flights ?? []) as Record<string, unknown>[],
            hotels: (data.hotels ?? []) as Record<string, unknown>[],
          })
        }
      } catch {
        set(key, { status: 'error', message: 'Network error. Nothing was added. Please try again.' })
      } finally {
        inFlight.current.delete(key)
      }
    },
    [itinId, onAdded],
  )

  const cancel = useCallback((key: string) => set(key, IDLE), [])
  const stateOf = (key: string): AddState => {
    const st = states[key] ?? IDLE
    // Booking removed elsewhere (Bookings tab): the card can be added again.
    if (st.status === 'added' && st.bookingId && existingBookingIds && !existingBookingIds.includes(st.bookingId)) return IDLE
    return st
  }

  return { add, cancel, stateOf }
}
