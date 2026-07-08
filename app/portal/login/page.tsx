'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function PortalLoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const enrolRewards = searchParams?.get('enrol') === 'rewards'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/portal/dashboard',
    })

    if (result?.error) {
      setError('Incorrect email or password. Please try again.')
      setLoading(false)
    } else if (enrolRewards) {
      await fetch('/api/rewards/membership', { method: 'POST' }).catch(() => {})
      router.push('/flights/loyalty?join=1')
    } else {
      router.push('/portal/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <Image src="/walz-logo.png" alt="Walz Travels" width={140} height={50} className="h-12 w-auto mx-auto object-contain" />
          </Link>
          <p className="text-[#C9A84C] text-xs tracking-widest uppercase mt-3 font-semibold">Client Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-[#0A1628] mb-1">Sign in to your portal</h1>
          <p className="text-gray-500 text-sm mb-6">Track your visa, flight, and travel applications.</p>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#0d2040] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-gray-100 text-center space-y-2">
            <Link href="/forgot-password" className="text-sm text-[#C9A84C] hover:underline block">Forgot password?</Link>
            <p className="text-sm text-gray-500">
              New to Walz Travels?{' '}
              <Link href="/portal/register" className="text-[#C9A84C] font-medium hover:underline">Create an account</Link>
            </p>
            <p className="text-xs text-gray-400">
              Applied without an account?{' '}
              <Link href="/portal/register" className="text-[#0A1628] font-medium hover:underline">Claim your portal →</Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          Need help? <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">WhatsApp us</a>
        </p>
      </div>
    </div>
  )
}
