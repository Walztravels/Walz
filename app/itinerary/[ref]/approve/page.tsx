'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

// Legacy approve page — redirects to the main proposal page.
// GA5+: acceptance is handled in-page. The approval token is embedded
// server-side in the DTO; clients no longer need a token in the URL.
// Any old-style /approve?token=xxx links still work because the server
// reads the token from the database, not the URL.
export default function LegacyApprovePage() {
  const params = useParams<{ ref: string }>()

  useEffect(() => {
    window.location.replace(`/itinerary/${params.ref}`)
  }, [params.ref])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 text-sm">Redirecting to your itinerary…</p>
      </div>
    </main>
  )
}
