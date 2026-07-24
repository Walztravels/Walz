'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Settings, X, AlertCircle, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

// ── Types ─────────────────────────────────────────────────────────────────────
type LiveStatus = 'active_call' | 'active_admin' | 'missed' | 'pending' | null

interface StaffStatusRow {
  id:             string
  name:           string
  role:           string
  roleTitle:      string
  status:         LiveStatus
  lastActivityAt: string | null
  missedToday:    number
  weekDeductions: number
}

interface FlaggedRecord {
  id:            string
  staffId:       string
  windowStart:   string
  deductionAmt:  number
  disputeStatus: string | null
  dispute:       string | null
  staff: { id: string; name: string; roleTitle: string }
}

interface LiveData {
  staffStatus: StaffStatusRow[]
  stats: {
    activeNow:      number
    trackedTotal:   number
    missedToday:    number
    pendingReview:  number
    weekDeductions: number
  }
  flagged: FlaggedRecord[]
  error?:  string
}

interface CheckInSettingsData {
  enabled:          boolean
  workStartHour:    number
  workEndHour:      number
  deductionPerMiss: number
}

interface StaffListItem {
  id:             string
  name:           string
  roleTitle:      string
  role:           string
  checkInTracked: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  // Convert to Lagos time (UTC+1)
  const lagos = new Date(d.getTime() + 60 * 60 * 1000)
  return lagos.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtSlotHour(iso: string) {
  const d     = new Date(iso)
  const lagos = new Date(d.getTime() + 60 * 60 * 1000)
  const h     = lagos.getUTCHours()
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function fmtNaira(n: number) {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, status }: { name: string; status: LiveStatus }) {
  const color =
    status === 'active_call' || status === 'active_admin' ? 'bg-[#1a3a5c]' :
    status === 'missed' ? 'bg-[#3d1a1a]' :
    'bg-[#1c2940]'
  const textColor =
    status === 'active_call' || status === 'active_admin' ? 'text-blue-300' :
    status === 'missed' ? 'text-red-300' :
    'text-white/50'

  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${color} ${textColor}`}>
      {initials(name)}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: LiveStatus }) {
  if (status === 'active_call') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-medium">
        Active — on call
      </span>
    )
  }
  if (status === 'active_admin') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-medium">
        Active — admin panel
      </span>
    )
  }
  if (status === 'missed') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-md bg-red-500/15 text-red-400 text-xs font-medium">
        Missed check-in
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-md bg-amber-500/15 text-amber-400 text-xs font-medium">
        Pending review
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-md bg-white/5 text-white/30 text-xs font-medium">
      No activity yet
    </span>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings,    setSettings]    = useState<CheckInSettingsData | null>(null)
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

          <div className="grid grid-cols-3 gap-4 mb-5">
            {(['workStartHour', 'workEndHour'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  {field === 'workStartHour' ? 'Work start' : 'Work end'}
                </label>
                <select value={settings[field]}
                  onChange={e => setSettings(s => s ? { ...s, [field]: Number(e.target.value) } : s)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/50">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i} className="bg-[#0d1e35]">{String(i).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Deduction / miss (₦)</label>
              <input type="number" min={0} value={settings.deductionPerMiss}
                onChange={e => setSettings(s => s ? { ...s, deductionPerMiss: Number(e.target.value) } : s)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/50" />
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
  const [waiving,       setWaiving]       = useState<string | null>(null)
  const [applyingDeduct, setApplyingDeduct] = useState<string | null>(null)
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

  async function waive(id: string) {
    setWaiving(id)
    await fetch(`/api/admin/check-ins/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'waive' }),
    })
    setWaiving(null)
    load()
  }

  async function applyDeduction(id: string) {
    // Mark as flagged/confirmed deduction — currently "resolve" with approved=false keeps it flagged
    // For now this is a visual confirmation; deduction is already set by the cron
    setApplyingDeduct(id)
    await fetch(`/api/admin/check-ins/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', approved: false }),
    })
    setApplyingDeduct(null)
    load()
  }

  const stats = data?.stats
  const staffStatus = data?.staffStatus ?? []
  const flagged = data?.flagged ?? []

  return (
    <div>
      {/* Settings panel */}
      {showSettings && isSuperAdmin && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSaved={() => { setShowSettings(false); load() }}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-white/30">Hourly check-in status, live</p>
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

      {/* Error */}
      {loadErr && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-5 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {loadErr}
        </div>
      )}

      {/* Stats row */}
      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[0,1,2,3].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active now',               value: `${stats.activeNow} of ${stats.trackedTotal}` },
            { label: 'Missed check-ins today',   value: String(stats.missedToday) },
            { label: 'Pending review',           value: String(stats.pendingReview) },
            { label: 'Deductions this week',     value: fmtNaira(stats.weekDeductions) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#0d1a2d] rounded-2xl p-5">
              <p className="text-sm text-white/40 mb-2">{label}</p>
              <p className="text-3xl font-bold text-white leading-none">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Staff status table */}
      {staffStatus.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-white/30 mb-3">Staff status</p>
          <div className="bg-[#0d1a2d] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden sm:table-cell">Last check-in</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden md:table-cell">Missed today</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden md:table-cell">This week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {staffStatus.map(s => (
                  <tr key={s.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} status={s.status} />
                        <span className="font-semibold text-white text-sm">{s.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-4 text-sm text-white/50 hidden sm:table-cell">
                      {fmtTime(s.lastActivityAt)}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className={cn('text-sm font-semibold', s.missedToday > 0 ? 'text-red-400' : 'text-white/50')}>
                        {s.missedToday}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right hidden md:table-cell">
                      <span className={cn('text-sm font-semibold', s.weekDeductions > 0 ? 'text-red-400' : 'text-white/50')}>
                        {fmtNaira(s.weekDeductions)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No tracked staff */}
      {!loading && staffStatus.length === 0 && !loadErr && (
        <div className="text-center py-12">
          <CheckSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No tracked staff yet</p>
          <p className="text-white/20 text-xs mt-1">Enable tracking in Settings for individual staff members</p>
        </div>
      )}

      {/* Flagged for review */}
      {flagged.length > 0 && (
        <div>
          <p className="text-sm text-white/30 mb-3">Flagged for review</p>
          <div className="space-y-3">
            {flagged.map(rec => (
              <div key={rec.id} className="bg-[#0d1a2d] rounded-2xl p-4 flex items-center gap-4">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <div className="w-4 h-4 rounded border-2 border-red-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm">
                    {rec.staff.name} missed the {fmtSlotHour(rec.windowStart)} check-in
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    No phone or admin activity detected
                    {rec.deductionAmt > 0 && ` · ${fmtNaira(rec.deductionAmt)} pending`}
                    {rec.disputeStatus === 'pending' && ' · dispute submitted'}
                  </p>
                  {rec.dispute && (
                    <p className="text-xs text-amber-400 mt-1 italic">"{rec.dispute}"</p>
                  )}
                </div>

                {/* Actions */}
                {isSuperAdmin && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => waive(rec.id)}
                      disabled={waiving === rec.id}
                      className="px-4 py-2 rounded-xl text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {waiving === rec.id ? 'Waiving…' : 'Waive'}
                    </button>
                    {rec.deductionAmt > 0 && rec.disputeStatus !== 'pending' && (
                      <button
                        onClick={() => applyDeduction(rec.id)}
                        disabled={applyingDeduct === rec.id}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/10 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {applyingDeduct === rec.id ? 'Applying…' : 'Apply deduction'}
                      </button>
                    )}
                    {rec.disputeStatus === 'pending' && (
                      <button
                        onClick={async () => {
                          await fetch(`/api/admin/check-ins/${rec.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'resolve', approved: true }),
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
    </div>
  )
}
