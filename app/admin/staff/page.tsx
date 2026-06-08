'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus, RefreshCw, ShieldCheck, Eye, EyeOff, Pencil,
  Trash2, RotateCcw, CheckCircle, XCircle, ChevronDown, X,
  Users, Activity,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

type AccessLevel = 'Admin' | 'Manager' | 'Coordinator' | 'Sales'

type RbacRole = 'super_admin' | 'general_manager' | 'senior_manager' | 'coordinator' | 'sales_rep'

interface StaffMember {
  id: string
  name: string
  email: string
  roleTitle: string
  accessLevel: AccessLevel
  role: RbacRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

const RBAC_ROLES: { value: RbacRole; label: string; badge: string }[] = [
  { value: 'super_admin',     label: 'Super Admin',        badge: 'bg-violet-100 text-violet-700' },
  { value: 'general_manager', label: 'General Manager',    badge: 'bg-[#0B1F3A]/10 text-[#0B1F3A]' },
  { value: 'senior_manager',  label: 'Senior Manager',     badge: 'bg-[#C9A84C]/20 text-[#8a6b1e]' },
  { value: 'coordinator',     label: 'Coordinator',        badge: 'bg-blue-100 text-blue-700' },
  { value: 'sales_rep',       label: 'Sales Representative', badge: 'bg-green-100 text-green-700' },
]

interface ActivityEntry {
  id: string
  staffName: string | null
  action: string
  detail: string | null
  createdAt: string
}

const ACCESS_LEVELS: AccessLevel[] = ['Admin', 'Manager', 'Coordinator', 'Sales']

const LEVEL_COLORS: Record<AccessLevel, string> = {
  Admin:       'bg-[#0B1F3A] text-white',
  Manager:     'bg-[#C9A84C]/20 text-[#8a6b1e]',
  Coordinator: 'bg-blue-100 text-blue-700',
  Sales:       'bg-green-100 text-green-700',
}

const LEVEL_PERMS: Record<AccessLevel, string[]> = {
  Admin:       ['Full access to everything', 'Add & remove staff', 'Change all settings'],
  Manager:     ['Bookings, Clients, Tours, Visa — view & manage', 'Reports — view only', 'No access: Settings, Staff, Financials'],
  Coordinator: ['Assigned service area only', 'Clients — view only', 'No access: Settings, Staff, Financials'],
  Sales:       ['Leads — view & add only', 'No access: Bookings, Settings, Financials, Staff'],
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Add/Edit Staff Modal ────────────────────────────────────────────────────
function StaffModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: StaffMember
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!initial
  const [name,        setName]        = useState(initial?.name        ?? '')
  const [email,       setEmail]       = useState(initial?.email       ?? '')
  const [roleTitle,   setRoleTitle]   = useState(initial?.roleTitle   ?? '')
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(initial?.accessLevel ?? 'Sales')
  const [rbacRole,    setRbacRole]    = useState<RbacRole>(initial?.role ?? 'sales_rep')
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (isEdit) {
        const res = await fetch(`/api/admin/staff/${initial!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, roleTitle, accessLevel, role: rbacRole }),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? 'Failed to update'); return }
      } else {
        const res = await fetch('/api/admin/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, roleTitle, accessLevel, role: rbacRole, password }),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? 'Failed to create'); return }
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#C9A84C]" />
            <h2 className="font-bold text-[#0B1F3A]">
              {isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Full Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)} required
                placeholder="Jane Smith"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Email Address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="jane@walztravels.com"
                disabled={isEdit}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Role Title</label>
            <input
              value={roleTitle} onChange={e => setRoleTitle(e.target.value)} required
              placeholder="e.g. Senior Sales Agent, Visa Coordinator…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
            />
            <p className="text-xs text-gray-400 mt-1">Free text — type any role name</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Access Level</label>
              <div className="relative">
                <select
                  value={accessLevel} onChange={e => setAccessLevel(e.target.value as AccessLevel)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] pr-8"
                >
                  {ACCESS_LEVELS.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Portal Role</label>
              <div className="relative">
                <select
                  value={rbacRole} onChange={e => setRbacRole(e.target.value as RbacRole)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] pr-8"
                >
                  {RBAC_ROLES.filter(r => r.value !== 'super_admin').map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Controls sidebar & data access</p>
            </div>
          </div>
          {/* Permissions preview */}
          <ul className="space-y-0.5">
            {LEVEL_PERMS[accessLevel].map(p => (
              <li key={p} className="text-xs text-gray-500 flex items-start gap-1.5">
                <span className="text-[#C9A84C] mt-0.5">•</span>
                {p}
              </li>
            ))}
          </ul>

          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Temporary Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="Min. 8 characters"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Staff member will log in with this password</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold bg-[#0B1F3A] text-white rounded-xl hover:bg-[#1a3358] transition-colors disabled:opacity-60 flex items-center gap-2">
              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reset Password Modal ────────────────────────────────────────────────────
function ResetPasswordModal({
  staff,
  onClose,
  onDone,
}: {
  staff: StaffMember
  onClose: () => void
  onDone: () => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/staff/${staff.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed'); return }
      setSuccess(true)
      setTimeout(onDone, 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-bold text-[#0B1F3A] text-sm">Reset Password</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Set a new password for <span className="font-semibold text-[#0B1F3A]">{staff.name}</span>
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Password updated
            </div>
          )}
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={newPassword} onChange={e => setNewPassword(e.target.value)} required
              placeholder="New password (min. 8 chars)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
            />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || success}
              className="px-4 py-2 text-sm font-semibold bg-[#0B1F3A] text-white rounded-xl hover:bg-[#1a3358] disabled:opacity-60 flex items-center gap-2">
              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Reset Password
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function StaffPage() {
  const router = useRouter()
  const { can, loading: permLoading } = useStaffPermissions()

  const [staff,       setStaff]       = useState<StaffMember[]>([])
  const [activity,    setActivity]    = useState<ActivityEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<'staff' | 'activity'>('staff')
  const [showAdd,     setShowAdd]     = useState(false)
  const [editing,     setEditing]     = useState<StaffMember | null>(null)
  const [resetting,   setResetting]   = useState<StaffMember | null>(null)
  const [togglingId,  setTogglingId]  = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)

  // Access guard
  useEffect(() => {
    if (!permLoading && !can('staff_view')) router.replace('/admin/unauthorized')
  }, [permLoading, can, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [staffRes, actRes] = await Promise.all([
        fetch('/api/admin/staff'),
        fetch('/api/admin/activity'),
      ])
      const staffData = await staffRes.json()
      setStaff(staffData.staff ?? [])
      if (actRes.ok) {
        const actData = await actRes.json()
        setActivity(actData.logs ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(member: StaffMember) {
    setTogglingId(member.id)
    try {
      await fetch(`/api/admin/staff/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !member.isActive }),
      })
      await load()
    } finally {
      setTogglingId(null)
    }
  }

  async function deleteMember(member: StaffMember) {
    if (!confirm(`Remove ${member.name} permanently? This cannot be undone.`)) return
    setDeletingId(member.id)
    try {
      await fetch(`/api/admin/staff/${member.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  const activeCount   = staff.filter(s => s.isActive).length
  const inactiveCount = staff.filter(s => !s.isActive).length

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Staff &amp; Permissions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeCount} active · {inactiveCount} inactive · {staff.length} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1F3A] px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
          {can('staff_create') && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm">
              <UserPlus className="w-4 h-4" />
              Add Staff
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {([['staff', Users, 'Team'], ['activity', Activity, 'Activity Log']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Staff tab */}
      {tab === 'staff' && (
        loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : staff.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">No staff members yet</p>
            <p className="text-sm text-gray-400 mt-1">Click &quot;Add Staff&quot; to create the first account</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Access</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">
                            {member.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-[#0B1F3A]">{member.name}</p>
                          <p className="text-xs text-gray-400">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-gray-600">{member.roleTitle}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${LEVEL_COLORS[member.accessLevel]}`}>
                          <ShieldCheck className="w-3 h-3" />
                          {member.accessLevel}
                        </span>
                        {(() => {
                          const r = RBAC_ROLES.find(r => r.value === member.role)
                          return r ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${r.badge}`}>
                              {r.label}
                            </span>
                          ) : null
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-xs">
                      {fmtDate(member.lastLoginAt)}
                    </td>
                    <td className="px-4 py-4">
                      {member.isActive
                        ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                        : <span className="flex items-center gap-1 text-gray-400 text-xs font-medium"><XCircle className="w-3.5 h-3.5" />Inactive</span>
                      }
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        {can('staff_edit') && (
                          <button onClick={() => setEditing(member)}
                            className="p-1.5 text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Reset password */}
                        {can('staff_edit') && (
                          <button onClick={() => setResetting(member)}
                            className="p-1.5 text-gray-400 hover:text-[#C9A84C] hover:bg-[#C9A84C]/10 rounded-lg transition-colors" title="Reset password">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Toggle active */}
                        {can('staff_edit') && (
                          <button
                            onClick={() => toggleActive(member)}
                            disabled={togglingId === member.id}
                            className={`p-1.5 rounded-lg transition-colors ${
                              member.isActive
                                ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title={member.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {togglingId === member.id
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : member.isActive
                                ? <XCircle className="w-3.5 h-3.5" />
                                : <CheckCircle className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                        {/* Delete */}
                        {can('staff_delete') && (
                          <button
                            onClick={() => deleteMember(member)}
                            disabled={deletingId === member.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove">
                            {deletingId === member.id
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Activity Log tab */}
      {tab === 'activity' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {activity.length === 0 ? (
            <div className="p-16 text-center">
              <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">No activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {activity.map(log => (
                <div key={log.id} className="px-6 py-4 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity className="w-3.5 h-3.5 text-[#C9A84C]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0B1F3A]">{log.detail ?? log.action}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {log.staffName ?? 'System'} · {fmtDateTime(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Permissions reference card */}
      {tab === 'staff' && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-[#0B1F3A] text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C9A84C]" />
              Access Level Reference
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
            {ACCESS_LEVELS.map(level => (
              <div key={level} className="px-5 py-4">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mb-3 ${LEVEL_COLORS[level]}`}>
                  <ShieldCheck className="w-3 h-3" />
                  {level}
                </span>
                <ul className="space-y-1">
                  {LEVEL_PERMS[level].map(p => (
                    <li key={p} className="text-xs text-gray-500 flex items-start gap-1">
                      <span className="text-[#C9A84C] mt-0.5 flex-shrink-0">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <StaffModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
      {editing && (
        <StaffModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          staff={resetting}
          onClose={() => setResetting(null)}
          onDone={() => { setResetting(null); load() }}
        />
      )}
    </div>
  )
}
