'use client'

// app/business/login/BusinessLoginForm.tsx — Walz Business (V1-A)
//
// Visually distinct from app/login/LoginForm.tsx (light SaaS-portal canvas
// vs. the consumer page's dark full-bleed navy treatment) and different
// copy ("Sign in to Walz Business", organization-oriented framing).
// Functionally identical underlying call: signIn('credentials', { email,
// password, redirect: false }) from next-auth/react — zero change to
// lib/auth.ts.

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Mail, Lock, Loader2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import { safeLocalRedirect } from '@/lib/safe-redirect'

export default function BusinessLoginForm() {
  const searchParams = useSearchParams()

  // Hardened local-path-only check — see lib/safe-redirect.ts for why a bare
  // startsWith('/') check (app/login/LoginForm.tsx's own, unchanged, inline
  // version) is not enough on its own.
  const callbackUrl = safeLocalRedirect(searchParams.get('callbackUrl'), '/business')
  const errorParam = searchParams.get('error')
  const verifiedParam = searchParams.get('verified')
  // Presentational convenience only, e.g. arriving from an organization
  // invitation that already knows the invited email — never trusted
  // server-side.
  const emailParam = searchParams.get('email') ?? ''

  const [email, setEmail] = useState(emailParam)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (errorParam === 'CredentialsSignin') {
      setError('Incorrect email or password. Please try again.')
    } else if (errorParam && errorParam !== 'undefined') {
      setError('Something went wrong. Please try again.')
    }
  }, [errorParam])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please enter your email and password.'); return }

    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)

    if (res?.error) {
      setError('Incorrect email or password. Please check your details and try again.')
    } else if (res?.ok) {
      window.location.href = callbackUrl
    }
  }

  const registerHref = emailParam || callbackUrl !== '/business'
    ? `/business/register?${new URLSearchParams({
        ...(emailParam ? { email: emailParam } : {}),
        ...(callbackUrl !== '/business' ? { callbackUrl } : {}),
      }).toString()}`
    : '/business/register'

  // Walz Business hotfix (B1.1) — the shared app/forgot-password + reset-
  // password pages hardcode the CONSUMER /login destination for every
  // "Back to sign in" link. Threading `?callbackUrl=/business/login` here
  // (the exact same param name/contract already used throughout this
  // domain — see safeBusinessCallback in lib/safe-redirect.ts) lets those
  // shared pages recognize a Business-originated visit and round-trip back
  // to /business/login instead, without forking a parallel Business-only
  // copy of the password-reset flow. Validated downstream via
  // safeBusinessCallback, never trusted as a raw redirect target.
  const forgotPasswordHref = `/forgot-password?${new URLSearchParams({ callbackUrl: '/business/login' }).toString()}`

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <Link href="/business" className="inline-flex items-baseline gap-1.5 mb-3">
            <span className="text-2xl font-bold tracking-tight text-[#0B1F3A]">Walz</span>
            <span className="text-2xl font-bold tracking-tight text-[#C9A84C]">Business</span>
          </Link>
          <p className="text-sm text-slate-500">Travel management for organizations</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-7 lg:p-8">
          <h1 className="text-lg font-semibold text-[#0B1F3A] mb-1">Sign in to Walz Business</h1>
          <p className="text-sm text-slate-500 mb-6">
            Access your organization&apos;s travel requests, travellers and settings.
          </p>

          {verifiedParam === 'true' && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm mb-5">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Email verified. Sign in below to access your organization.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="biz-login-email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  id="biz-login-email"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" required autoComplete="email"
                  className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#0B1F3A] focus:ring-1 focus:ring-[#0B1F3A]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="biz-login-password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Password
                </label>
                <Link href={forgotPasswordHref} className="text-xs text-[#0B1F3A] hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  id="biz-login-password"
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  className="w-full pl-10 pr-10 h-11 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#0B1F3A] focus:ring-1 focus:ring-[#0B1F3A]/20 transition-all"
                />
                <button
                  type="button" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full h-11 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          New to Walz Business?{' '}
          <Link href={registerHref} className="text-[#0B1F3A] font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
