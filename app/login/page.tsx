'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Lock, User, Loader2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'

function LoginContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { status }   = useSession()

  const rawCallback = searchParams.get('callbackUrl') ?? ''
  const callbackUrl = /^\/group\/create(\?.*)?$/.test(rawCallback)
    ? rawCallback
    : '/portal/dashboard'
  const errorParam  = searchParams.get('error')
  const modeParam     = searchParams.get('signup')
  const verifiedParam = searchParams.get('verified')

  const [tab, setTab]           = useState<'signin' | 'signup'>(modeParam === 'true' ? 'signup' : 'signin')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [showCf, setShowCf]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (status === 'authenticated') window.location.href = callbackUrl
  }, [status, callbackUrl])

  useEffect(() => {
    if (errorParam === 'CredentialsSignin') {
      setError('Incorrect email or password. Please try again.')
    } else if (errorParam && errorParam !== 'undefined') {
      setError('Something went wrong. Please try again.')
    }
  }, [errorParam])

  function switchTab(t: 'signin' | 'signup') {
    setTab(t); setError('')
    setName(''); setEmail(''); setPassword(''); setConfirm('')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please enter your email and password.'); return }

    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl })
    setLoading(false)

    if (res?.error) {
      setError('Incorrect email or password. Please check your details and try again.')
    } else if (res?.ok) {
      window.location.href = callbackUrl
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Email and password are required.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const res  = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not create account. Please try again.')
      } else {
        // Redirect to verify-email holding page — do NOT auto sign-in
        router.push(`/verify-email?email=${encodeURIComponent(email)}`)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A]">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-16 px-4 bg-[#0B1F3A]">
      <div className="w-full max-w-md">

        {/* Logo */}
        <Link href="/" className="flex justify-center mb-8">
          <Image src="/walz-logo.png" alt="Walz Travels" width={140} height={140}
            className="h-12 w-auto object-contain hover:opacity-90 transition-opacity brightness-0 invert" />
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {(['signin', 'signup'] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'text-[#0B1F3A] border-b-2 border-[#C9A84C]'
                    : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div className="p-7 lg:p-8">

            {/* Email verified success banner */}
            {verifiedParam === 'true' && (
              <div className="flex items-start gap-3 p-3.5 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm mb-5">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Email verified! Sign in below to access your portal.</span>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── Sign In ── */}
            {tab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoComplete="email"
                      className="w-full pl-10 pr-4 h-11 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs text-[#C9A84C] hover:underline font-medium">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required autoComplete="current-password"
                      className="w-full pl-10 pr-10 h-11 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full h-11 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-1">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            )}

            {/* ── Create Account ── */}
            {tab === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="Jane Smith" autoComplete="name"
                      className="w-full pl-10 pr-4 h-11 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoComplete="email"
                      className="w-full pl-10 pr-4 h-11 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Password <span className="text-gray-400 font-normal normal-case">(min 8 characters)</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required autoComplete="new-password"
                      className="w-full pl-10 pr-10 h-11 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showCf ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••" required autoComplete="new-password"
                      className={`w-full pl-10 pr-10 h-11 border rounded-xl text-sm outline-none focus:ring-1 transition-all ${
                        confirm && confirm !== password
                          ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                          : 'border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]/20'
                      }`} />
                    <button type="button" onClick={() => setShowCf(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm && confirm !== password && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full h-11 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-1">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Creating account…' : 'Create Account →'}
                </button>

                <p className="text-xs text-gray-400 text-center">
                  By creating an account you agree to our{' '}
                  <Link href="/terms" className="text-[#C9A84C] hover:underline">Terms</Link>{' '}and{' '}
                  <Link href="/privacy" className="text-[#C9A84C] hover:underline">Privacy Policy</Link>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/40 mt-5">
          {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
            className="text-[#C9A84C] font-semibold hover:underline">
            {tab === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginContent />
    </Suspense>
  )
}
