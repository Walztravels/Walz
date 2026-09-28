'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Settings, X, AlertCircle, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

// ── Types ─────────────────────────────────────────────────────────────────────
// ONLINE STATUS and CHECK-IN STATUS are two completely separate concepts —
// never merge them. A staff member can be online AND have missed their
// current check-in window at the same time; the UI must show both.
type CheckInSlotStatus = 'PENDING' | 'CHECKED_IN' | 'MISSED'

interface CurrentCheckIn {
  windowStart: string
  localHour:   number
  status:      CheckInSlotStatus
}

interface StaffStatusRow {
  id:                       string
  name:                     string
  role:                     string
  roleTitle:                string
  online:                   boolean
  lastActiveAt:             string | null
  currentCheckIn:           CurrentCheckIn | null
  lastManualCheckInAt:      string | null
  missedToday:              number
  weekDeductionsByCurrency: Record<string, number>
}

interface FlaggedRecord {
  id:            string
  staffId:       string
  windowStart:   string
  deductionAmt:  number
  waived:        boolean
  disputeStatus: string | null
  dispute:       string | null
  staff: { id: string; name: string; roleTitle: string }
}

interface LiveData {
  staffStatus: StaffStatusRow[]
  stats: {
    checkedInThisWindow: number
    trackedTotal:        number
    missedToday:         number
    pendingReview:       number
    weekDeductionsByCurrency: Record<string, number>
  }
  flagged: FlaggedRecord[]
  error?:  string
}

interface CheckInSettingsData {
  enabled:                 boolean
  workStartHour:           number
  workEndHour:             number
  satEnabled:              boolean
  satStartHour:            number
  satEndHour:              number
  sunEnabled:              boolean
  deductionPerMiss:        number
  graceMinutes:            number
  effectiveDeductionDate:  string | null
}

interface DeductionPolicy {
  country:  'NG' | 'GH'
  currency: string
  amount:   number | null
  enabled:  boolean
}

interface StaffListItem {
  id:             string
  name:           string
  roleTitle:      string
  role:           string
  checkInTracked: boolean
}

