'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function ActivityError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-[#C9A84C] text-sm font-semibold uppercase tracking-wider mb-3">
          Activity unavailable
        </p>
        <h1 className="text-white text-2xl font-bold mb-3">
          We couldn&apos;t load this activity
        </h1>
        <p className="text-white/50 text-sm mb-6">
          This experience may no longer be available or the page failed to load.
          Try again or browse other activities.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-amber-500 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/activities"
            className="flex items-center gap-1.5 border border-white/20 text-white/70 px-5 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> All activities
          </Link>
        </div>
      </div>
    </div>
  )
}
