'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Map } from 'lucide-react'

const TRIP_KEY = 'walz_trip_id'

export function TripNavBadge() {
  const [tripId, setTripId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const id = localStorage.getItem(TRIP_KEY)
      setTripId(id)
    } catch {}

    // Listen for storage changes (e.g. trip created in another tab)
    function onStorage(e: StorageEvent) {
      if (e.key === TRIP_KEY) setTripId(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!tripId) return null

  return (
    <Link
      href={`/trip/${tripId}`}
      title="My Trip"
      className="relative p-2 rounded-lg text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50 transition-all"
    >
      <Map className="w-5 h-5" />
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#C9A84C] rounded-full border-2 border-white" />
    </Link>
  )
}
