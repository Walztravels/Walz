'use client'

import { useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function MarkAllReadClient({ compact }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function markAll() {
    setLoading(true)
    try {
      await fetch('/api/portal/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button onClick={markAll} disabled={loading}
        className="text-xs text-[#C9A84C] hover:text-[#b8943d] transition-colors disabled:opacity-50">
        {loading ? 'Marking...' : 'Mark all read'}
      </button>
    )
  }

  return (
    <button onClick={markAll} disabled={loading}
      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors disabled:opacity-50">
      <CheckCheck className="w-3.5 h-3.5" />
      {loading ? 'Marking...' : 'Mark all read'}
    </button>
  )
}
