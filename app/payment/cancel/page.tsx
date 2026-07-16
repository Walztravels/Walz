'use client'
import Link from 'next/link'

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">

        <div className="w-24 h-24 bg-amber-500/20 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </div>

        <h1 className="text-white font-bold text-3xl mb-3">Payment Cancelled</h1>
        <p className="text-white/60 text-lg mb-8">
          Your payment was not completed. No charges have been made. You can try again or contact us for assistance.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-xl transition text-sm"
          >
            Back to Walz Travels
          </Link>
          <a
            href="https://wa.me/447389753787"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-white/20 hover:border-white/40 text-white px-8 py-3.5 rounded-xl transition text-sm"
          >
            WhatsApp Us
          </a>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/walz-logo.png"
            alt="Walz Travels"
            className="h-8 opacity-50"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
          <p className="text-white/20 text-xs">Walz Travels · Secure Payment</p>
        </div>
      </div>
    </div>
  )
}
