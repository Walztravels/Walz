'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'

function ForgotPasswordContent() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email) { setError('Please enter your email address.'); return }

    setLoading(true)
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Something went wrong.')
      else setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 bg-[#F7F8FA]">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8 group">
          <Image src="/walz-logo.png" alt="Walz Travels" width={140} height={140}
            className="h-12 w-auto object-contain group-hover:opacity-90 transition-opacity" />
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 lg:p-8">
          {sent ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="font-bold text-[#0B1F3A] text-xl mb-2">Check your inbox</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a reset link.
                It expires in <strong>1 hour</strong>. Check your spam folder if you don&apos;t see it.
              </p>
              <Link href="/login"
                className="inline-flex items-center gap-2 text-[#C9A84C] font-semibold text-sm hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-[#0B1F3A] text-xl mb-1">Forgot your password?</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              {error && (
                <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-5">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoComplete="email"
                      className="w-full pl-10 pr-4 h-11 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full h-11 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#0B1F3A] transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin" /></div>}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
