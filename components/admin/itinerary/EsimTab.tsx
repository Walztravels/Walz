'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EsimRecord {
  id: string
  itinerary_id: string
  traveler_name: string | null
  package_code: string | null
  package_name: string | null
  provider: string
  destination_countries: string[]
  data_amount: string | null
  validity_days: number | null
  wholesale_cost: number | null
  client_price: number | null
  currency: string
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface AiraloPackage {
  id: number | string
  slug?: string
  title?: string
  package?: {
    id: number | string
    slug: string
    title: string
    data: string
    day: number
    price: number
  }
  operators?: Array<{
    title?: string
    data?: string
    day?: number
    packages?: Array<{
      id: number | string
      slug: string
      title: string
      data: string
      day: number
      price: number
    }>
  }>
}

interface EsimTabProps {
  itinId: string
  destination: string
  destinations: string
  numberOfTravellers: number
  startDate: string | null
  endDate: string | null
  currency: string
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  recommended: { label: 'Recommended', className: 'bg-white/10 text-white/60 border border-white/10' },
  added:       { label: 'Added',       className: 'bg-blue-500/20 text-blue-400 border border-blue-500/20' },
  purchased:   { label: 'Purchased',   className: 'bg-amber-500/20 text-amber-400 border border-amber-500/20' },
  issued:      { label: 'Issued',      className: 'bg-purple-500/20 text-purple-400 border border-purple-500/20' },
  installed:   { label: 'Installed',   className: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20' },
  activated:   { label: 'Activated',   className: 'bg-green-500/20 text-green-400 border border-green-500/20' },
}

const STATUS_ORDER = ['recommended', 'added', 'purchased', 'issued', 'installed', 'activated']

const MARKUP = 1.4

const EMPTY_FORM = {
  traveler_name: '',
  package_code: '',
  package_name: '',
  data_amount: '',
  validity_days: '',
  wholesale_cost: '',
  client_price: '',
  notes: '',
  currency: 'USD',
}

type EsimForm = typeof EMPTY_FORM

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number | null | undefined, currency = 'USD'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Extract a flat list of packages from the Airalo API response shape */
function extractPackages(rec: AiraloPackage): Array<{
  id: string
  slug: string
  title: string
  data: string
  day: number
  price: number
  provider: string
}> {
  const results: ReturnType<typeof extractPackages> = []
  const providerTitle = String(rec.title ?? rec.slug ?? rec.id)

  const addPkg = (pkg: { id: number | string; slug: string; title: string; data: string; day: number; price: number }, provider: string) => {
    results.push({
      id: String(pkg.id),
      slug: pkg.slug,
      title: pkg.title,
      data: pkg.data,
      day: pkg.day,
      price: pkg.price,
      provider,
    })
  }

  if (rec.package) {
    addPkg(rec.package, providerTitle)
  }

  for (const op of rec.operators ?? []) {
    const opTitle = op.title ?? providerTitle
    for (const pkg of op.packages ?? []) {
      addPkg(pkg, opTitle)
    }
  }

  return results
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EsimTab({
  itinId,
  destination,
  destinations,
  currency,
}: EsimTabProps) {
  const [esims, setEsims] = useState<EsimRecord[]>([])
  const [recommendations, setRecommendations] = useState<AiraloPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<EsimForm>(EMPTY_FORM)

  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const primaryDestination = destination || destinations || ''

  const BASE = `/api/admin/itineraries/${itinId}/esim`

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchEsims = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const url = primaryDestination
        ? `${BASE}?destination=${encodeURIComponent(primaryDestination)}`
        : BASE
      const res = await fetch(url)
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `Could not load eSIM data. Please retry.`)
      }
      const json = await res.json()
      setEsims(json.esims ?? [])
      setRecommendations(json.recommendations ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load eSIM data. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [BASE, primaryDestination])

  useEffect(() => { fetchEsims() }, [fetchEsims])

  // ── Flat packages from recommendations ────────────────────────────────────

  const flatPackages = useMemo(() => {
    return recommendations.flatMap(extractPackages)
  }, [recommendations])

  // ── Add from recommendation ───────────────────────────────────────────────

