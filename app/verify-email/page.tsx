'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Loader2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email        = searchParams.get('email') ?? ''
  const errorParam   = searchParams.get('error')

  const [loading, setLoading]       = useState(false)
  const [resent, setResent]         = useState(false)
  const [resendError, setResendError] = useState('')
  const [cooldown, setCooldown]     = useState(0)

  // Countdown timer for resend button
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleResend() {
    if (!email || cooldown > 0) return
    setLoading(true); setResent(false); setResendError('')

    try {
      const res  = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResendError(data.error || 'Could not resend. Please try again.')
      } else {
        setResent(true)
        setCooldown(60) // 60 second cooldown
      }
    } catch {
      setResendError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 bg-[#F7F8FA]">
      <div className="w-full max-w-md">

        <Link href="/" className="flex justify-center mb-8">
          <Image src="/walz-logo.png" alt="Walz Travels" width={140} height={140}
            className="h-12 w-auto object-contain hover:opacity-90 transition-opacity" />
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Expired link error */}
          {errorParam === 'expired' ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-amber-500" />
              </div>
              <h2 className="font-bold text-[#0B1F3A] text-xl mb-2">Link expired</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                This verification link has expired. Request a new one using the button below.
              </p>
              <button onClick={handleResend} disabled={loading || cooldown > 0}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-semibold text-sm rounded-xl transition-colors disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send New Link'}
              </button>
            </div>
          ) : (
            <>
              {/* Email icon */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-[#0B1F3A]/5 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-[#C9A84C]" />
                </div>
                <h2 className="font-bold text-[#0B1F3A] text-2xl mb-2">Check Your Email</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  We've sent a verification link to{' '}
                  <strong className="text-[#0B1F3A]">{email || 'your email address'}</strong>.
                  Click the link in the email to activate your account.
                </p>
              </div>

              {/* Tips */}
              <div className="bg-[#F7F8FA] rounded-xl p-4 mb-6">
                <p className="text-xs font-semibold text-[#0B1F3A] mb-2">Didn't receive the email?</p>
                <ul className="text-xs text-gray-500 space-y-1.5">
                  <li>• Check your <strong>spam or junk</strong> folder</li>
                  <li>• Make sure you entered the correct email address</li>
                  <li>• The link expires in <strong>24 hours</strong></li>
                </ul>
              </div>

              {/* Resend feedback */}
              {resent && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm mb-4">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Verification email sent! Check your inbox.
                </div>
              )}
              {resendError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {resendError}
                </div>
              )}

              {/* Resend button */}
              <button onClick={handleResend} disabled={loading || cooldown > 0}
                className="w-full flex items-center justify-center gap-2 h-11 border-2 border-[#C9A84C] text-[#0B1F3A] font-semibold text-sm rounded-xl hover:bg-[#FFFBF0] transition-colors disabled:opacity-50 mb-4">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  : cooldown > 0
                    ? <><RefreshCw className="w-4 h-4" /> Resend in {cooldown}s</>
                    : <><RefreshCw className="w-4 h-4" /> Resend verification email</>
                }
              </button>
            </>
          )}

          <div className="text-center mt-2">
            <Link href="/login" className="text-xs text-gray-400 hover:text-[#0B1F3A] transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}
