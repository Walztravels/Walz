'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  LogOut, FileText, ChevronRight, Loader2, Eye, EyeOff,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react'

interface Application {
  id:              string
  referenceNumber: string
  destinationIso2: string
  visaType:        string
  status:          string
  statusMessage:   string | null
  createdAt:       string
}

const STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  draft:                  { label: 'Draft',                colour: 'text-gray-500'   },
  received:               { label: 'Received',             colour: 'text-blue-600'   },
  documents_pending:      { label: 'Docs Pending',         colour: 'text-amber-600'  },
  under_review:           { label: 'Under Review',         colour: 'text-purple-600' },
  ready_to_submit:        { label: 'Ready to Submit',      colour: 'text-cyan-600'   },
  submitted_to_embassy:   { label: 'At Embassy',           colour: 'text-indigo-600' },
  decision_pending:       { label: 'Decision Pending',     colour: 'text-orange-600' },
  approved:               { label: 'Approved ✅',           colour: 'text-green-600'  },
  refused:                { label: 'Refused',              colour: 'text-red-600'    },
}

function StatusDot({ status }: { status: string }) {
  if (status === 'approved')   return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (status === 'refused')    return <XCircle      className="w-4 h-4 text-red-500"   />
  if (status === 'received' || status === 'submitted_to_embassy' || status === 'decision_pending')
    return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
  return <Clock className="w-4 h-4 text-amber-500" />
}

export default function MyAccountPage() {
  const [view,           setView]           = useState<'login' | 'portal'>('login')
  const [email,          setEmail]          = useState('')
  const [password,       setPassword]       = useState('')
  const [showPassword,   setShowPassword]   = useState(false)
  const [loginError,     setLoginError]     = useState('')
  const [loading,        setLoading]        = useState(false)
  const [clientName,     setClientName]     = useState('')
  const [applications,   setApplications]   = useState<Application[]>([])
  const [appsLoading,    setAppsLoading]    = useState(false)

  // Check for existing session on mount
  useEffect(() => {
    fetch('/api/client/auth')
      .then(r => r.ok ? r.json() : null)
      .then((d: { name?: string } | null) => {
        if (d?.name) { setClientName(d.name); setView('portal'); loadApplications() }
      })
      .catch(() => {})
  }, [])

  function loadApplications() {
    setAppsLoading(true)
    fetch('/api/client/applications')
      .then(r => r.ok ? r.json() : { applications: [] })
      .then((d: { applications?: Application[] }) => setApplications(d.applications ?? []))
      .catch(() => setApplications([]))
      .finally(() => setAppsLoading(false))
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoading(true)
    try {
      const res = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { success?: boolean; name?: string; error?: string }
      if (!res.ok) { setLoginError(data.error ?? 'Login failed'); return }
      setClientName(data.name ?? '')
      setView('portal')
      loadApplications()
    } catch {
      setLoginError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/client/auth', { method: 'DELETE' })
    setView('login')
    setEmail('')
    setPassword('')
    setApplications([])
    setClientName('')
  }

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/walz-logo.png" alt="Walz Travels" className="h-10 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#0B1F3A]">My Account</h1>
            <p className="text-gray-500 text-sm mt-1">Track your visa applications and travel documents</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Email address
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@email.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} required
                  placeholder="Your password"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#0B1F3A] pr-10 focus:outline-none focus:border-[#C9A84C] transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <p className="text-red-600 text-sm font-medium">{loginError}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-[#0B1F3A] text-[#C9A84C] font-bold py-3 rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-xs text-gray-400 mt-2">
              Your login details were emailed when your account was created.{' '}
              <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">Contact us</a> if you need help.
            </p>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/visa" className="text-[#C9A84C] hover:underline font-semibold">Apply for a visa →</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0B1F3A] py-4 px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/walz-logo.png" alt="Walz Travels" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <p className="text-white/70 text-sm hidden sm:block">Hello, <span className="text-white font-semibold">{clientName}</span></p>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* My Applications */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#C9A84C]" />
              <h2 className="font-bold text-[#0B1F3A] text-sm uppercase tracking-wide">My Applications</h2>
            </div>
            <span className="text-xs text-gray-400">{applications.length} total</span>
          </div>

          {appsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : applications.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-3 text-gray-200" />
              <p>No applications yet</p>
              <Link href="/visa" className="text-[#C9A84C] font-semibold text-xs mt-2 inline-block hover:underline">
                Apply for a visa →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {applications.map(app => {
                const statusMeta = STATUS_LABELS[app.status] ?? { label: app.status, colour: 'text-gray-500' }
                return (
                  <li key={app.id}>
                    <Link
                      href={`/track/${app.referenceNumber}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-[#0B1F3A] text-sm tracking-wide">{app.referenceNumber}</p>
                          <div className="flex items-center gap-1">
                            <StatusDot status={app.status} />
                            <span className={`text-xs font-semibold ${statusMeta.colour}`}>{statusMeta.label}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 capitalize">
                          {app.destinationIso2} · {app.visaType} · {new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {app.statusMessage && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{app.statusMessage}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#C9A84C] transition-colors flex-shrink-0" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Bookings placeholder */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden opacity-60">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="font-bold text-[#0B1F3A] text-sm uppercase tracking-wide">My Bookings</h2>
          </div>
          <div className="py-8 text-center text-gray-400 text-sm">
            Flight and hotel bookings will appear here
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          Questions?{' '}
          <a href="https://wa.me/447398753797" className="text-[#C9A84C] hover:underline" target="_blank" rel="noopener noreferrer">WhatsApp us</a>
          {' '}or{' '}
          <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">email us</a>
        </p>
      </main>
    </div>
  )
}
