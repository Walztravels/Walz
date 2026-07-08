'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { Suspense } from 'react'

function SuccessContent() {
  const params = useSearchParams()
  const ref    = params.get('ref') ?? ''

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-3">Payment Successful!</h1>
        <p className="text-gray-500 mb-2">Your visa application has been received.</p>
        {ref && (
          <p className="text-sm font-mono font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-4 py-2 rounded-xl mb-6">
            Reference: {ref}
          </p>
        )}
        <p className="text-gray-400 text-sm mb-8">
          Our team will review your application within 24 hours
          and contact you via email and WhatsApp.
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="https://wa.me/12317902336"
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl hover:bg-[#b8973f] transition-colors block">
            WhatsApp Our Team →
          </a>
          <Link
            href="/"
            className="border border-gray-200 text-gray-500 py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm block">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
