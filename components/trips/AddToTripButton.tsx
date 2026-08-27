'use client'

import { useState, useCallback } from 'react'
import { PlusCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TripItem {
  type:        string
  title:       string
  cost?:       number
  currency?:   string
  quantity?:   number
  imageUrl?:   string
  externalUrl?: string
  location?:   string
  description?: string
  sourceType?: string
  sourceId?:   string
  metadata?:   Record<string, unknown>
}

interface Props {
  item:       TripItem
  className?: string
  size?:      'sm' | 'md'
  label?:     string
}

const TRIP_KEY    = 'walz_trip_id'
const SESSION_KEY = 'walz_cart_session_id'

function getStoredId(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function setStoredId(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch {}
}

export function AddToTripButton({ item, className, size = 'md', label }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const handleClick = useCallback(async () => {
    if (state === 'loading') return
    setState('loading')

    try {
      const sessionId = getStoredId(SESSION_KEY) ?? undefined
      let tripId = getStoredId(TRIP_KEY)

      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (sessionId) headers['x-walz-session-id'] = sessionId

      // Get or create the current DRAFT trip
      if (!tripId) {
        const res = await fetch('/api/trips/my', {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error('Could not create trip')
        const { trip } = await res.json()
        tripId = trip.id
        setStoredId(TRIP_KEY, tripId!)
      }

      // Add item to trip
      const addRes = await fetch(`/api/trips/${tripId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify(item),
      })

      if (addRes.status === 404) {
        // Trip no longer exists — clear stored id and retry once
        setStoredId(TRIP_KEY, '')
        setState('idle')
        return
      }
      if (!addRes.ok) throw new Error('Could not add item')

      setState('done')
      setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }, [item, state])

  const btnLabel = label ?? 'Save to Trip'
  const sizeClasses = size === 'sm'
    ? 'text-xs px-3 py-1.5 gap-1.5'
    : 'text-sm px-4 py-2 gap-2'

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className={cn(
        'inline-flex items-center font-medium rounded-lg transition-all border',
        state === 'done'
          ? 'bg-green-50 text-green-700 border-green-200'
          : state === 'error'
          ? 'bg-red-50 text-red-600 border-red-200'
          : 'bg-white text-[#0B1F3A] border-[#C9A84C]/40 hover:bg-[#C9A84C]/10 hover:border-[#C9A84C]',
        sizeClasses,
        className,
      )}
    >
      {state === 'loading' ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : state === 'done' ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <PlusCircle className="w-4 h-4" />
      )}
      {state === 'done' ? 'Saved!' : state === 'error' ? 'Try again' : btnLabel}
    </button>
  )
}
