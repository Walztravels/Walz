'use client'

/**
 * Walz Team Hub V1.1 — the signed-in staff member's own email notification
 * preferences. Deliberately a small, standalone page rather than a new
 * panel inside TeamWorkspaceShell: the Team Hub workspace is a reviewed,
 * merged surface and this feature is additive, so nothing in it is
 * touched. The Team Hub email footer links here ("Manage your Team Hub
 * email notifications").
 *
 * Toggle styling reuses the existing admin switch pattern
 * (app/admin/settings/payments/page.tsx): an 11x6 pill, gold #C9A84C when
 * on, grey when off — with role="switch"/aria-checked and a real label
 * association so it is operable by keyboard and screen reader.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Loader2, CheckCircle } from 'lucide-react'

interface Preferences {
  directMessages: boolean
  mentionsAndThreads: boolean
  missedCalls: boolean
  invites: boolean
}

const ROWS: Array<{ key: keyof Preferences; title: string; description: string }> = [
  { key: 'directMessages', title: 'Direct messages', description: 'Someone sends you a DM and you have not read it.' },
  { key: 'mentionsAndThreads', title: 'Mentions and thread replies', description: 'You are @mentioned, or someone replies in a thread on your message.' },
  { key: 'missedCalls', title: 'Missed calls', description: 'A Team Hub call to you ends without being answered.' },
  { key: 'invites', title: 'Group and channel invitations', description: 'You are added to a group or private channel.' },
]

const DEFAULTS: Preferences = { directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: true }

export default function TeamEmailNotificationsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<keyof Preferences | null>(null)
  const [savedKey, setSavedKey] = useState<keyof Preferences | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/team/email-preferences')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d: { preferences: Preferences }) => { if (!cancelled) setPrefs({ ...DEFAULTS, ...d.preferences }) })
      .catch(() => { if (!cancelled) setError('Could not load your settings. Please refresh.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const toggle = useCallback(async (key: keyof Preferences) => {
    const next = !prefs[key]
    const previous = prefs
    setPrefs(p => ({ ...p, [key]: next }))
    setSavingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/admin/team/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = (await res.json()) as { preferences: Preferences }
      setPrefs({ ...DEFAULTS, ...data.preferences })
      setSavedKey(key)
      setTimeout(() => setSavedKey(k => (k === key ? null : k)), 2500)
    } catch {
      setPrefs(previous) // roll the optimistic flip back
      setError('Could not save that change. Please try again.')
    } finally {
      setSavingKey(null)
    }
  }, [prefs])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/admin/team" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1F3A] mb-6">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to Team Hub
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-lg bg-[#0B1F3A] text-[#C9A84C] flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Team Hub email notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            We email you only when you have actually missed something — after a few minutes, and at most one email every 15 minutes.
            Ordinary channel and group chatter is never emailed.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {loading ? (
          <p className="px-5 py-8 text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your settings…
          </p>
        ) : ROWS.map(row => {
          const active = prefs[row.key]
          const id = `team-email-pref-${row.key}`
          return (
            <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <label htmlFor={id} className="block text-sm font-semibold text-[#0B1F3A]">{row.title}</label>
                <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {savedKey === row.key && <CheckCircle className="w-4 h-4 text-green-600" aria-hidden="true" />}
                <button
                  id={id}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${row.title} email notifications`}
                  disabled={savingKey === row.key}
                  onClick={() => toggle(row.key)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C9A84C] ${active ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Changes save immediately. Turning something off stops future emails for that category — it never affects your in-app Team Hub notifications.
      </p>
    </div>
  )
}
