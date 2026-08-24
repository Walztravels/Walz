// Stripe redirects here after 3DS or bank redirect flows.
// We just show a success/failure message based on the query params.
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

type Status = 'loading' | 'success' | 'processing' | 'error'

export default function AuthCompleted() {
  const sp             = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const secret = sp.get('payment_intent_client_secret')
    if (!secret) { setStatus('error'); setMessage('No payment reference found.'); return }

    stripePromise.then(async stripe => {
      if (!stripe) { setStatus('error'); setMessage('Stripe unavailable.'); return }

      const { paymentIntent, error } = await stripe.retrievePaymentIntent(secret)

      if (error) {
        setStatus('error')
        setMessage(error.message ?? 'An error occurred.')
        return
      }

      if (paymentIntent?.status === 'requires_capture') {
        setStatus('success')
        setMessage('Your card has been successfully pre-authorised. Walz Travels will notify you before any funds are collected.')
      } else if (paymentIntent?.status === 'processing') {
        setStatus('processing')
        setMessage('Your authorisation is being processed — you will receive a confirmation email shortly.')
      } else {
        setStatus('error')
        setMessage(`Unexpected status: ${paymentIntent?.status}. Please contact Walz Travels.`)
      }
    })
  }, [sp])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0A1628] py-4 px-6">
        <div className="max-w-md mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" className="h-10 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center space-y-4">
          {status === 'loading' && (
            <>
              <div className="w-10 h-10 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm">Confirming your authorisation…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Authorisation Successful</h1>
              <p className="text-gray-600 text-sm">{message}</p>
            </>
          )}

          {status === 'processing' && (
            <>
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Processing</h1>
              <p className="text-gray-600 text-sm">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
              <p className="text-gray-600 text-sm">{message}</p>
              <p className="text-gray-400 text-xs">
                Contact{' '}
                <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">
                  contact@walztravels.com
                </a>{' '}
                if you need help.
              </p>
            </>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Walz Travels Ltd. All rights reserved.
      </footer>
    </div>
  )
}
