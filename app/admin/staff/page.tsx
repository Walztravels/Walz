'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus, RefreshCw, ShieldCheck, Eye, EyeOff, Pencil,
  Trash2, RotateCcw, CheckCircle, XCircle, X, Users, Activity,
  Globe, ChevronDown,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type RbacRole =
  | 'super_admin'
  | 'operations_manager'
  | 'general_manager'
  | 'senior_manager'
  | 'visa_officer'
  | 'flight_staff'
  | 'tours_staff'
  | 'hotel_staff'
  | 'sales_agent'
  | 'sales_rep'
  | 'coordinator'
  | 'accountant'
  | 'customer_support'

interface StaffMember {
  id:           string
  name:         string
  email:        string
  roleTitle:    string
  role:         RbacRole
  portalAccess: boolean
  isActive:     boolean
  lastLoginAt:  string | null
  createdAt:    string
}

interface ActivityEntry {
  id:        string
  staffName: string | null
  action:    string
  detail:    string | null
  createdAt: string
}

// ── Role configuration ────────────────────────────────────────────────────────
const STAFF_ROLES: {
  value:           RbacRole
  label:           string
  description:     string   // short — table reference card
  fullDescription: string   // long — shown in form info box
  badge:           string
  dot:             string
}[] = [
  {
    value:           'operations_manager',
    label:           'Operations Manager',
    description:     'All bookings, clients & staff oversight',
    fullDescription: 'Full operational access. Manages all bookings, clients, visa processing, supplier management and staff performance. Cannot access system settings or API credentials.',
    badge:           'bg-blue-100 text-blue-700',
    dot:             'bg-blue-500',
  },
  {
    value:           'general_manager',
    label:           'General Manager',
    description:     'Broad access — bookings, clients, visa & tours',
    fullDescription: 'Operations access. Manages clients, bookings, visa applications and trip planner. Cannot access staff management, settings or financial reports.',
    badge:           'bg-indigo-100 text-indigo-700',
    dot:             'bg-indigo-500',
  },
  {
    value:           'senior_manager',
    label:           'Senior Manager',
    description:     'Bookings, visa, clients & reports',
    fullDescription: 'Senior management access. Manages bookings, visa applications and client records. Has access to reports and analytics. Cannot manage staff or settings.',
    badge:           'bg-teal-100 text-teal-700',
    dot:             'bg-teal-500',
  },
  {
    value:           'visa_officer',
    label:           'Visa Officer',
    description:     'Visa applications, documents & compliance',
    fullDescription: 'Visa department access only. Processes visa applications, reviews documents, tracks embassy appointments and manages compliance reports.',
    badge:           'bg-purple-100 text-purple-700',
    dot:             'bg-purple-500',
  },
  {
    value:           'flight_staff',
    label:           'Flight Ticketing Staff',
    description:     'Flights, tickets, PNRs & refunds',
    fullDescription: 'Flight operations access. Issues and manages tickets, PNR management, refund requests and airline communications. No access to visa or accounts.',
    badge:           'bg-sky-100 text-sky-700',
    dot:             'bg-sky-500',
  },
  {
    value:           'tours_staff',
    label:           'Tours & Activities Staff',
    description:     'Tours, activities & vouchers',
    fullDescription: 'Tours department access. Manages tours, Hotelbeds activities, tour guides and customer vouchers.',
    badge:           'bg-green-100 text-green-700',
    dot:             'bg-green-500',
  },
  {
    value:           'hotel_staff',
    label:           'Hotel Reservation Staff',
    description:     'Hotel bookings & guest management',
    fullDescription: 'Hotel department access. Manages hotel bookings, supplier relationships and guest management.',
    badge:           'bg-cyan-100 text-cyan-700',
    dot:             'bg-cyan-500',
  },
  {
    value:           'sales_agent',
    label:           'Sales Agent',
    description:     'Assigned leads, CRM & quotes',
    fullDescription: 'Sales access only. Manages assigned leads, CRM, quotes and invoices. Can only see their own clients and leads. Cannot see other agents data.',
    badge:           'bg-orange-100 text-orange-700',
    dot:             'bg-orange-500',
  },
  {
    value:           'coordinator',
    label:           'Coordinator',
    description:     'Visa, clients & bookings coordination',
    fullDescription: 'Coordination access. Manages visa processing, client files and booking coordination. Cannot see financial reports or staff management.',
    badge:           'bg-amber-100 text-amber-700',
    dot:             'bg-amber-500',
  },
  {
    value:           'sales_rep',
    label:           'Sales Representative',
    description:     'Leads and reports only',
    fullDescription: 'Leads and reports only. Manages leads and submits daily reports. View only access to clients.',
    badge:           'bg-yellow-100 text-yellow-700',
    dot:             'bg-yellow-500',
  },
  {
    value:           'accountant',
    label:           'Accountant',
    description:     'Payments, refunds & financial reports',
    fullDescription: 'Finance access only. Manages payments, refunds, invoices and revenue reports. Cannot modify bookings or visa files.',
    badge:           'bg-rose-100 text-rose-700',
    dot:             'bg-rose-500',
  },
  {
    value:           'customer_support',
    label:           'Customer Support',
    description:     'Tickets, client profiles & booking status',
    fullDescription: 'Support access only. Manages support tickets, client profiles and booking status updates. Cannot issue refunds or access financial data.',
    badge:           'bg-slate-100 text-slate-700',
    dot:             'bg-slate-500',
  },
]

