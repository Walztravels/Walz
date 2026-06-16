'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Admin] client error:', error.message, error.digest)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md w-full text-center">
        <p className="text-3xl mb-4">⚠️</p>
        <h2 className="text-base font-bold text-red-800 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-700 mb-2 font-mono break-all">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-red-400 mb-4">ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-2 px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
