'use client'

import { useEffect } from 'react'

export default function BankAnalyserError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[BankAnalyser] client error:', error.message, error.digest)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto mt-16 px-6">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-4xl mb-4">🏦</p>
        <h2 className="text-lg font-bold text-red-800 mb-2">
          Could not display analysis results
        </h2>
        <p className="text-sm text-red-700 mb-2 font-mono break-all">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-red-400 mb-4">ID: {error.digest}</p>
        )}
        <p className="text-xs text-red-600 mb-6">
          The analysis may have completed — the raw data is saved in Supabase
          (bank_statement_analyses table). Refresh and try again, or contact support
          with the error ID above.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold hover:bg-red-800 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