// super_admin badge — only shown in table, not selectable in form
const SUPER_ADMIN_BADGE = 'bg-violet-100 text-violet-700'

function getRoleMeta(role: string) {
  const found = STAFF_ROLES.find(r => r.value === role)
  if (found) return found
  if (role === 'super_admin') return {
    value: 'super_admin', label: 'Super Admin',
    description: 'Full system access',
    badge: SUPER_ADMIN_BADGE, dot: 'bg-violet-500',
  }
  return { value: role, label: role, description: '', badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── Add / Edit Staff Modal ────────────────────────────────────────────────────
function StaffModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?:  StaffMember
  onClose:   () => void
  onSaved:   () => void
}) {
  const isEdit = !!initial

  const [name,         setName]         = useState(initial?.name         ?? '')
  const [email,        setEmail]        = useState(initial?.email        ?? '')
  const [roleTitle,    setRoleTitle]    = useState(initial?.roleTitle    ?? '')
  const [role,         setRole]         = useState<RbacRole>(
    // super_admin can't be set via UI — default edit to operations_manager for display
    (initial?.role === 'super_admin' ? 'operations_manager' : initial?.role) ?? 'sales_rep'
  )
  const [portalAccess, setPortalAccess] = useState(initial?.portalAccess ?? false)
  const [password,     setPassword]     = useState('')
  const [showPw,       setShowPw]       = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const selectedRole = STAFF_ROLES.find(r => r.value === role)!

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (isEdit) {
        const res = await fetch(`/api/admin/staff/${initial!.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, roleTitle, role, portalAccess }),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? 'Failed to update'); return }
      } else {
        const res = await fetch('/api/admin/staff', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, email, roleTitle, role, portalAccess, password }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] my-auto">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl">
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

        <form onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <input
                value={name} onChange={e => setName(e.target.value)} required
                placeholder="Jane Smith"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required disabled={isEdit}
                placeholder="jane@walztravels.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          {/* Job title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              Job Title
            </label>
            <input
              value={roleTitle} onChange={e => setRoleTitle(e.target.value)} required
              placeholder="e.g. Senior Sales Agent, Visa Coordinator…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
            />
            <p className="text-xs text-gray-400 mt-1">Free text — type any job title</p>
          </div>

          {/* Staff Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              Staff Role
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={e => setRole(e.target.value as RbacRole)}
                required
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 appearance-none focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] pr-9"
              >
                <option value="" disabled>Select a role…</option>
                {STAFF_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {/* Dynamic description */}
            {role && selectedRole && (
              <div className="mt-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2">
                <span className={cn('mt-0.5 w-2 h-2 rounded-full flex-shrink-0', selectedRole.dot)} />
                <p className="text-xs text-blue-800 leading-relaxed">{selectedRole.fullDescription}</p>
              </div>
            )}
          </div>

          {/* Portal Access toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
              Client Portal Access
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPortalAccess(false)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                  !portalAccess
                    ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                <XCircle className="w-4 h-4" />
                No — Admin only
              </button>
              <button
                type="button"
                onClick={() => setPortalAccess(true)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                  portalAccess
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                <Globe className="w-4 h-4" />
                Yes — Portal + Admin
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {portalAccess
                ? 'Staff can log in to both the admin panel and the client portal.'
                : 'Admin panel access only.'}
            </p>
          </div>

          {/* Temporary password (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Temporary Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="Min. 8 characters"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                A welcome email with login details will be sent automatically.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
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

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({
  staff,
  onClose,
  onDone,
}: {
  staff:   StaffMember
  onClose: () => void
  onDone:  () => void
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newPassword }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto my-auto">
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
          {error   && <p className="text-sm text-red-500">{error}</p>}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const router = useRouter()
  const { can, loading: permLoading } = useStaffPermissions()

  const [staff,      setStaff]      = useState<StaffMember[]>([])
  const [activity,   setActivity]   = useState<ActivityEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'staff' | 'activity'>('staff')
  const [showAdd,    setShowAdd]    = useState(false)
  const [editing,    setEditing]    = useState<StaffMember | null>(null)
  const [resetting,  setResetting]  = useState<StaffMember | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isActive: !member.isActive }),
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
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              tab === id ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}>
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
              {[1, 2, 3].map(i => (
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
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Title</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Portal</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {staff.map((member) => {
                  const roleMeta = getRoleMeta(member.role)
                  return (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">

                      {/* Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">
                              {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-[#0B1F3A]">{member.name}</p>
                            <p className="text-xs text-gray-400">{member.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Job title */}
                      <td className="px-4 py-4 text-gray-600 text-sm">{member.roleTitle}</td>

                      {/* Role badge */}
                      <td className="px-4 py-4">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                          roleMeta.badge
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', roleMeta.dot)} />
                          {roleMeta.label}
                        </span>
                      </td>

                      {/* Portal access */}
                      <td className="px-4 py-4">
                        {member.portalAccess ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                            No
                          </span>
                        )}
                      </td>

                      {/* Last login */}
                      <td className="px-4 py-4 text-gray-500 text-xs">{fmtDate(member.lastLoginAt)}</td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        {member.isActive
                          ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                          : <span className="flex items-center gap-1 text-gray-400 text-xs font-medium"><XCircle className="w-3.5 h-3.5" />Inactive</span>
                        }
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {can('staff_edit') && (
                            <button onClick={() => setEditing(member)}
                              className="p-1.5 text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {can('staff_edit') && (
                            <button onClick={() => setResetting(member)}
                              className="p-1.5 text-gray-400 hover:text-[#C9A84C] hover:bg-[#C9A84C]/10 rounded-lg transition-colors" title="Reset password">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {can('staff_edit') && (
                            <button
                              onClick={() => toggleActive(member)}
                              disabled={togglingId === member.id}
                              className={cn(
                                'p-1.5 rounded-lg transition-colors',
                                member.isActive
                                  ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                              )}
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
                  )
                })}
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

      {/* Role reference card */}
      {tab === 'staff' && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-[#0B1F3A] text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C9A84C]" />
              Role Permissions Reference
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
            {STAFF_ROLES.map(r => (
              <div key={r.value} className="px-5 py-4">
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3',
                  r.badge
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', r.dot)} />
                  {r.label}
                </span>
                <p className="text-xs text-gray-500 leading-relaxed">{r.description}</p>
                <p className="text-xs text-gray-400 mt-1.5">
                  Permissions set in{' '}
                  <a href="/admin/settings/roles" className="text-[#C9A84C] hover:underline font-medium">
                    Role Manager
                  </a>
                </p>
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
