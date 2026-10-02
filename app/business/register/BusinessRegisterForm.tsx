'use client'

// app/business/register/BusinessRegisterForm.tsx — Walz Business (V1-A)
//
// Posts to the EXISTING POST /api/auth/signup route unchanged in its core
// behaviour (name/email/password -> creates a User row and sends a
// verification email — nothing else; it never creates an Organization or
// OrganizationMembership). The only new, additive thing this form sends is
// an optional `callbackUrl` field, which the route threads into the
// verification email link so the whole invitation -> register -> verify ->
// sign in -> back-at-the-invitation journey survives (see
// app/api/auth/signup/route.ts and app/api/auth/verify-email/route.ts).
//
// When arrived via ?email=<value> (an organization invitation bound this
// email to this registration) the email field is pre-filled AND rendered
// read-only — the visitor cannot type a different address.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, User, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { safeLocalRedirect } from '@/lib/safe-redirect'

export default function BusinessRegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const emailParam = searchParams.get('email') ?? ''
  const emailLocked = emailParam.length > 0
  // Hardened local-path-only check — see lib/safe-redirect.ts.
  const callbackUrl = safeLocalRedirect(searchParams.get('callbackUrl'), '/business')

  const [name, setName] = useState('')
  const [email, setEmail] = useState(emailParam)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Email and password are required.'); return }
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          // Additive, optional field — only threaded when it points
          // somewhere other than the default /business landing page, and
          // only ever a safe local path (see lib/safe-redirect.ts). The
          // signup route further restricts this to paths starting with
          // /business before it ever reaches the verification email.
          ...(callbackUrl !== '/business' ? { callbackUrl } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not create account. Please try again.')
      } else {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
          <h1 className="text-lg font-semibold text-[#0B1F3A] mb-1">Create your Walz Business account</h1>
          <p className="text-sm text-slate-500 mb-6">
            {emailLocked
              ? 'Finish setting up the account for the invitation you received.'
              : 'Set up your account to start managing travel for your organization.'}
          </p>

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="biz-register-name" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Full name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  id="biz-register-name"
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith" autoComplete="name"
                  className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#0B1F3A] focus:ring-1 focus:ring-[#0B1F3A]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="biz-register-email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  id="biz-register-email"
                  type="email" value={email}
                  onChange={e => { if (!emailLocked) setEmail(e.target.value) }}
                  placeholder="you@company.com" required autoComplete="email"
                  readOnly={emailLocked}
                  disabled={emailLocked}
                  aria-readonly={emailLocked}
                  className={`w-full pl-10 pr-4 h-11 border rounded-xl text-sm outline-none transition-all ${
                    emailLocked
                      ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed'
                      : 'border-slate-200 focus:border-[#0B1F3A] focus:ring-1 focus:ring-[#0B1F3A]/20'
                  }`}
                />
              </div>
              {emailLocked && (
                <p className="text-xs text-slate-400 mt-1.5">
                  This address was set by your invitation and can&apos;t be changed here.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="biz-register-password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Password <span className="text-slate-400 font-normal normal-case">(min 12 characters)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  id="biz-register-password"
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="new-password"
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

            <div>
              <label htmlFor="biz-register-confirm" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <input
                  id="biz-register-confirm"
                  type={showCf ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" required autoComplete="new-password"
                  className={`w-full pl-10 pr-10 h-11 border rounded-xl text-sm outline-none focus:ring-1 transition-all ${
                    confirm && confirm !== password
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                      : 'border-slate-200 focus:border-[#0B1F3A] focus:ring-[#0B1F3A]/20'
                  }`}
                />
                <button
                  type="button" onClick={() => setShowCf(v => !v)}
                  aria-label={showCf ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirm && confirm !== password && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full h-11 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-xs text-slate-400 text-center">
              By creating an account you agree to our{' '}
              <Link href="/terms" className="text-[#0B1F3A] hover:underline">Terms</Link>{' '}and{' '}
              <Link href="/privacy" className="text-[#0B1F3A] hover:underline">Privacy Policy</Link>
            </p>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Already have an account?{' '}
          <Link
            href={`/business/login${callbackUrl !== '/business' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}
            className="text-[#0B1F3A] font-semibold hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
