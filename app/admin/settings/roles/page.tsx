'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Save, RotateCcw, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import { ROLE_HIERARCHY, ROLE_LABELS, ROLE_BG_CLASSES, type Role, type PermissionKey } from '@/lib/permissions'
import { cn } from '@/lib/utils'

// ── Permission groups for display ─────────────────────────────────────────────
const PERMISSION_GROUPS: Array<{ label: string; keys: PermissionKey[] }> = [
  {
    label: 'Dashboard',
    keys:  ['dashboard_view', 'dashboard_stats_all'],
  },
  {
    label: 'Staff Management',
    keys:  ['staff_view', 'staff_create', 'staff_edit', 'staff_delete', 'staff_manage_roles'],
  },
  {
    label: 'Applications',
    keys:  ['applications_view', 'applications_view_all', 'applications_create', 'applications_edit', 'applications_delete', 'applications_assign', 'applications_approve'],
  },
  {
    label: 'Visa',
    keys:  ['visa_view', 'visa_view_all', 'visa_create', 'visa_edit', 'visa_delete', 'visa_approve'],
  },
  {
    label: 'Trip Planner',
    keys:  ['trips_view', 'trips_view_all', 'trips_create', 'trips_edit', 'trips_delete', 'trips_assign', 'trips_proposals'],
  },
  {
    label: 'Bookings',
    keys:  ['bookings_view', 'bookings_view_all', 'bookings_create', 'bookings_edit', 'bookings_delete'],
  },
  {
    label: 'Payments',
    keys:  ['payments_view', 'payments_view_all', 'payments_create', 'payments_edit', 'payments_delete', 'payments_refund'],
  },
  {
    label: 'Reports',
    keys:  ['reports_view', 'reports_all', 'reports_revenue', 'reports_staff', 'reports_export'],
  },
  {
    label: 'Settings',
    keys:  ['settings_view', 'settings_edit', 'settings_roles', 'settings_integrations'],
  },
  {
    label: 'Content (CMS)',
    keys:  ['cms_view', 'cms_edit', 'cms_publish'],
  },
  {
    label: 'Notifications',
    keys:  ['notifications_view', 'notifications_send', 'notifications_broadcast'],
  },
]

const KEY_LABELS: Record<string, string> = {
  dashboard_view:           'View Dashboard',
  dashboard_stats_all:      'See All Stats',
  staff_view:               'View Staff',
  staff_create:             'Create Staff',
  staff_edit:               'Edit Staff',
  staff_delete:             'Delete Staff',
  staff_manage_roles:       'Manage Roles',
  applications_view:        'View Applications',
  applications_view_all:    'View All Applications',
  applications_create:      'Create Application',
  applications_edit:        'Edit Application',
  applications_delete:      'Delete Application',
  applications_assign:      'Assign Application',
  applications_approve:     'Approve Application',
  visa_view:                'View Visa Apps',
  visa_view_all:            'View All Visa Apps',
  visa_create:              'Create Visa App',
  visa_edit:                'Edit Visa App',
  visa_delete:              'Delete Visa App',
  visa_approve:             'Approve Visa App',
  trips_view:               'View Trips',
  trips_view_all:           'View All Trips',
  trips_create:             'Create Trip',
  trips_edit:               'Edit Trip',
  trips_delete:             'Delete Trip',
  trips_assign:             'Assign Trip',
  trips_proposals:          'Manage Proposals',
  bookings_view:            'View Bookings',
  bookings_view_all:        'View All Bookings',
  bookings_create:          'Create Booking',
  bookings_edit:            'Edit Booking',
  bookings_delete:          'Delete Booking',
  payments_view:            'View Payments',
  payments_view_all:        'View All Payments',
  payments_create:          'Create Payment',
  payments_edit:            'Edit Payment',
  payments_delete:          'Delete Payment',
  payments_refund:          'Issue Refund',
  reports_view:             'View Reports',
  reports_all:              'View All Reports',
  reports_revenue:          'View Revenue Reports',
  reports_staff:            'View Staff Reports',
  reports_export:           'Export Reports',
  settings_view:            'View Settings',
  settings_edit:            'Edit Settings',
  settings_roles:           'Manage Role Permissions',
  settings_integrations:    'Manage Integrations',
  cms_view:                 'View CMS',
  cms_edit:                 'Edit Content',
  cms_publish:              'Publish Content',
  notifications_view:       'View Notifications',
  notifications_send:       'Send Notifications',
  notifications_broadcast:  'Broadcast to All',
}

type RoleData = {
  role:        string
  label:       string
  color:       string
  permissions: Record<string, boolean>
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative w-10 h-5 rounded-full transition-all flex-shrink-0',
        checked ? 'bg-[#C9A84C]' : 'bg-gray-200',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
        checked && 'translate-x-5',
      )} />
    </button>
  )
}