  async function handleAddFromRecommendation(pkg: ReturnType<typeof extractPackages>[0]) {
    try {
      setSaving(true)
      const wholesale = pkg.price
      const client = Math.round(wholesale * MARKUP * 100) / 100
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traveler_name: null,
          package_code: pkg.slug,
          package_name: pkg.title,
          provider: pkg.provider,
          data_amount: pkg.data,
          validity_days: pkg.day,
          wholesale_cost: wholesale,
          client_price: client,
          currency: 'USD',
          status: 'recommended',
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to add eSIM')
      }
      await fetchEsims()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add eSIM')
    } finally {
      setSaving(false)
    }
  }

  // ── Add manual ────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      setSaving(true)
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          validity_days: addForm.validity_days ? Number(addForm.validity_days) : null,
          wholesale_cost: addForm.wholesale_cost ? Number(addForm.wholesale_cost) : null,
          client_price: addForm.client_price ? Number(addForm.client_price) : null,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to add eSIM')
      }
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      await fetchEsims()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add eSIM')
    } finally {
      setSaving(false)
    }
  }

  // ── Update status ─────────────────────────────────────────────────────────

  async function handleStatusChange(esimId: string, newStatus: string) {
    try {
      setUpdatingId(esimId)
      const res = await fetch(BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esimId, status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      setEsims(prev => prev.map(e => e.id === esimId ? { ...e, status: newStatus } : e))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(esimId: string) {
    try {
      setDeletingId(esimId)
      const res = await fetch(BASE, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esimId }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      setConfirmDelete(null)
      setEsims(prev => prev.filter(e => e.id !== esimId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete eSIM')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Revenue summary ───────────────────────────────────────────────────────

  const revenue = useMemo(() => {
    const totalWholesale = esims.reduce((s, e) => s + (e.wholesale_cost ?? 0), 0)
    const totalClient = esims.reduce((s, e) => s + (e.client_price ?? 0), 0)
    return {
      wholesale: totalWholesale,
      client: totalClient,
      margin: totalClient - totalWholesale,
    }
  }, [esims])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{error}</span>
          <button
            onClick={fetchEsims}
            className="shrink-0 rounded border border-red-500/40 px-3 py-1 text-xs transition hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      )}

      {/* Coverage info */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="mb-2 text-sm font-semibold text-white/60 uppercase tracking-wider">
          📱 eSIM Coverage
        </h3>
        <div className="flex flex-wrap gap-2">
          {primaryDestination.split(/[,;|\/]+/).map(d => d.trim()).filter(Boolean).map(d => (
            <span
              key={d}
              className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-400"
            >
              {d}
            </span>
          ))}
          {!primaryDestination && (
            <span className="text-sm text-white/30">No destination set</span>
          )}
        </div>
        <p className="mt-2 text-xs text-white/30">
          Showing Airalo packages for: <strong className="text-white/50">{primaryDestination || '—'}</strong>
        </p>
      </div>

      {/* Recommended packages */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white/60 uppercase tracking-wider">
          Airalo Recommendations
        </h3>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-white/40">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Fetching packages…
          </div>
        )}

        {!loading && flatPackages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-8 text-center">
            <div className="mb-1 text-3xl">📡</div>
            <p className="text-sm text-white/30">No Airalo packages available for this destination.</p>
            <p className="mt-1 text-xs text-white/20">Add packages manually below.</p>
          </div>
        )}

        {!loading && flatPackages.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {flatPackages.map(pkg => {
              const suggested = Math.round(pkg.price * MARKUP * 100) / 100
              return (
                <div
                  key={pkg.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white text-sm">{pkg.title}</p>
                      <p className="text-xs text-white/40 mt-0.5">{pkg.provider}</p>
                    </div>
                    <button
                      disabled={saving}
                      onClick={() => handleAddFromRecommendation(pkg)}
                      className="shrink-0 rounded-lg bg-amber-400/20 border border-amber-400/30 px-2.5 py-1 text-xs font-semibold text-amber-400 transition hover:bg-amber-400/30 disabled:opacity-50"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                    <span>📦 {pkg.data}</span>
                    <span>📅 {pkg.day} days</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/30">Wholesale</p>
                      <p className="text-sm font-semibold text-white">${pkg.price.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/30">Sell at (×{MARKUP})</p>
                      <p className="text-sm font-semibold text-amber-400">${suggested.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Assigned eSIMs */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            Assigned eSIMs
            {esims.length > 0 && (
              <span className="ml-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-white/60 normal-case">
                {esims.length}
              </span>
            )}
          </h3>
          <button
            onClick={() => { setShowAddForm(v => !v); setError(null) }}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] transition hover:bg-amber-300"
          >
            {showAddForm ? '✕ Cancel' : '+ Add Manually'}
          </button>
        </div>

        {/* Manual add form */}
        {showAddForm && (
          <EsimAddForm
            form={addForm}
            onChange={setAddForm}
            onSubmit={handleAdd}
            onCancel={() => { setShowAddForm(false); setAddForm(EMPTY_FORM) }}
            saving={saving}
          />
        )}

        {!loading && esims.length === 0 && !showAddForm && (
          <div className="rounded-xl border border-dashed border-white/10 py-8 text-center">
            <div className="mb-1 text-3xl">📵</div>
            <p className="text-sm text-white/30">No eSIMs assigned yet.</p>
          </div>
        )}

        {esims.length > 0 && (
          <div className="space-y-3">
            {esims.map(esim => {
              const sConfig = STATUS_CONFIG[esim.status] ?? STATUS_CONFIG.recommended
              return (
                <div
                  key={esim.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-white">
                          {esim.traveler_name ?? 'Unassigned'}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${sConfig.className}`}>
                          {sConfig.label}
                        </span>
                      </div>
                      <p className="text-sm text-white/70">
                        {esim.package_name ?? esim.package_code ?? '—'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                        {esim.provider && <span>via {esim.provider}</span>}
                        {esim.data_amount && <span>📦 {esim.data_amount}</span>}
                        {esim.validity_days && <span>📅 {esim.validity_days} days</span>}
                        {esim.wholesale_cost != null && (
                          <span>Cost: {fmt(esim.wholesale_cost, esim.currency)}</span>
                        )}
                        {esim.client_price != null && (
                          <span className="text-amber-400/70">
                            Sell: {fmt(esim.client_price, esim.currency)}
                          </span>
                        )}
                      </div>
                      {esim.notes && (
                        <p className="mt-1.5 text-xs italic text-white/30">{esim.notes}</p>
                      )}
                      <p className="mt-1.5 text-xs text-blue-400/60">
                        View QR &amp; activation → <a href="/admin/esim" className="underline hover:text-blue-400">/admin/esim</a>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 items-end">
                      {/* Status dropdown */}
                      <select
                        disabled={updatingId === esim.id}
                        value={esim.status}
                        onChange={e => handleStatusChange(esim.id, e.target.value)}
                        className="rounded-lg border border-white/10 bg-[#0B1F3A] px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-amber-400/40 disabled:opacity-50"
                      >
                        {STATUS_ORDER.map(s => (
                          <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
                        ))}
                      </select>

                      {/* Delete */}
                      {confirmDelete === esim.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={deletingId === esim.id}
                            onClick={() => handleDelete(esim.id)}
                            className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                          >
                            {deletingId === esim.id ? '…' : 'Yes, remove'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs text-white/30 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(esim.id)}
                          className="text-xs text-red-400/50 hover:text-red-400 transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Revenue summary */}
      {esims.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-white/60 uppercase tracking-wider">
            Revenue Summary
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-xs text-white/40 mb-1">Total Wholesale</p>
              <p className="text-lg font-bold text-white">{fmt(revenue.wholesale, currency)}</p>
            </div>
            <div className="rounded-lg bg-amber-400/10 border border-amber-400/20 p-4 text-center">
              <p className="text-xs text-amber-400/60 mb-1">Total Client Price</p>
              <p className="text-lg font-bold text-amber-400">{fmt(revenue.client, currency)}</p>
            </div>
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-center">
              <p className="text-xs text-green-400/60 mb-1">Total Margin</p>
              <p className="text-lg font-bold text-green-400">{fmt(revenue.margin, currency)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Manual eSIM add form ─────────────────────────────────────────────────────

function EsimAddForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  saving,
}: {
  form: EsimForm
  onChange: (f: EsimForm) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  saving: boolean
}) {
  function field<K extends keyof EsimForm>(key: K, value: EsimForm[K]) {
    onChange({ ...form, [key]: value })
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30'
  const labelClass = 'mb-1 block text-xs font-medium text-white/60'

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 rounded-xl border border-amber-400/20 bg-white/5 p-5 space-y-4"
    >
      <h4 className="font-semibold text-white">Add eSIM Manually</h4>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Traveler Name</label>
          <input
            value={form.traveler_name}
            onChange={e => field('traveler_name', e.target.value)}
            placeholder="Full name"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Package Code</label>
          <input
            value={form.package_code}
            onChange={e => field('package_code', e.target.value)}
            placeholder="e.g. merhaba-7days-1gb"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Package Name</label>
          <input
            value={form.package_name}
            onChange={e => field('package_name', e.target.value)}
            placeholder="e.g. Turkey 7 Days 1GB"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Data Amount</label>
          <input
            value={form.data_amount}
            onChange={e => field('data_amount', e.target.value)}
            placeholder="e.g. 1 GB"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Validity (days)</label>
          <input
            type="number"
            min={1}
            value={form.validity_days}
            onChange={e => field('validity_days', e.target.value)}
            placeholder="7"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Wholesale Cost (USD)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.wholesale_cost}
            onChange={e => {
              field('wholesale_cost', e.target.value)
              const wh = Number(e.target.value)
              if (!isNaN(wh) && wh > 0) {
                field('client_price', String(Math.round(wh * MARKUP * 100) / 100))
              }
            }}
            placeholder="5.00"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Client Price (USD)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.client_price}
            onChange={e => field('client_price', e.target.value)}
            placeholder="7.00"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => field('notes', e.target.value)}
            rows={2}
            placeholder="Any internal notes…"
            className={inputClass + ' resize-none'}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-amber-300 disabled:opacity-60 transition"
        >
          {saving ? 'Saving…' : 'Add eSIM'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-5 py-2 text-sm text-white/60 hover:text-white transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
