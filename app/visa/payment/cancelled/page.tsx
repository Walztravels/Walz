'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { XCircle } from 'lucide-react'
import { Suspense } from 'react'

function CancelledContent() {
  const ref = useSearchParams().get('ref') ?? ''

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Payment Cancelled</h1>
        <p className="text-gray-500 text-sm mb-6">
          No charge was made. Your application has been saved —
          you can complete payment at any time.
        </p>
        {ref && (
          <p className="text-xs text-gray-400 mb-6">
            Reference: <span className="font-mono font-bold text-[#0B1F3A]">{ref}</span>
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.history.back()}
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold py-3.5 rounded-2xl hover:bg-[#b8973f] transition-colors text-sm">
            Try Again
          </button>
          <a
            href="https://wa.me/447398753797?text=Hi, I need help paying for my visa application"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-200 text-gray-500 py-3 rounded-2xl hover:bg-gray-50 transition-colors text-sm block">
            Pay via WhatsApp Instead
          </a>
          <Link href="/" className="text-gray-400 text-xs py-2 hover:text-gray-600 transition-colors block">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function CancelledPage() {
  return <Suspense><CancelledContent /></Suspense>
}
