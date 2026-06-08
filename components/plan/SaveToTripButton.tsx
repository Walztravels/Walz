'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Bookmark, BookmarkCheck, Plus, ChevronDown, Loader2, Map } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────
export type SaveToTripPayload = {
  type: 'TOUR' | 'HOTEL' | 'FLIGHT' | 'ACTIVITY' | 'CUSTOM'
  title: string
  description?: string
  location?: string
  imageUrl?: string
  externalUrl?: string
  cost?: number
  currency?: string
  metadata?: Record<string, unknown>
  sourceType?: string
  sourceId?: string
}

interface Props {
  item: SaveToTripPayload
  /** visual variant */
  variant?: 'icon' | 'button' | 'pill'
  className?: string
}

type Trip = {
  id: string
  title: string
  destination: string
  status: string
}

// ── Component ─────────────────────────────────────────────────────────────
export function SaveToTripButton({ item, variant = 'button', className }: Props) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [open, setOpen]     = useState(false)
  const [trips, setTrips]   = useState<Trip[]>([])
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function fetchTrips() {
    setLoading(true)
    try {
      const res = await fetch('/api/trips')
      const data = await res.json()
      setTrips(data.trips ?? [])
    } catch {
      setTrips([])
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    if (status === 'unauthenticated') {
      router.push('/portal/login?redirect=/plan/library')
      return
    }
    if (!open) fetchTrips()
    setOpen(v => !v)
  }

  async function saveToTrip(tripId: string) {
    setSaving(true)
    try {
      await fetch(`/api/trips/${tripId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      setSaved(true)
      setOpen(false)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  async function createNewAndSave() {
    setSaving(true)
    setOpen(false)
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `My ${item.type === 'TOUR' ? 'Tour' : 'Trip'} — ${item.title}`,
          destination: item.location ?? 'To be decided',
        }),
      })
      const data = await res.json()
      if (data.trip?.id) {
        await fetch(`/api/trips/${data.trip.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const iconClass = 'w-4 h-4 flex-shrink-0'

  if (variant === 'icon') {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={handleOpen}
          title="Save to trip"
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
            saved
              ? 'bg-[#C9A84C] text-[#0B1F3A]'
              : 'bg-black/40 text-white hover:bg-[#C9A84C] hover:text-[#0B1F3A]',
            className
          )}
        >
          {saving ? (
            <Loader2 className={cn(iconClass, 'animate-spin')} />
          ) : saved ? (
            <BookmarkCheck className={iconClass} />
          ) : (
            <Bookmark className={iconClass} />
          )}
        </button>
        <Dropdown
          open={open}
          loading={loading}
          trips={trips}
          onSave={saveToTrip}
          onNew={createNewAndSave}
        />
      </div>
    )
  }

  if (variant === 'pill') {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={handleOpen}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
            saved
              ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
              : 'bg-transparent border-white/30 text-white/70 hover:border-[#C9A84C] hover:text-[#C9A84C]',
            className
          )}
        >
          {saving ? (
            <Loader2 className={cn(iconClass, 'animate-spin')} />
          ) : saved ? (
            <BookmarkCheck className={iconClass} />
          ) : (
            <Bookmark className={iconClass} />
          )}
          {saved ? 'Saved!' : 'Save'}
          {!saved && !saving && <ChevronDown className="w-3 h-3" />}
        </button>
        <Dropdown
          open={open}
          loading={loading}
          trips={trips}
          onSave={saveToTrip}
          onNew={createNewAndSave}
        />
      </div>
    )
  }

  // Default: 'button'
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleOpen}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
          saved
            ? 'bg-[#C9A84C]/20 border border-[#C9A84C] text-[#C9A84C]'
            : 'bg-white/10 border border-white/20 text-white hover:bg-[#C9A84C]/20 hover:border-[#C9A84C] hover:text-[#C9A84C]',
          className
        )}
      >
        {saving ? (
          <Loader2 className={cn(iconClass, 'animate-spin')} />
        ) : saved ? (
          <BookmarkCheck className={iconClass} />
        ) : (
          <Map className={iconClass} />
        )}
        {saved ? 'Saved to trip!' : 'Save to trip'}
        {!saved && !saving && <ChevronDown className="w-3 h-3" />}
      </button>
      <Dropdown
        open={open}
        loading={loading}
        trips={trips}
        onSave={saveToTrip}
        onNew={createNewAndSave}
      />
    </div>
  )
}

// ── Dropdown ──────────────────────────────────────────────────────────────
function Dropdown({
  open, loading, trips, onSave, onNew,
}: {
  open: boolean
  loading: boolean
  trips: Trip[]
  onSave: (id: string) => void
  onNew: () => void
}) {
  if (!open) return null

  const active = trips.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')

  return (
    <div className="absolute right-0 top-full mt-2 w-64 bg-[#0B1F3A] border border-white/15 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Save to trip</p>
      </div>

      <div className="max-h-52 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-white/40" />
          </div>
        ) : active.length === 0 ? (
          <p className="text-xs text-white/40 px-4 py-3">No active trips yet</p>
        ) : (
          active.map(trip => (
            <button
              key={trip.id}
              onClick={() => onSave(trip.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-white/8 transition-colors"
            >
              <p className="text-sm text-white font-medium leading-tight">{trip.title}</p>
              <p className="text-xs text-white/40 mt-0.5">{trip.destination}</p>
            </button>
          ))
        )}
      </div>

      <div className="border-t border-white/10 p-2">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Create new trip
        </button>
      </div>
    </div>
  )
}
