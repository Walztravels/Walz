'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Traveler {
  id: string
  itinerary_id: string
  full_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  nationality: string | null
  passport_number: string | null
  passport_expiry: string | null
  passport_country: string | null
  lead_traveler: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface TravelersTabProps {
  itinId: string
  currency: string
  destination: string
  startDate: string | null
  numberOfTravellers: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NATIONALITY_FLAGS: Record<string, string> = {
  nigerian: '🇳🇬',
  ghanaian: '🇬🇭',
  british: '🇬🇧',
  american: '🇺🇸',
  canadian: '🇨🇦',
  kenyan: '🇰🇪',
  south_african: '🇿🇦',
  french: '🇫🇷',
  german: '🇩🇪',
  uae: '🇦🇪',
  emirati: '🇦🇪',
  saudi: '🇸🇦',
  indian: '🇮🇳',
}

function nationalityFlag(nationality: string | null): string {
  if (!nationality) return '🌍'
  return NATIONALITY_FLAGS[nationality.toLowerCase().replace(/\s/g, '_')] ?? '🌍'
}

function maskPassport(passport: string | null): string {
  if (!passport) return '—'
  if (passport.length <= 4) return '****'
  return '****' + passport.slice(-4)
}

type PassportStatus = 'danger' | 'warning' | 'ok' | 'unknown'

function passportExpiryStatus(
  expiry: string | null,
  startDate: string | null,
): PassportStatus {
  if (!expiry) return 'unknown'
  const expiryDate = new Date(expiry)
  const refDate = startDate ? new Date(startDate) : new Date()
  if (isNaN(expiryDate.getTime())) return 'unknown'

  const msPerMonth = 30.44 * 24 * 60 * 60 * 1000
  const monthsUntilExpiry = (expiryDate.getTime() - refDate.getTime()) / msPerMonth

  if (monthsUntilExpiry < 6) return 'danger'
  if (monthsUntilExpiry < 12) return 'warning'
  return 'ok'
}

const EXPIRY_CHIP: Record<PassportStatus, { label: string; className: string }> = {
  danger:  { label: 'Expires <6mo', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  warning: { label: 'Expires <12mo', className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  ok:      { label: 'Valid', className: 'bg-green-500/20 text-green-400 border border-green-500/30' },
  unknown: { label: 'Expiry?', className: 'bg-white/10 text-white/50 border border-white/10' },
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  nationality: '',
  date_of_birth: '',
  passport_number: '',
  passport_expiry: '',
  passport_country: '',
  lead_traveler: false,
  notes: '',
}

type TravelerForm = typeof EMPTY_FORM

// ─── Component ────────────────────────────────────────────────────────────────

export default function TravelersTab({
  itinId,
  startDate,
}: TravelersTabProps) {
  const [travelers, setTravelers] = useState<Traveler[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<TravelerForm>(EMPTY_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TravelerForm>(EMPTY_FORM)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const BASE = `/api/admin/itineraries/${itinId}/travelers`

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTravelers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(BASE)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setTravelers(json.travelers ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load travelers')
    } finally {
      setLoading(false)
    }
  }, [BASE])

  useEffect(() => { fetchTravelers() }, [fetchTravelers])

  // ── Passport expiry warning ────────────────────────────────────────────────

  const dangerTravelers = travelers.filter(
    t => passportExpiryStatus(t.passport_expiry, startDate) === 'danger',
  )

  // ── Add traveler ──────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.full_name.trim()) return
    try {
      setSaving(true)
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to add traveler')
      }
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      await fetchTravelers()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add traveler')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit traveler ─────────────────────────────────────────────────────────

  function startEdit(t: Traveler) {
    setEditingId(t.id)
    setEditForm({
      full_name: t.full_name ?? '',
      email: t.email ?? '',
      phone: t.phone ?? '',
      nationality: t.nationality ?? '',
      date_of_birth: t.date_of_birth ?? '',
      passport_number: t.passport_number ?? '',
      passport_expiry: t.passport_expiry ?? '',
      passport_country: t.passport_country ?? '',
      lead_traveler: t.lead_traveler,
      notes: t.notes ?? '',
    })
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    try {
      setSaving(true)
      const res = await fetch(BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ travelerId: editingId, ...editForm }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to update traveler')
      }
      setEditingId(null)
      await fetchTravelers()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update traveler')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete traveler ───────────────────────────────────────────────────────

  async function handleDelete(travelerId: string) {
    try {
      setDeletingId(travelerId)
      const res = await fetch(BASE, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ travelerId }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to delete traveler')
      }
      setConfirmDelete(null)
      await fetchTravelers()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete traveler')
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Passport warning banner */}
      {dangerTravelers.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-400">Passport Expiry Warning</p>
            <p className="text-sm text-red-300/80">
              {dangerTravelers.map(t => t.full_name).join(', ')}{' '}
              {dangerTravelers.length === 1 ? 'has a passport' : 'have passports'} expiring within 6
              months of the trip start date.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Travelers{' '}
          {!loading && (
            <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-sm font-normal text-white/60">
              {travelers.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => { setShowAddForm(v => !v); setError(null) }}
          className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0B1F3A] transition hover:bg-amber-300"
        >
          {showAddForm ? '✕ Cancel' : '+ Add Traveler'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <TravelerForm
          form={addForm}
          onChange={setAddForm}
          onSubmit={handleAdd}
          onCancel={() => { setShowAddForm(false); setAddForm(EMPTY_FORM) }}
          saving={saving}
          title="Add Traveler"
          showFullPassport
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-white/40">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading travelers…
        </div>
      )}

      {/* Empty */}
      {!loading && travelers.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
          <div className="mb-2 text-4xl">👥</div>
          <p className="text-white/40">No travelers added yet.</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 text-sm text-amber-400 hover:underline"
          >
            Add the first traveler
          </button>
        </div>
      )}

      {/* Traveler list */}
      <div className="space-y-3">
        {travelers.map(t => {
          const expiryStatus = passportExpiryStatus(t.passport_expiry, startDate)
          const expiryChip = EXPIRY_CHIP[expiryStatus]
          const isEditing = editingId === t.id
          const isDeleting = deletingId === t.id
          const isConfirmingDelete = confirmDelete === t.id

          return (
            <div
              key={t.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
            >
              {isEditing ? (
                <TravelerForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={handleEdit}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                  title={`Edit: ${t.full_name}`}
                  showFullPassport
                />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-2xl">
                      {nationalityFlag(t.nationality)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{t.full_name}</span>
                        {t.lead_traveler && (
                          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                            Lead Traveler
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs ${expiryChip.className}`}>
                          {expiryChip.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/60">
                        {t.nationality && <span>{t.nationality}</span>}
                        {t.email && <span>{t.email}</span>}
                        {t.phone && <span>{t.phone}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                        {t.passport_number && (
                          <span>Passport: {maskPassport(t.passport_number)}</span>
                        )}
                        {t.passport_expiry && (
                          <span>Expiry: {t.passport_expiry}</span>
                        )}
                        {t.passport_country && (
                          <span>Issued: {t.passport_country}</span>
                        )}
                        {t.date_of_birth && (
                          <span>DOB: {t.date_of_birth}</span>
                        )}
                      </div>
                      {t.notes && (
                        <p className="mt-2 text-xs italic text-white/40">{t.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => startEdit(t)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:border-amber-400/50 hover:text-amber-400"
                    >
                      Edit
                    </button>
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-400">Delete?</span>
                        <button
                          disabled={isDeleting}
                          onClick={() => handleDelete(t.id)}
                          className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
                        >
                          {isDeleting ? '…' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-white/40 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(t.id)}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-red-400/70 transition hover:border-red-500/30 hover:text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Shared traveler form ─────────────────────────────────────────────────────

function TravelerForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  saving,
  title,
  showFullPassport,
}: {
  form: TravelerForm
  onChange: (f: TravelerForm) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  saving: boolean
  title: string
  showFullPassport?: boolean
}) {
  function field(key: keyof TravelerForm, value: string | boolean) {
    onChange({ ...form, [key]: value })
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30'
  const labelClass = 'mb-1 block text-xs font-medium text-white/60'

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-amber-400/20 bg-white/5 p-5 space-y-4"
    >
      <h4 className="font-semibold text-white">{title}</h4>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Full name */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Full Name *</label>
          <input
            required
            value={form.full_name}
            onChange={e => field('full_name', e.target.value)}
            placeholder="As on passport"
            className={inputClass}
          />
        </div>

        {/* Email */}
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => field('email', e.target.value)}
            placeholder="traveler@email.com"
            className={inputClass}
          />
        </div>

        {/* Phone */}
        <div>
          <label className={labelClass}>Phone</label>
          <input
            value={form.phone}
            onChange={e => field('phone', e.target.value)}
            placeholder="+234 800 000 0000"
            className={inputClass}
          />
        </div>

        {/* Nationality */}
        <div>
          <label className={labelClass}>Nationality</label>
          <input
            value={form.nationality}
            onChange={e => field('nationality', e.target.value)}
            placeholder="e.g. Nigerian"
            className={inputClass}
          />
        </div>

        {/* Date of birth */}
        <div>
          <label className={labelClass}>Date of Birth</label>
          <input
            type="date"
            value={form.date_of_birth}
            onChange={e => field('date_of_birth', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Passport number */}
        <div>
          <label className={labelClass}>Passport Number</label>
          <input
            value={form.passport_number}
            onChange={e => field('passport_number', e.target.value)}
            placeholder={showFullPassport ? 'A12345678' : '****1234'}
            className={inputClass}
          />
        </div>

        {/* Passport expiry */}
        <div>
          <label className={labelClass}>Passport Expiry</label>
          <input
            type="date"
            value={form.passport_expiry}
            onChange={e => field('passport_expiry', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Passport country */}
        <div>
          <label className={labelClass}>Passport Issuing Country</label>
          <input
            value={form.passport_country}
            onChange={e => field('passport_country', e.target.value)}
            placeholder="e.g. Nigeria"
            className={inputClass}
          />
        </div>

        {/* Lead traveler */}
        <div className="flex items-center gap-3 pt-2">
          <input
            id="lead_traveler_check"
            type="checkbox"
            checked={form.lead_traveler}
            onChange={e => field('lead_traveler', e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-amber-400"
          />
          <label htmlFor="lead_traveler_check" className="text-sm text-white/70 cursor-pointer">
            Lead Traveler
          </label>
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => field('notes', e.target.value)}
            rows={2}
            placeholder="Any special requirements…"
            className={inputClass + ' resize-none'}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-[#0B1F3A] transition hover:bg-amber-300 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Traveler'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-5 py-2 text-sm text-white/60 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