const WAIVER_REASONS = ['Approved meeting', 'Technical issue', 'Approved leave', 'Emergency', 'Management exception', 'Other']

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtSlotHour(iso: string) {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function fmtCurrencyMap(m: Record<string, number>): string {
  const entries = Object.entries(m).filter(([, v]) => v > 0)
  if (entries.length === 0) return '—'
  const symbol = (c: string) => (c === 'GHS' ? 'GH₵' : c === 'NGN' ? '₦' : `${c} `)
  return entries.map(([c, v]) => `${symbol(c)}${v.toLocaleString()}`).join(' · ')
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, missed }: { name: string; missed: boolean }) {
  const color     = missed ? 'bg-[#3d1a1a]' : 'bg-[#1c2940]'
  const textColor = missed ? 'text-red-300' : 'text-white/50'
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${color} ${textColor}`}>
      {initials(name)}
    </div>
  )
}

// ── Online badge (separate from check-in) ──────────────────────────────────────
function OnlineBadge({ online, lastActiveAt }: { online: boolean; lastActiveAt: string | null }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online
      </span>
    )
  }
  return (
    <span className="text-xs text-white/30">
      {lastActiveAt ? `Last active ${fmtTime(lastActiveAt)}` : 'Offline'}
    </span>
  )
}

// ── Check-in status badge (independent of online status) ───────────────────────
function CheckInBadge({ currentCheckIn }: { currentCheckIn: CurrentCheckIn | null }) {
  if (!currentCheckIn) {
    return <span className="inline-flex items-center px-3 py-1 rounded-md bg-white/5 text-white/30 text-xs font-medium">Outside hours</span>
  }
  const label = fmtSlotHour(currentCheckIn.windowStart)
  if (currentCheckIn.status === 'CHECKED_IN') {
    return <span className="inline-flex items-center px-3 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-medium">Checked in — {label}</span>
  }
  if (currentCheckIn.status === 'MISSED') {
    return <span className="inline-flex items-center px-3 py-1 rounded-md bg-red-500/15 text-red-400 text-xs font-medium">Missed — {label}</span>
  }
  return <span className="inline-flex items-center px-3 py-1 rounded-md bg-amber-500/15 text-amber-400 text-xs font-medium">Pending — {label}</span>
}

// ── Waive modal (reason required) ───────────────────────────────────────────────
function WaiveModal({ record, onClose, onDone }: { record: FlaggedRecord; onClose: () => void; onDone: () => void }) {
  const [reason, setReason]   = useState(WAIVER_REASONS[0])
  const [custom, setCustom]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')

  async function submit() {
    const finalReason = reason === 'Other' ? custom.trim() : reason
    if (!finalReason) { setErr('Please provide a reason.'); return }
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(`/api/admin/check-ins/${record.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'waive', reason: finalReason }),
      })
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? 'Failed to waive'); return }
      onDone()
      onClose()
    } catch {
      setErr('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1526] rounded-2xl ring-1 ring-white/10 p-6 w-full max-w-sm">
        <p className="text-white font-semibold mb-1">Waive deduction</p>
        <p className="text-white/40 text-xs mb-4">
          {record.staff.name} — {fmtSlotHour(record.windowStart)}. The missed check-in stays on record; only the financial deduction is waived.
        </p>
        <label className="block text-xs text-white/40 mb-1.5">Reason for waiver</label>
        <select value={reason} onChange={e => setReason(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-amber-400/50">
          {WAIVER_REASONS.map(r => <option key={r} value={r} className="bg-[#0d1e35]">{r}</option>)}
        </select>
        {reason === 'Other' && (
          <textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="Describe the reason"
            rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3 resize-none focus:outline-none focus:border-amber-400/50" />
        )}
        {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-white/50 ring-1 ring-white/10 hover:bg-white/5">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#0a1628] bg-amber-500 hover:bg-amber-400 disabled:opacity-50">
            {busy ? 'Waiving…' : 'Confirm waiver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings,    setSettings]    = useState<CheckInSettingsData | null>(null)
  const [policies,    setPolicies]    = useState<DeductionPolicy[]>([])
  const [staffList,   setStaffList]   = useState<StaffListItem[]>([])
  const [saving,      setSaving]      = useState(false)
  const [toggling,    setToggling]    = useState<string | null>(null)
  const [settingsErr, setSettingsErr] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-ins/settings')
      .then(r => r.json())
      .then((d: { settings?: CheckInSettingsData; error?: string }) => {
        if (d.settings) setSettings(d.settings)
        else setSettingsErr(d.error ?? 'Failed to load settings')
      })
      .catch(() => setSettingsErr('Network error'))

    fetch('/api/admin/check-ins/deduction-policy')
      .then(r => r.json())
      .then((d: { policies?: DeductionPolicy[] }) => setPolicies(d.policies ?? []))
      .catch(() => {})

    fetch('/api/admin/staff')
      .then(r => r.json())
      .then((d: { staff?: StaffListItem[] }) => {
        setStaffList((d.staff ?? []).filter(s => !['super_admin', 'general_manager', 'senior_manager'].includes(s.role)))
      })
      .catch(() => {})
  }, [])

  async function saveSettings() {
    if (!settings) return
    setSaving(true)
    await fetch('/api/admin/check-ins/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    onSaved()
  }

  async function savePolicy(country: 'NG' | 'GH', amount: number | null) {
    const res = await fetch('/api/admin/check-ins/deduction-policy', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, amount }),
    })
    if (res.ok) {
      const d = await res.json()
      setPolicies(prev => prev.map(p => p.country === country ? d.policy : p))
    }
  }

  async function toggleTracked(id: string, current: boolean) {
    setToggling(id)
    await fetch(`/api/admin/staff/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkInTracked: !current }),
    })
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, checkInTracked: !current } : s))
    setToggling(null)
  }

  return (
    <div className="bg-[#112240] rounded-2xl ring-1 ring-white/10 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          Check-in Settings
        </h3>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {settingsErr ? (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{settingsErr}
        </div>
      ) : settings ? (
        <>
          <div className="flex items-center gap-3 mb-5 pb-5 border-b border-white/5">
            <button
              onClick={() => setSettings(s => s ? { ...s, enabled: !s.enabled } : s)}
              className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                settings.enabled ? 'bg-amber-500' : 'bg-white/10')}
            >
              <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
                settings.enabled ? 'translate-x-6' : 'translate-x-1')} />
            </button>
            <span className="text-sm font-medium text-white/80">
              {settings.enabled ? 'Tracking enabled' : 'Tracking disabled'}
            </span>
          </div>

          {/* Per-day schedule */}
          <div className="space-y-3 mb-5">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Work Schedule</p>

            <div className="bg-white/3 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-white/60 mb-2">Mon – Fri</p>
              <div className="grid grid-cols-2 gap-3">
                {(['workStartHour', 'workEndHour'] as const).map(field => (
                  <div key={field}>
                    <label className="block text-xs text-white/30 mb-1">{field === 'workStartHour' ? 'Start' : 'End'}</label>
                    <select value={settings[field]}
                      onChange={e => setSettings(s => s ? { ...s, [field]: Number(e.target.value) } : s)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50">
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i} className="bg-[#0d1e35]">{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/3 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-white/60">Saturday</p>
                <button onClick={() => setSettings(s => s ? { ...s, satEnabled: !s.satEnabled } : s)}
                  className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    settings.satEnabled ? 'bg-amber-500' : 'bg-white/10')}>
                  <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
                    settings.satEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
              {settings.satEnabled ? (
                <div className="grid grid-cols-2 gap-3">
                  {(['satStartHour', 'satEndHour'] as const).map(field => (
                    <div key={field}>
                      <label className="block text-xs text-white/30 mb-1">{field === 'satStartHour' ? 'Start' : 'End'}</label>
                      <select value={settings[field]}
                        onChange={e => setSettings(s => s ? { ...s, [field]: Number(e.target.value) } : s)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50">
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i} className="bg-[#0d1e35]">{String(i).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/20 italic">Off — no check-ins on Saturday</p>
              )}
            </div>

            <div className="bg-white/3 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/60">Sunday</p>
                <button onClick={() => setSettings(s => s ? { ...s, sunEnabled: !s.sunEnabled } : s)}
                  className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    settings.sunEnabled ? 'bg-amber-500' : 'bg-white/10')}>
                  <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
                    settings.sunEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
              {!settings.sunEnabled && (
                <p className="text-xs text-white/20 italic mt-1">Off — no check-ins on Sunday</p>
              )}
            </div>
          </div>

          {/* Grace period */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Grace period (minutes)</label>
            <input type="number" min={0} max={30} value={settings.graceMinutes}
              onChange={e => setSettings(s => s ? { ...s, graceMinutes: Number(e.target.value) } : s)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/50" />
            <p className="text-xs text-white/20 mt-1">How long after a window closes a manual check-in is still accepted before it's marked MISSED.</p>
          </div>

          {/* Effective deduction date — Super Admin only, financial activation switch */}
          <div className="mb-5 bg-amber-500/5 ring-1 ring-amber-500/20 rounded-xl p-4">
            <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5">Deduction effective date</label>
            <input type="date" value={settings.effectiveDeductionDate ? settings.effectiveDeductionDate.slice(0, 10) : ''}
              onChange={e => setSettings(s => s ? { ...s, effectiveDeductionDate: e.target.value ? new Date(e.target.value).toISOString() : null } : s)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/50" />
            <p className="text-xs text-white/40 mt-1.5">
              {settings.effectiveDeductionDate
                ? 'Missed check-ins on or after this date create real deductions. Nothing before it is ever backfilled.'
                : 'Not set — missed check-ins are detected and notified, but NO financial deduction is created until this date is set.'}
            </p>
          </div>

          {/* Per-country deduction policy */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Deduction policy</p>
            <div className="space-y-2">
              {policies.map(p => (
                <div key={p.country} className="bg-white/3 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{p.country === 'NG' ? 'Nigeria' : 'Ghana'}</p>
                    <p className="text-xs text-white/30">{p.currency} per missed check-in</p>
                  </div>
                  <input
                    type="number" min={0}
                    placeholder={p.amount === null ? 'Not configured' : undefined}
                    defaultValue={p.amount ?? ''}
                    onBlur={e => savePolicy(p.country, e.target.value === '' ? null : Number(e.target.value))}
                    className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-right focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              ))}
              {policies.some(p => p.amount === null) && (
                <p className="text-xs text-amber-400/80">
                  A country above has no amount configured — its missed check-ins will never create a deduction until you set one.
                </p>
              )}
            </div>
          </div>

          <button onClick={saveSettings} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0a1628] font-bold px-5 py-2.5 rounded-xl text-sm mb-6 transition-colors">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </>
      ) : (
        <div className="h-20 bg-white/5 animate-pulse rounded-xl mb-6" />
      )}

      <div>
        <p className="text-xs font-bold text-white/30 uppercase tracking-wider mb-3">
          Tracked staff — check-in is opt-in
        </p>
        {staffList.length === 0 ? (
          <div className="h-16 bg-white/5 animate-pulse rounded-xl" />
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {staffList.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/3">
                <div>
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-white/30">{s.roleTitle}</p>
                </div>
                <button
                  onClick={() => toggleTracked(s.id, s.checkInTracked)}
                  disabled={toggling === s.id}
                  className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    s.checkInTracked ? 'bg-amber-500' : 'bg-white/10',
                    toggling === s.id && 'opacity-50')}
                >
                  <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
                    s.checkInTracked ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-white/20 mt-2">Only toggled-on staff are tracked and receive email alerts.</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function CheckInsTab() {
  const { role } = useStaffPermissions()
  const isSuperAdmin = role === 'super_admin'

  const [data,          setData]          = useState<LiveData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [loadErr,       setLoadErr]       = useState('')
  const [showSettings,  setShowSettings]  = useState(false)
  const [waiveTarget,   setWaiveTarget]   = useState<FlaggedRecord | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const res  = await fetch('/api/admin/check-ins/live')
      const json = await res.json() as LiveData
      if (!res.ok || json.error === 'not_configured') {
        setLoadErr('Check-in tables not set up yet — run the Supabase SQL first.')
        setData(null)
      } else if (!res.ok) {
        setLoadErr('Failed to load check-in data')
        setData(null)
      } else {
        setData(json)
      }
    } catch {
      setLoadErr('Network error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  const stats = data?.stats
  const staffStatus = data?.staffStatus ?? []
  const flagged = data?.flagged ?? []

  return (
    <div>
      {showSettings && isSuperAdmin && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSaved={() => { setShowSettings(false); load() }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-white/30">Live check-in status — manual check-in only</p>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          {isSuperAdmin && (
            <button onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          )}
        </div>
      </div>

      {loadErr && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-5 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {loadErr}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[0,1,2,3].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Checked in this window', value: `${stats.checkedInThisWindow} of ${stats.trackedTotal}` },
            { label: 'Missed check-ins today',  value: String(stats.missedToday) },
            { label: 'Pending review',          value: String(stats.pendingReview) },
            { label: 'Deductions this week',    value: fmtCurrencyMap(stats.weekDeductionsByCurrency) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#0d1a2d] rounded-2xl p-5">
              <p className="text-sm text-white/40 mb-2">{label}</p>
              <p className="text-2xl font-bold text-white leading-tight">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {staffStatus.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-white/30 mb-3">Staff status</p>
          <div className="bg-[#0d1a2d] rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Online status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Current check-in</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden sm:table-cell">Last manual check-in</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden md:table-cell">Missed today</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden md:table-cell">Deductions this week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {staffStatus.map(s => (
                  <tr key={s.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} missed={s.missedToday > 0} />
                        <span className="font-semibold text-white text-sm">{s.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <OnlineBadge online={s.online} lastActiveAt={s.lastActiveAt} />
                    </td>
                    <td className="px-4 py-4">
                      <CheckInBadge currentCheckIn={s.currentCheckIn} />
                    </td>
                    <td className="px-4 py-4 text-sm text-white/50 hidden sm:table-cell">
                      {fmtTime(s.lastManualCheckInAt)}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className={cn('text-sm font-semibold', s.missedToday > 0 ? 'text-red-400' : 'text-white/50')}>
                        {s.missedToday}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right hidden md:table-cell">
                      <span className={cn('text-sm font-semibold', Object.values(s.weekDeductionsByCurrency).some(v => v > 0) ? 'text-red-400' : 'text-white/50')}>
                        {fmtCurrencyMap(s.weekDeductionsByCurrency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && staffStatus.length === 0 && !loadErr && (
        <div className="text-center py-12">
          <CheckSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No tracked staff yet</p>
          <p className="text-white/20 text-xs mt-1">Enable tracking in Settings for individual staff members</p>
        </div>
      )}

      {flagged.length > 0 && (
        <div>
          <p className="text-sm text-white/30 mb-3">Flagged for review</p>
          <div className="space-y-3">
            {flagged.map(rec => (
              <div key={rec.id} className="bg-[#0d1a2d] rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <div className="w-4 h-4 rounded border-2 border-red-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm">
                    {rec.staff.name} missed the {fmtSlotHour(rec.windowStart)} check-in
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    No manual check-in was recorded during the required check-in window.
                    {rec.deductionAmt > 0 && ` · ${rec.deductionAmt.toLocaleString()} pending`}
                    {rec.disputeStatus === 'pending' && ' · dispute submitted'}
                  </p>
                  {rec.dispute && (
                    <p className="text-xs text-amber-400 mt-1 italic">"{rec.dispute}"</p>
                  )}
                </div>

                {isSuperAdmin && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setWaiveTarget(rec)}
                      className="px-4 py-2 rounded-xl text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/5 transition-colors whitespace-nowrap"
                    >
                      Waive
                    </button>
                    {rec.disputeStatus === 'pending' && (
                      <button
                        onClick={async () => {
                          await fetch(`/api/admin/check-ins/${rec.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'resolve', approved: true, reason: 'Dispute approved' }),
                          })
                          load()
                        }}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/30 hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                      >
                        Approve dispute
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {waiveTarget && (
        <WaiveModal record={waiveTarget} onClose={() => setWaiveTarget(null)} onDone={load} />
      )}
    </div>
  )
}
