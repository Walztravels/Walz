'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2, User, AlertCircle, CheckCircle } from 'lucide-react'
import type { TravellerDTO } from '@/lib/portal/traveller-dto'
import type { CompletenessResult } from '@/lib/portal/traveller-completeness'

const RELATIONSHIPS = ['Self', 'Spouse/Partner', 'Child', 'Family', 'Friend', 'Other'] as const
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'] as const

interface Props {
  mode: 'create' | 'edit'
  traveller: TravellerDTO | null
  completeness?: CompletenessResult
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-white/60 text-xs font-medium mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50 focus:bg-white/8 transition-all ${props.className ?? ''}`}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50 transition-all ${props.className ?? ''}`}
    />
  )
}

export default function TravellerEditForm({ mode, traveller, completeness }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [form, setForm] = useState({
    relationship: traveller?.relationship ?? 'Other',
    firstName:    traveller?.firstName ?? '',
    middleName:   traveller?.middleName ?? '',
    lastName:     traveller?.lastName ?? '',
    dateOfBirth:  traveller?.dateOfBirth ?? '',
    gender:       traveller?.gender ?? '',
    nationality:  traveller?.nationality ?? '',
    phone:        traveller?.phone ?? '',
    email:        traveller?.email ?? '',
    passportExpiry: traveller?.passportMeta?.expiryDate ?? '',
    passportNationality: traveller?.passportMeta?.nationality ?? '',
    passportType: traveller?.passportMeta?.passportType ?? '',
  })

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        relationship: form.relationship,
        firstName:    form.firstName.trim(),
        middleName:   form.middleName.trim() || null,
        lastName:     form.lastName.trim(),
        dateOfBirth:  form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : null,
        gender:       form.gender || null,
        nationality:  form.nationality || null,
        phone:        form.phone || null,
        email:        form.email || null,
        passportMeta: (form.passportExpiry || form.passportNationality || form.passportType) ? {
          expiryDate:  form.passportExpiry || null,
          nationality: form.passportNationality || null,
          passportType: form.passportType || null,
        } : null,
      }

      const url  = mode === 'create' ? '/api/portal/travellers' : `/api/portal/travellers/${traveller!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save traveller')
      }

      router.push('/dashboard/travellers')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!traveller?.id) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/travellers/${traveller.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove traveller')
      router.push('/dashboard/travellers')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-2xl">
        <Link href="/dashboard/travellers"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to travellers
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/20 flex items-center justify-center">
            <User className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">
              {mode === 'create' ? 'Add Traveller' : `Edit — ${traveller?.displayName}`}
            </h1>
            {mode === 'edit' && traveller && (
              <p className="text-white/40 text-xs mt-0.5">{traveller.relationship}</p>
            )}
          </div>
        </div>

        {/* Completeness bar (edit mode) */}
        {mode === 'edit' && completeness && (
          <div className="mb-6 p-4 rounded-xl bg-white/4 border border-white/8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-xs font-medium">Profile completeness</span>
              <span className="text-white font-bold text-sm">{completeness.percent}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  completeness.percent >= 80 ? 'bg-green-500' :
                  completeness.percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${completeness.percent}%` }}
              />
            </div>
            {completeness.missing.length > 0 && (
              <p className="text-white/30 text-xs mt-2">
                Missing: {completeness.missing.join(', ')}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Relationship */}
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Relationship</h2>
            <Field label="Relationship to you">
              <Select value={form.relationship} onChange={e => set('relationship', e.target.value)}>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
          </div>

          {/* Personal information */}
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First name" required>
                <Input
                  value={form.firstName}
                  onChange={e => set('firstName', e.target.value)}
                  placeholder="e.g. Sarah"
                  required
                />
              </Field>
              <Field label="Middle name">
                <Input
                  value={form.middleName}
                  onChange={e => set('middleName', e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Last name" required>
                <Input
                  value={form.lastName}
                  onChange={e => set('lastName', e.target.value)}
                  placeholder="e.g. Johnson"
                  required
                />
              </Field>
              <Field label="Date of birth">
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => set('dateOfBirth', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </Field>
              <Field label="Gender">
                <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Nationality">
                <Input
                  value={form.nationality}
                  onChange={e => set('nationality', e.target.value)}
                  placeholder="e.g. Nigerian"
                />
              </Field>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Contact (optional)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Phone">
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="e.g. +447700900000"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </div>

          {/* Passport summary — NO raw passport number stored */}
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">Passport</h2>
            <p className="text-white/30 text-xs mb-4">
              Passport numbers are entered at booking time. Store expiry and nationality here for planning purposes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Passport expiry date">
                <Input
                  type="date"
                  value={form.passportExpiry}
                  onChange={e => set('passportExpiry', e.target.value)}
                />
              </Field>
              <Field label="Passport nationality">
                <Input
                  value={form.passportNationality}
                  onChange={e => set('passportNationality', e.target.value)}
                  placeholder="e.g. Nigerian"
                />
              </Field>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] disabled:opacity-60 transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : mode === 'create' ? 'Add traveller' : 'Save changes'}
            </button>
            {mode === 'edit' && traveller && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-3 rounded-xl border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#0B1F3A] border border-white/15 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <h3 className="text-white font-bold text-base">Remove traveller?</h3>
              </div>
              <p className="text-white/50 text-sm mb-1">
                <strong className="text-white">{traveller?.displayName}</strong> will be removed from your saved travellers.
              </p>
              <p className="text-white/40 text-xs mb-5">
                Historical booking records remain unchanged — this only removes the saved profile.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm font-semibold hover:border-white/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-60 transition-colors"
                >
                  {deleting ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
