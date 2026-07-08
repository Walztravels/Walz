'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { User, Mail, Lock, CheckCircle, AlertCircle, Loader2, Eye, EyeOff, Calendar } from 'lucide-react'
import { format } from 'date-fns'

interface UserProfile {
  id: string
  name: string | null
  email: string | null
  createdAt: string
}

export default function PortalProfilePage() {
  const { data: session, update: updateSession } = useSession()

  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState('')
  const [error, setError]       = useState('')

  // Name form
  const [name, setName]         = useState('')

  // Password form
  const [oldPw, setOldPw]       = useState('')
  const [newPw, setNewPw]       = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld]   = useState(false)
  const [showNew, setShowNew]   = useState(false)

  useEffect(() => {
    fetch('/api/portal/profile')
      .then(r => r.json())
      .then(d => {
        setProfile(d.user)
        setName(d.user?.name ?? '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const res  = await fetch('/api/portal/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    const data = await res.json() as { user?: UserProfile; error?: string }

    if (!res.ok) {
      setError(data.error ?? 'Could not save changes.')
    } else {
      setProfile(data.user!)
      setSuccess('Name updated successfully.')
      // Refresh the NextAuth session so navbar shows updated name
      await updateSession({ name: data.user!.name })
      setTimeout(() => setSuccess(''), 4000)
    }
    setSaving(false)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPw.length < 8)   { setError('New password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setError('New passwords do not match.');                  return }

    setSaving(true)
    const res  = await fetch('/api/portal/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
    })
    const data = await res.json() as { error?: string }

    if (!res.ok) {
      setError(data.error ?? 'Could not update password.')
    } else {
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
      setSuccess('Password changed successfully.')
      setTimeout(() => setSuccess(''), 4000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#0B1F3A]">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account details and password</p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-2xl space-y-6">

        {/* Status messages */}
        {success && (
          <div className="flex items-center gap-2 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />{success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* Avatar + account info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-2xl flex-shrink-0">
            {(profile?.name ?? session?.user?.email ?? 'C')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[#0B1F3A] truncate">{profile?.name ?? '—'}</p>
            <p className="text-sm text-gray-500 truncate flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5" />{profile?.email}
            </p>
            {profile?.createdAt && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Member since {format(new Date(profile.createdAt), 'MMMM yyyy')}
              </p>
            )}
          </div>
        </div>

        {/* Edit name */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-[#0B1F3A] mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-[#C9A84C]" />
            Display Name
          </h2>
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full pl-10 pr-4 h-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={profile?.email ?? ''}
                  disabled
                  className="w-full pl-10 pr-4 h-11 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Email address cannot be changed here. Contact support if you need to update it.</p>
            </div>
            <button
              type="submit"
              disabled={saving || name === profile?.name}
              className="px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2040] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Save Name'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-[#0B1F3A] mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#C9A84C]" />
            Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Current password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPw}
                  onChange={e => setOldPw(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 h-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all"
                />
                <button type="button" onClick={() => setShowOld(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password <span className="text-gray-400 font-normal">(min 8 characters)</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 h-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all"
                />
                <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className={`w-full pl-10 pr-4 h-11 border rounded-xl text-sm focus:outline-none focus:ring-1 transition-all ${
                    confirmPw && confirmPw !== newPw
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                      : 'border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]/20'
                  }`}
                />
              </div>
              {confirmPw && confirmPw !== newPw && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !oldPw || !newPw || !confirmPw}
              className="px-5 py-2.5 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#d4b55c] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</> : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Danger zone — sign out */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-[#0B1F3A] mb-1">Need help?</h2>
          <p className="text-sm text-gray-500 mb-4">For account issues or if you need to change your email, contact our support team.</p>
          <a
            href="https://wa.me/12317902336"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            WhatsApp Support
          </a>
        </div>

      </div>
    </div>
  )
}
