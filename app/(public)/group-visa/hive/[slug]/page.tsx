'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

type SessionInfo = {
  groupName:     string
  visaType:      string
  destination:   string
  travelDate:    string | null
  memberCount:   number
  submittedCount: number
  isComplete:    boolean
  status:        string
}

type FormState = {
  firstName:        string
  lastName:         string
  dateOfBirth:      string
  nationality:      string
  passportNumber:   string
  passportExpiry:   string
  email:            string
  phone:            string
  hasUKVisa:        boolean
  previousRefusals: boolean
  travelHistory:    string
}

const EMPTY_FORM: FormState = {
  firstName: '', lastName: '', dateOfBirth: '', nationality: '',
  passportNumber: '', passportExpiry: '', email: '', phone: '',
  hasUKVisa: false, previousRefusals: false, travelHistory: '',
}

export default function GroupHivePage() {
  const { slug } = useParams<{ slug: string }>()

  const [info, setInfo]           = useState<SessionInfo | null>(null)
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const fetchInfo = useCallback(async () => {
    try {
      const res  = await fetch(`/api/group-hive/${slug}`)
      if (res.status === 404) { setNotFound(true); return }
      const data = await res.json() as SessionInfo
      setInfo(data)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    const done = localStorage.getItem(`hive_${slug}_submitted`)
    if (done) setAlreadyDone(true)
    fetchInfo()
  }, [slug, fetchInfo])

  // Auto-refresh every 30s after submit or if already done
  useEffect(() => {
    if (!submitted && !alreadyDone) return
    const interval = setInterval(fetchInfo, 30000)
    return () => clearInterval(interval)
  }, [submitted, alreadyDone, fetchInfo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res  = await fetch(`/api/group-hive/${slug}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json() as { success?: boolean; error?: string; submittedCount?: number; totalCount?: number; isComplete?: boolean }

      if (!res.ok) {
        setError(data.error ?? 'Submission failed. Please try again.')
        return
      }

      localStorage.setItem(`hive_${slug}_submitted`, '1')
      setSubmitted(true)
      await fetchInfo()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm(f => ({ ...f, [field]: value }))

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🔍</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Session not found</h1>
        <p className="text-gray-500 text-sm">This link may be expired or incorrect. Contact Walz Travels for help.</p>
        <a href="https://wa.me/447398753797" className="mt-4 inline-block text-sm text-amber-600 font-medium">
          WhatsApp +447398753797 →
        </a>
      </div>
    </div>
  )

  const percent     = info ? Math.round((info.submittedCount / info.memberCount) * 100) : 0
  const remaining   = info ? info.memberCount - info.submittedCount : 0
  const sessionFull = info ? info.submittedCount >= info.memberCount : false

  // State: already submitted (this device), waiting for others
  if (submitted || alreadyDone) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-amber-100 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-[#0B1F3A] mb-2">You&apos;ve submitted!</h1>

          {info && !info.isComplete && (
            <>
              <p className="text-gray-500 text-sm mb-6">
                Waiting for {remaining} more {remaining === 1 ? 'member' : 'members'} to submit before analysis can begin.
              </p>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-gray-400 mb-6">{info.submittedCount} of {info.memberCount} submitted</p>
              <button
                onClick={fetchInfo}
                className="text-sm text-amber-600 font-medium hover:underline"
              >
                Refresh status
              </button>
              <p className="text-xs text-gray-400 mt-2">Auto-refreshes every 30 seconds</p>
            </>
          )}

          {info?.isComplete && (
            <>
              <p className="text-gray-600 text-sm mb-4">
                All {info.memberCount} members have submitted! Walz Travels is now reviewing your group application.
              </p>
              <a
                href="https://wa.me/447398753797"
                className="inline-flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
              >
                📱 WhatsApp for updates
              </a>
            </>
          )}
        </div>
      </div>
    )
  }

  // State: all slots filled (someone else took the last slot before this person submitted)
  if (sessionFull) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-amber-100 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-[#0B1F3A] mb-2">All {info?.memberCount} members have submitted!</h1>
          <p className="text-gray-500 text-sm mb-6">
            Your group visa application is now being reviewed by Walz Travels.
          </p>
          <a
            href="https://wa.me/447398753797"
            className="inline-flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
          >
            📱 WhatsApp +447398753797 for updates
          </a>
        </div>
      </div>
    )
  }

  // State: form
  return (
    <div className="min-h-screen bg-amber-50 py-10 px-4">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🐝</div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Group Visa Hive</h1>
          {info && (
            <p className="text-gray-500 text-sm mt-1">
              {info.groupName} — {info.visaType}
            </p>
          )}
        </div>

        {/* Progress */}
        {info && (
          <div className="bg-white rounded-xl border border-amber-100 px-5 py-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#0B1F3A]">
                {info.submittedCount} of {info.memberCount} submitted
              </span>
              <span className="text-xs text-gray-400">{percent}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-[#0B1F3A] mb-2">Fill in YOUR details</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">First Name *</label>
              <input
                required
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                placeholder="John"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Last Name *</label>
              <input
                required
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                placeholder="Smith"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={e => set('dateOfBirth', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nationality</label>
              <input
                value={form.nationality}
                onChange={e => set('nationality', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                placeholder="Nigerian"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Passport Number</label>
              <input
                value={form.passportNumber}
                onChange={e => set('passportNumber', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                placeholder="A12345678"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Passport Expiry</label>
              <input
                type="date"
                value={form.passportExpiry}
                onChange={e => set('passportExpiry', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              placeholder="+447123456789"
            />
          </div>

          <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Do you have a previous UK or Schengen visa?</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="radio" name="hasUKVisa" checked={form.hasUKVisa === true}  onChange={() => set('hasUKVisa', true)}  className="accent-amber-500" /> Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="radio" name="hasUKVisa" checked={form.hasUKVisa === false} onChange={() => set('hasUKVisa', false)} className="accent-amber-500" /> No
                </label>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Any previous visa refusals?</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="radio" name="refusals" checked={form.previousRefusals === true}  onChange={() => set('previousRefusals', true)}  className="accent-amber-500" /> Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="radio" name="refusals" checked={form.previousRefusals === false} onChange={() => set('previousRefusals', false)} className="accent-amber-500" /> No
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Travel history <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={3}
              value={form.travelHistory}
              onChange={e => set('travelHistory', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
              placeholder="e.g. Visited Ghana 2023, USA 2022…"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#0B1F3A] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#0B1F3A]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : 'Submit My Details →'}
          </button>

          <p className="text-center text-xs text-gray-400 pt-1">
            🔒 Your data is encrypted and only shared with Walz Travels
          </p>
        </form>
      </div>
    </div>
  )
}
