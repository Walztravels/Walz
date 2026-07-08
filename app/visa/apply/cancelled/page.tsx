'use client'
import Link from 'next/link'
import { XCircle } from 'lucide-react'

export default function CancelledPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-3">Payment Cancelled</h1>
        <p className="text-gray-500 mb-8">
          No charge was made. Your application details have been saved —
          you can complete payment at any time.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/visa"
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl hover:bg-[#b8973f] transition-colors block">
            Try Again
          </Link>
          <a
            href="https://wa.me/12317902336"
            className="border border-gray-200 text-gray-500 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors block">
            Pay via WhatsApp Instead
          </a>
        </div>
      </div>
    </div>
  )
}
