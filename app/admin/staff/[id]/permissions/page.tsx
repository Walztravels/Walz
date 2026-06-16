'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, RotateCcw } from 'lucide-react'
import {
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  Permission,
  AdminRole,
} from '@/lib/admin/permissions'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

// All permissions grouped by module
const PERMISSION_GROUPS: { group: string; permissions: Permission[] }[] = [
  {
    group: 'Overview',
    permissions: ['dashboard', 'analytics', 'inbox'],
  },
  {
    group: 'Clients & Leads',
    permissions: ['clients', 'clients.create', 'clients.delete', 'clients.all', 'leads', 'leads.all'],
  },
  {
    group: 'Bookings',
    permissions: ['bookings', 'bookings.create', 'bookings.delete', 'bookings.all'],
  },
  {
    group: 'Flights',
    permissions: ['flights', 'flights.issue'],
  },
  {
    group: 'Hotels',
    permissions: ['hotels', 'hotels.manage'],
  },
  {
    group: 'Visa',
    permissions: ['visa', 'visa.approve', 'visa.documents'],
  },
  {
    group: 'Tours',
    permissions: ['tours', 'tours.manage', 'transfers'],
  },
  {
    group: 'Finance',
    permissions: ['payments', 'payments.refund', 'payments.all', 'commissions', 'payroll'],
  },
  {
    group: 'Reports & Approvals',
    permissions: ['reports', 'reports.financial', 'reports.all', 'approvals', 'approvals.resolve'],
  },
  {
    group: 'Content',
    permissions: ['content', 'blog', 'blog.publish', 'documents'],
  },
  {
    group: 'System',
    permissions: ['staff', 'staff.create', 'staff.edit', 'staff.delete', 'suppliers', 'tools', 'audit_logs', 'api_keys', 'settings'],
  },
]

const BRANCHES = ['nigeria', 'uk', 'canada', 'ghana', 'uae', 'remote']
const DEPARTMENTS = ['general', 'visa', 'flights', 'tours', 'hotels', 'sales', 'accounts', 'support']
const NEW_ROLES = Object.keys(ROLE_LABELS) as AdminRole[]

interface StaffRecord {
  id:          string
  name:        string
  email:       string
  role:        string
  branch:      string
  department:  string
  permissions: Record<string, boolean>
}

type OverrideState = Record<Permission, boolean | null>

export default function StaffPermissionsPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { profile } = useStaffPermissions()

  const [staff,     setStaff]     = useState<StaffRecord | null>(null)
  const [role,      setRole]      = useState('')
  const [branch,    setBranch]    = useState('')
  const [dept,      setDept]      = useState('')
  const [overrides, setOverrides] = useState<OverrideState>({} as OverrideState)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')

  useEffect(() => {
    fetch(`/api/admin/staff/${id}`)
      .then(r => r.json())
      .then((d: { staff?: StaffRecord }) => {
        if (d.staff) {
          setStaff(d.staff)
          setRole(d.staff.role)
          setBranch(d.staff.branch ?? 'nigeria')
          setDept(d.staff.department ?? 'general')
          setOverrides((d.staff.permissions ?? {}) as OverrideState)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  if (profile && profile.role !== 'super_admin') {
    return (
      <div className="p-10 text-center">
        <p className="text-red-600 font-bold">Access denied — super_admin only</p>
      </div>
    )
  }

  if (loading || !staff) {
    return (
      <div className="p-10 text-center">
        <div className="w-8 h-8 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  const currentRole = role as AdminRole
  const rolePerms   = ROLE_PERMISSIONS[currentRole] ?? []

  function getState(p: Permission): 'on' | 'off' | 'default' {
    if (overrides[p] === true)  return 'on'
    if (overrides[p] === false) return 'off'
    return 'default'
  }

  function cyclePermission(p: Permission) {
    setOverrides(prev => {
      const cur = prev[p]
      if (cur === undefined || cur === null) return { ...prev, [p]: true }
      if (cur === true)                      return { ...prev, [p]: false }
      return { ...prev, [p]: null }
    })
  }

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const cleaned: Record<string, boolean | null> = {}
      for (const [k, v] of Object.entries(overrides)) {
        if (v !== null && v !== undefined) cleaned[k] = v as boolean
      }

      const res = await fetch(`/api/admin/staff/${id}/permissions`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permissions: cleaned, role, branch, department: dept }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setMsg('Saved successfully')
    } catch (e: unknown) {
      setMsg((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const badgeClass = ROLE_BADGE_CLASSES[currentRole] ?? 'bg-gray-500 text-white'

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Permissions Editor</h1>
          <p className="text-gray-500 text-sm">{staff.name} · {staff.email}</p>
        </div>
      </div>

      {/* Staff profile card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Identity & Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            >
              {NEW_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
              {ROLE_LABELS[currentRole] ?? role}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Branch</label>
            <select
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            >
              {BRANCHES.map(b => (
                <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Department</label>
            <select
              value={dept}
              onChange={e => setDept(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            >
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Override ON
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Override OFF
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gray-200 inline-block" /> Default (role)
        </span>
        <span className="text-gray-400">Click each pill to cycle: Default → ON → OFF → Default</span>
      </div>

      {/* Permission groups */}
      {PERMISSION_GROUPS.map(({ group, permissions }) => (
        <div key={group} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-[#0B1F3A] mb-3">{group}</h3>
          <div className="flex flex-wrap gap-2">
            {permissions.map(p => {
              const state      = getState(p)
              const roleGrants = rolePerms.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => cyclePermission(p)}
                  title={`Role default: ${roleGrants ? '✅' : '❌'}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    state === 'on'
                      ? 'bg-green-100 border-green-400 text-green-800'
                      : state === 'off'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : roleGrants
                      ? 'bg-gray-100 border-gray-300 text-gray-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    state === 'on'
                      ? 'bg-green-500'
                      : state === 'off'
                      ? 'bg-red-400'
                      : roleGrants
                      ? 'bg-gray-400'
                      : 'bg-gray-200'
                  }`} />
                  {p}
                  <span className="opacity-60 ml-0.5">{roleGrants ? '✓' : '✗'}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Save bar */}
      <div className="sticky bottom-4 bg-white border border-gray-200 rounded-2xl shadow-lg px-6 py-4 flex items-center justify-between">
        <div>
          {msg && (
            <p className={`text-sm font-semibold ${msg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
              {msg}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setOverrides({} as OverrideState); setMsg('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Overrides
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-[#162e55] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

    </div>
  )
}
