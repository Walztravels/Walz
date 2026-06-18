'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[App Error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-[#0B1F3A] mb-2">Something went wrong</h1>
        <p className="text-gray-400 text-sm mb-8">
          We encountered an unexpected error. Our team has been notified.
          {error.digest && (
            <span className="block mt-1 font-mono text-xs">Error ID: {error.digest}</span>
          )}
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-2xl hover:bg-[#b8973f] transition-colors text-sm">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-500 py-3 rounded-2xl hover:bg-gray-50 transition-colors text-sm">
            <Home className="w-4 h-4" /> Home
          </Link>
        </div>
      </div>
    </div>
  )
}
