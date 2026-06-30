'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

type Status = 'verifying' | 'needs_password' | 'signing_in' | 'expired' | 'error'

function PortalVerifyContent() {
  const params   = useSearchParams()
  const router   = useRouter()
  const [status, setStatus]          = useState<Status>('verifying')
  const [password, setPassword]      = useState('')
  const [confirm, setConfirm]        = useState('')
  const [saving, setSaving]          = useState(false)
  const [pwError, setPwError]        = useState('')

  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''

  useEffect(() => {
    if (!token || !email) { setStatus('error'); return }

    fetch('/api/portal/verify-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email }),
    })
      .then(r => r.json())
      .then(async (data: { valid: boolean; expired?: boolean; hasPassword?: boolean }) => {
        if (!data.valid) { setStatus(data.expired ? 'expired' : 'error'); return }
        if (data.hasPassword) {
          // Already has password — sign in directly
          setStatus('signing_in')
          const res = await signIn('credentials', {
            email,
            token,
            redirect: false,
            callbackUrl: '/portal/dashboard',
          })
          if (res?.error) {
            // Can't auto-sign-in without password — send to login
            router.push('/portal/login?verified=1')
          } else {
            router.push('/portal/dashboard')
          }
        } else {
          setStatus('needs_password')
        }
      })
      .catch(() => setStatus('error'))
  }, [token, email, router])

  const handleSetPassword = async () => {
    setPwError('')
    if (password.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (password !== confirm)  { setPwError('Passwords do not match'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/portal/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      })
      if (!res.ok) { setPwError('Something went wrong. Please try again.'); setSaving(false); return }
      // Sign in with the new password
      const signInRes = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/portal/dashboard',
      })
      if (signInRes?.error) {
        router.push('/portal/login?verified=1')
      } else {
        router.push('/portal/dashboard')
      }
    } catch {
      setPwError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <Image src="/walz-logo.png" alt="Walz Travels" width={140} height={50} className="h-12 w-auto mx-auto object-contain" />
          </Link>
          <p className="text-[#C9A84C] text-xs tracking-widest uppercase mt-3 font-semibold">Client Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          {status === 'verifying' && (
            <>
              <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Verifying your link…</p>
            </>
          )}

          {status === 'signing_in' && (
            <>
              <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Signing you in…</p>
            </>
          )}

          {status === 'needs_password' && (
            <>
              <div className="text-4xl mb-4">🔐</div>
              <h2 className="text-xl font-bold text-[#0A1628] mb-1">Set your password</h2>
              <p className="text-sm text-gray-500 mb-6">
                Create a password to access your portal anytime
              </p>
              <div className="space-y-3 text-left">
                <input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                />
                {pwError && <p className="text-sm text-red-600">{pwError}</p>}
                <button
                  onClick={handleSetPassword}
                  disabled={saving || !password || !confirm}
                  className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#0d2040] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</> : 'Access My Portal →'}
                </button>
              </div>
            </>
          )}

          {status === 'expired' && (
            <>
              <div className="text-4xl mb-4">⏰</div>
              <h2 className="text-xl font-bold text-[#0A1628] mb-2">Link expired</h2>
              <p className="text-sm text-gray-500 mb-6">
                This link is valid for 7 days and has expired.
              </p>
              <Link href="/portal/login"
                className="block w-full py-3 bg-[#C9A84C] text-[#0A1628] font-semibold rounded-xl hover:bg-[#b8943d] text-center transition-colors">
                Go to Portal Login →
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-4xl mb-4">❌</div>
              <h2 className="text-xl font-bold text-[#0A1628] mb-2">Invalid link</h2>
              <p className="text-sm text-gray-500 mb-6">
                This link is invalid or has already been used.
              </p>
              <Link href="/portal/login"
                className="block w-full py-3 bg-[#C9A84C] text-[#0A1628] font-semibold rounded-xl hover:bg-[#b8943d] text-center transition-colors">
                Go to Portal Login →
              </Link>
            </>
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          Need help? <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">WhatsApp us</a>
        </p>
      </div>
    </div>
  )
}

export default function PortalVerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    }>
      <PortalVerifyContent />
    </Suspense>
  )
}
