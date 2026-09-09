'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, CheckCircle, RefreshCw, Banknote, ShieldAlert } from 'lucide-react'

const INPUT = 'h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 bg-white transition-colors w-full'

interface LiveRate {
  currency:  string
  rate:      number | null
  source:    string | null
  provider:  string | null
  fetchedAt: string | null
  sourceTimestamp: string | null
  status:    'Ready' | 'Stale' | 'Unavailable'
}

interface FxSettingsView {
  rateMode:      'AUTO_MONIERATE' | 'MANUAL'
  manualRates:   Record<string, string>
  adjustmentUsd: string
  cacheMinutes:  number
  lockMinutes:   number
  updatedBy:     string | null
  updatedAt:     string | null
}

const STATUS_STYLE: Record<string, string> = {
  Ready:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  Stale:       'bg-amber-50 text-amber-700 border-amber-200',
  Unavailable: 'bg-red-50 text-red-600 border-red-200',
}

export default function CurrencyFxSettingsPage() {
  const [settings,    setSettings]    = useState<FxSettingsView | null>(null)
  const [liveRates,   setLiveRates]   = useState<LiveRate[]>([])
  const [currencies,  setCurrencies]  = useState<string[]>([])
  const [engineOn,    setEngineOn]    = useState(false)
  const [monierateOk, setMonierateOk] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/settings/fx${refresh ? '?refresh=1' : ''}`)
      if (res.status === 403) { setError('Only a super admin can view or change FX pricing.'); return }
      if (!res.ok) { setError('Failed to load FX settings.'); return }
      const d = await res.json()
      setSettings(d.settings)
      setLiveRates(d.liveRates ?? [])
      setCurrencies(d.currencies ?? [])
      setEngineOn(Boolean(d.engineEnabled))
      setMonierateOk(Boolean(d.monierateConfigured))
    } catch {
      setError('Failed to load FX settings.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings/fx', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateMode:      settings.rateMode,
          manualRates:   settings.manualRates,
          adjustmentUsd: settings.adjustmentUsd,
          cacheMinutes:  settings.cacheMinutes,
          lockMinutes:   settings.lockMinutes,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Failed to save.'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      load()
    } catch {
      setError('Failed to save FX settings.')
    } finally {
      setSaving(false)
    }
  }

  function overallStatus(): { label: string; cls: string } {
    if (!settings) return { label: '—', cls: STATUS_STYLE.Unavailable }
    if (settings.rateMode === 'MANUAL') return { label: 'Manual Mode', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    const usd = liveRates.find(r => r.currency === 'USD')
    if (usd?.status === 'Ready') return { label: 'Ready', cls: STATUS_STYLE.Ready }
    if (usd?.status === 'Stale') return { label: 'Stale', cls: STATUS_STYLE.Stale }
    const hasManual = Object.values(settings.manualRates ?? {}).some(Boolean)
    if (hasManual) return { label: 'Using Manual Fallback', cls: STATUS_STYLE.Stale }
    return { label: 'Unavailable', cls: STATUS_STYLE.Unavailable }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading FX settings…
      </div>
    )
  }

  if (error && !settings) {
    return (
      <div className="p-8">
        <div className="max-w-lg bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!settings) return null
  const status = overallStatus()

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A] flex items-center gap-2">
            <Banknote className="w-6 h-6 text-[#C9A84C]" /> Currency &amp; FX
          </h1>
          <p className="text-sm text-gray-500 mt-1">Nigerian Naira pricing — rate source, manual rates, FX adjustment.</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${status.cls}`}>{status.label}</span>
      </div>

      {!engineOn && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          The NGN FX engine is currently <strong>disabled</strong> (WALZ_NGN_FX_ENGINE_ENABLED). Settings can be
          prepared here; customer pricing keeps its existing behavior until the flag is turned on.
        </div>
      )}
      {!monierateOk && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          Monierate is not configured (MONIERATE_API_KEY). Automatic mode will fall back to manual rates.
        </div>
      )}

      {/* ── Rate mode ── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold text-[#0B1F3A]/60 uppercase tracking-wider">Nigerian Naira Pricing — Rate Mode</h2>
        <div className="grid grid-cols-2 gap-2 max-w-md">
          {([
            ['AUTO_MONIERATE', 'Monierate Parallel', 'Live parallel-market reference rate, manual fallback'],
            ['MANUAL',         'Walz Manual',        'Use the manual rates below immediately'],
          ] as const).map(([mode, label, desc]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSettings({ ...settings, rateMode: mode })}
              className={`text-left p-3 rounded-xl border-2 transition-all ${
                settings.rateMode === mode ? 'border-[#C9A84C] bg-[#FFF8E6]' : 'border-gray-200 hover:border-[#C9A84C]/50'
              }`}
            >
              <p className="text-sm font-bold text-[#0B1F3A]">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Live Monierate rates ── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#0B1F3A]/60 uppercase tracking-wider">Current Monierate Rates (parallel-market BUY side)</h2>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A]/60 hover:text-[#0B1F3A] px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Rates
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="py-1.5 pr-4 font-medium">Pair</th>
                <th className="py-1.5 pr-4 font-medium">Rate</th>
                <th className="py-1.5 pr-4 font-medium">Source</th>
                <th className="py-1.5 pr-4 font-medium">Last updated</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {liveRates.map(r => (
                <tr key={r.currency} className="border-t border-gray-50">
                  <td className="py-2 pr-4 font-semibold text-[#0B1F3A]">{r.currency}/NGN</td>
                  <td className="py-2 pr-4 tabular-nums">{r.rate != null ? `₦${r.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{r.provider ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">
                    {r.sourceTimestamp ? new Date(r.sourceTimestamp).toLocaleString() : (r.fetchedAt ? new Date(r.fetchedAt).toLocaleString() : '—')}
                  </td>
                  <td className="py-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Manual rates ── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold text-[#0B1F3A]/60 uppercase tracking-wider">Manual Walz Rates — commercial buy-side (₦ per 1 unit)</h2>
        <p className="text-xs text-gray-500">
          Walz commercial buy-side rate — NGN required per 1 unit of foreign currency.
          E.g. USD/NGN = NGN required for Walz to recover $1; GBP/NGN = NGN required to recover £1.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl">
          {currencies.map(cur => (
            <label key={cur} className="block">
              <span className="text-xs font-semibold text-gray-500">{cur}/NGN</span>
              <input
                type="text"
                inputMode="decimal"
                value={settings.manualRates[cur] ?? ''}
                placeholder="—"
                onChange={e => setSettings({
                  ...settings,
                  manualRates: { ...settings.manualRates, [cur]: e.target.value },
                })}
                className={INPUT}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Used as fallback when Monierate is unavailable or stale — or immediately in Manual mode.
        </p>
      </section>

      {/* ── Adjustment + cache + lock ── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold text-[#0B1F3A]/60 uppercase tracking-wider">Pricing Controls</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">FX Adjustment (USD)</span>
            <input
              type="text" inputMode="decimal"
              value={settings.adjustmentUsd}
              onChange={e => setSettings({ ...settings, adjustmentUsd: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Rate Cache (minutes)</span>
            <input
              type="number" min={1} max={1440}
              value={settings.cacheMinutes}
              onChange={e => setSettings({ ...settings, cacheMinutes: Number(e.target.value) })}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Checkout Rate Lock (minutes)</span>
            <input
              type="number" min={1} max={1440}
              value={settings.lockMinutes}
              onChange={e => setSettings({ ...settings, lockMinutes: Number(e.target.value) })}
              className={INPUT}
            />
          </label>
        </div>
        <p className="text-xs text-gray-400">
          The USD adjustment is added once per customer conversion total and shown separately — the displayed
          exchange rate is always the real Monierate/manual rate.
        </p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-[#0B1F3A] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#0B1F3A]/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : 'Save Settings'}
        </button>
        {settings.updatedAt && (
          <p className="text-xs text-gray-400">
            Last changed {new Date(settings.updatedAt).toLocaleString()}{settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