export default function RoleManagerPage() {
  const router = useRouter()
  const { can, role: myRole, loading: permLoading } = useStaffPermissions()

  const [roles,   setRoles]   = useState<RoleData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [saved,   setSaved]   = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [openRole, setOpenRole] = useState<string | null>('general_manager')

  // Access guard
  useEffect(() => {
    if (!permLoading && !can('settings_roles')) {
      router.replace('/admin/unauthorized')
    }
  }, [permLoading, can, router])

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/roles', { credentials: 'include' })
      const data = await res.json().catch(() => null)
      console.log('[RoleManager] fetchRoles status:', res.status, 'isArray:', Array.isArray(data))
      if (!res.ok) {
        setError(data?.error ?? `Failed to load roles (HTTP ${res.status})`)
        return
      }
      if (Array.isArray(data)) {
        setRoles(data)
      } else {
        setError('Unexpected response from server — roles not loaded')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[RoleManager] fetchRoles error:', msg)
      setError('Failed to load role permissions: ' + msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  async function handleSave(roleSlug: string) {
    const rp = roles.find((r) => r.role === roleSlug)
    if (!rp) return
    setSaving(roleSlug)
    setError(null)

    console.log('[RoleManager] Saving role:', roleSlug)
    console.log('[RoleManager] Permissions:', rp.permissions)

    try {
      const res = await fetch(`/api/admin/roles/${roleSlug}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ permissions: rp.permissions }),
      })

      const data = await res.json().catch(() => ({}))
      console.log('[RoleManager] Response status:', res.status, 'body:', data)

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status} — save failed`)
      }

      setSaved(roleSlug)
      setTimeout(() => setSaved(null), 3000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[RoleManager] Save error:', msg)
      setError(`Failed to save ${rp.label}: ${msg}`)
    } finally {
      setSaving(null)
    }
  }

  function togglePermission(roleSlug: string, key: string, value: boolean) {
    setRoles((prev) => prev.map((r) =>
      r.role === roleSlug
        ? { ...r, permissions: { ...r.permissions, [key]: value } }
        : r
    ))
  }

  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Ordered by hierarchy (most privileged last = displayed first for impact)
  const orderedRoles = [...roles].sort(
    (a, b) => ROLE_HIERARCHY.indexOf(b.role as Role) - ROLE_HIERARCHY.indexOf(a.role as Role)
  )

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-[#C9A84C]" />
            <h1 className="text-xl font-bold text-[#0B1F3A]">Role Manager</h1>
          </div>
          <p className="text-sm text-gray-500">
            Edit default permissions for each role. Changes apply immediately to all staff with that role.
            Individual staff overrides set via their profile will still take precedence.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <X className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Note: super_admin always has all permissions */}
      <div className="mb-6 p-4 bg-violet-50 border border-violet-100 rounded-xl text-violet-700 text-sm">
        <strong>Super Admin</strong> always has full access to everything — their permissions cannot be reduced here.
        New Super Admins can only be created directly via the database.
      </div>

      {/* Role cards */}
      <div className="space-y-3">
        {orderedRoles.map((rp) => {
          const isSuperAdmin = rp.role === 'super_admin'
          const isOpen       = openRole === rp.role
          const badgeClass   = ROLE_BG_CLASSES[rp.role as Role] ?? 'bg-gray-500 text-white'
          const isSaving     = saving === rp.role
          const isSaved      = saved  === rp.role
          const isMe         = rp.role === myRole

          return (
            <div key={rp.role} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Role header row */}
              <button
                type="button"
                onClick={() => setOpenRole(isOpen ? null : rp.role)}
                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50/60 transition-colors text-left"
              >
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', badgeClass)}>
                  {ROLE_LABELS[rp.role as Role] ?? rp.label}
                </span>
                {isMe && (
                  <span className="text-xs text-gray-400 italic">(your role)</span>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  {Object.values(rp.permissions).filter(Boolean).length} / {Object.keys(rp.permissions).length} permissions
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {/* Permission groups */}
              {isOpen && (
                <div className="border-t border-gray-100 px-6 py-5">
                  {isSuperAdmin ? (
                    <p className="text-sm text-gray-500 italic">Super Admin has all permissions. These cannot be modified.</p>
                  ) : (
                    <>
                      <div className="space-y-6">
                        {PERMISSION_GROUPS.map(({ label: groupLabel, keys }) => (
                          <div key={groupLabel}>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{groupLabel}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {keys.map((key) => (
                                <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                                  <span className="text-sm text-gray-700">{KEY_LABELS[key] ?? key}</span>
                                  <Toggle
                                    checked={rp.permissions[key] === true}
                                    onChange={(v) => togglePermission(rp.role, key, v)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Save / Reset */}
                      <div className="mt-6 flex items-center gap-3 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => handleSave(rp.role)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-5 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0B1F3A]/90 transition-all disabled:opacity-60"
                        >
                          {isSaving ? (
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : isSaved ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          {isSaved ? 'Saved!' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => fetchRoles()}
                          title="Discard unsaved changes"
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
