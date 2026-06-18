'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { Suspense } from 'react'

function SuccessContent() {
  const p   = useSearchParams()
  const ref = p.get('ref') ?? ''

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Payment Confirmed!</h1>
        <p className="text-gray-500 text-sm mb-4">
          Your visa application is now in our queue.
          Our team will review it within 24 hours.
        </p>
        {ref && (
          <div className="bg-[#C9A84C]/10 rounded-xl px-5 py-3 mb-6 inline-block">
            <p className="text-[10px] text-[#C9A84C] font-bold uppercase tracking-widest mb-0.5">Reference</p>
            <p className="text-[#0B1F3A] font-mono font-bold text-lg">{ref}</p>
          </div>
        )}
        <div className="bg-gray-50 rounded-2xl p-4 text-left mb-6 space-y-2">
          {[
            'Check your email for a confirmation receipt',
            'Our team will contact you within 24 hours',
            'You can track your application via the portal',
          ].map((s, i) => (
            <p key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-[#C9A84C] font-bold flex-shrink-0">{i + 1}.</span>
              {s}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold py-3.5 rounded-2xl hover:bg-[#b8973f] transition-colors text-sm block">
            WhatsApp Our Team →
          </a>
          <Link
            href="/portal"
            className="border border-gray-200 text-gray-500 py-3 rounded-2xl hover:bg-gray-50 transition-colors text-sm block">
            Track My Application
          </Link>
          <Link href="/" className="text-gray-400 text-xs py-2 hover:text-gray-600 transition-colors block">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>
}
