'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Lock, Unlock, Check, X, RotateCcw,
  Search, ChevronDown, ChevronRight, Save, AlertCircle,
  Users, Loader2,
} from 'lucide-react'
import {
  ROLE_PERMISSIONS, ALL_PERMISSIONS,
  type AdminRole, type Permission,
} from '@/lib/admin/permissions'
import { PERMISSION_GROUPS, ROLE_DEFAULTS } from '@/lib/permissions'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

// ─── Permission groups with descriptions ─────────────────────────────────────

interface PermMeta {
  label: string
  desc:  string
}

const PERM_META: Record<Permission, PermMeta> = {
  dashboard:              { label: 'Dashboard',                      desc: 'View admin dashboard and summary cards' },
  analytics:              { label: 'Analytics',                      desc: 'Access charts, revenue graphs, KPI trends' },
  inbox:                  { label: 'Inbox',                          desc: 'View and reply to client messages' },
  clients:                { label: 'View Clients',                   desc: 'See client list and profiles' },
  'clients.create':       { label: 'Create Clients',                 desc: 'Add new client records' },
  'clients.delete':       { label: 'Delete Clients',                 desc: 'Permanently remove client records' },
  'clients.all':          { label: 'See All Clients',                desc: "View all staff members' clients (not just own)" },
  leads:                  { label: 'View Leads',                     desc: 'See leads and enquiries list' },
  'leads.all':            { label: 'See All Leads',                  desc: "View all staff members' leads" },
  bookings:               { label: 'View Bookings',                  desc: 'See booking list and details' },
  'bookings.create':      { label: 'Create Bookings',                desc: 'Make new flight, hotel, tour, transfer bookings' },
  'bookings.delete':      { label: 'Delete Bookings',                desc: 'Cancel and remove bookings' },
  'bookings.all':         { label: 'See All Bookings',               desc: "View all staff members' bookings" },
  flights:                { label: 'View Flights',                   desc: 'See flight deals and search' },
  'flights.issue':        { label: 'Issue Tickets',                  desc: 'Issue and reissue flight tickets (PNR)' },
  hotels:                 { label: 'View Hotels',                    desc: 'See hotel inventory and promos' },
  'hotels.manage':        { label: 'Manage Hotels',                  desc: 'Add, edit, remove hotel listings' },
  visa:                   { label: 'View Visa Applications',         desc: 'Access visa application list and forms' },
  'visa.approve':         { label: 'Approve Visa Applications',      desc: 'Change visa application status and decisions' },
  'visa.documents':       { label: 'Manage Visa Documents',          desc: 'Upload, verify and manage visa document packs' },
  tours:                  { label: 'View Tours',                     desc: 'See tours and activity listings' },
  'tours.manage':         { label: 'Manage Tours',                   desc: 'Create, edit and price tours and activities' },
  transfers:              { label: 'Transfers',                      desc: 'View and manage airport transfer bookings' },
  payments:               { label: 'View Payments',                  desc: 'See payment records and statuses' },
  'payments.refund':      { label: 'Issue Refunds',                  desc: 'Process full and partial refunds' },
  'payments.all':         { label: 'All Payment Data',               desc: 'View full financial transaction history' },
  reports:                { label: 'View Reports',                   desc: 'Access staff activity and booking reports' },
  'reports.financial':    { label: 'Financial Reports',              desc: 'View revenue, P&L, and financial summaries' },
  'reports.all':          { label: 'All Reports',                    desc: 'Access all report types across the business' },
  payroll:                { label: 'Payroll',                        desc: 'View and manage staff payroll records' },
  commissions:            { label: 'Commissions',                    desc: 'View and manage sales commissions' },
  staff:                  { label: 'View Staff',                     desc: 'See staff list and profiles' },
  'staff.create':         { label: 'Add Staff',                      desc: 'Create new staff accounts' },
  'staff.edit':           { label: 'Edit Staff',                     desc: 'Update staff details and roles' },
  'staff.delete':         { label: 'Delete Staff',                   desc: 'Deactivate or remove staff accounts' },
  suppliers:              { label: 'Suppliers',                      desc: 'View and manage supplier/vendor list' },
  tools:                  { label: 'Tools',                          desc: 'Access internal utility tools' },
  settings:               { label: 'Settings',                       desc: 'Modify system settings and configuration' },
  content:                { label: 'Website Content',                desc: 'Edit homepage, testimonials, stats, slides' },
  audit_logs:             { label: 'Audit Logs',                     desc: 'View admin action audit trail' },
  api_keys:               { label: 'API Keys',                       desc: 'Create and manage API keys' },
  approvals:              { label: 'View Approvals',                 desc: 'See pending approval requests' },
  'approvals.resolve':    { label: 'Resolve Approvals',              desc: 'Approve or reject pending requests' },
  blog:                   { label: 'View Blog',                      desc: 'Access the blog management section' },
  'blog.publish':         { label: 'Publish Blog Posts',             desc: 'Create and publish blog articles' },
  documents:              { label: 'Documents',                      desc: 'View and upload client documents' },
  intelligence:           { label: 'Intelligence Hub',               desc: 'Access the main Intelligence Hub dashboard' },
  'intelligence.financial_dna': { label: 'Financial DNA',           desc: 'AI analysis of client financial statements' },
  'intelligence.officer_sim':   { label: 'Officer Simulation',      desc: 'AI-powered immigration officer interview simulator' },
  'intelligence.embassy_feed':  { label: 'Embassy Feed',            desc: 'Live embassy alerts and advisory updates' },
  'intelligence.doc_centre':    { label: 'Document Intelligence Centre', desc: 'Full 5-tab document analysis suite' },
  'intelligence.doc_upload':    { label: 'Document Upload & Analysis', desc: 'AI forensic document analysis and scoring' },
  'intelligence.form_check':    { label: 'Embassy Form Cross-Checker', desc: 'AI cross-reference completed embassy forms against DB' },
  'intelligence.letters':       { label: 'Letter Generator',        desc: '9 AI-generated embassy letter types' },
  'intelligence.tickets':       { label: 'Flight Itinerary Generator', desc: 'Live Duffel + manual flight itinerary PDFs' },
  'intelligence.cris':          { label: 'Client Risk Score (CRIS)', desc: 'AI-computed client risk and LTV scoring' },
  'intelligence.revenue':       { label: 'Revenue Opportunities',   desc: 'AI-surfaced upsell and cross-sell opportunities' },
  'intelligence.diaspora':      { label: 'Diaspora Intelligence',   desc: 'Diaspora travel pattern benchmarks' },
  'intelligence.staff_perf':    { label: 'Staff Performance KPIs',  desc: 'Individual staff booking and revenue metrics' },
  'intelligence.conversation':  { label: 'Conversation Intelligence', desc: 'AI analysis of client chat transcripts' },
  'intelligence.lifecycle':     { label: 'Client Lifecycle',        desc: 'AI-predicted churn, re-booking, LTV timelines' },
  'jade.staff':           { label: 'Jade Staff Assistant',          desc: 'Access the internal AI assistant (visa, letters, scripts)' },
}

const PERM_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: 'General',              perms: ['dashboard', 'analytics', 'inbox'] },
  { label: 'Clients & Leads',      perms: ['clients', 'clients.create', 'clients.delete', 'clients.all', 'leads', 'leads.all'] },
  { label: 'Bookings & Travel',    perms: ['bookings', 'bookings.create', 'bookings.delete', 'bookings.all', 'flights', 'flights.issue', 'hotels', 'hotels.manage', 'visa', 'visa.approve', 'visa.documents', 'tours', 'tours.manage', 'transfers'] },
  { label: 'Finance',              perms: ['payments', 'payments.refund', 'payments.all', 'reports', 'reports.financial', 'reports.all', 'commissions', 'payroll'] },
  { label: 'Reports & Approvals',  perms: ['approvals', 'approvals.resolve'] },
  { label: 'Website & Content',    perms: ['blog', 'blog.publish', 'content'] },
  { label: 'Staff & System',       perms: ['staff', 'staff.create', 'staff.edit', 'staff.delete', 'suppliers', 'tools', 'settings', 'audit_logs', 'api_keys', 'documents'] },
  { label: 'Intelligence Hub',     perms: ['intelligence', 'intelligence.financial_dna', 'intelligence.officer_sim', 'intelligence.embassy_feed', 'intelligence.doc_centre', 'intelligence.doc_upload', 'intelligence.form_check', 'intelligence.letters', 'intelligence.tickets', 'intelligence.cris', 'intelligence.revenue', 'intelligence.diaspora', 'intelligence.staff_perf', 'intelligence.conversation', 'intelligence.lifecycle'] },
  { label: 'Jade AI',              perms: ['jade.staff'] },
]

const ROLE_META: Record<AdminRole, { label: string; color: string; desc: string }> = {
  super_admin:        { label: 'Super Admin',              color: 'bg-violet-600', desc: 'Full unrestricted access to everything' },
  operations_manager: { label: 'Operations Manager',       color: 'bg-blue-600',   desc: 'All ops, clients, bookings, staff oversight, intelligence' },
  general_manager:    { label: 'General Manager',          color: 'bg-indigo-600', desc: 'Broad access — bookings, clients, visa, tours, intelligence' },
  senior_manager:     { label: 'Senior Manager',           color: 'bg-teal-700',   desc: 'Bookings, visa, clients, reports, core intelligence' },
  visa_officer:       { label: 'Visa Officer',             color: 'bg-purple-600', desc: 'Visa applications, documents, Document Intelligence Centre' },
  coordinator:        { label: 'Coordinator',              color: 'bg-amber-600',  desc: 'Visa + booking coordination, document tools' },
  flight_staff:       { label: 'Flight Ticketing Staff',   color: 'bg-sky-600',    desc: 'Flights, tickets, PNRs, itinerary generator' },
  tours_staff:        { label: 'Tours & Activities Staff', color: 'bg-green-600',  desc: 'Tours, activities, vouchers, Jade AI' },
  hotel_staff:        { label: 'Hotel Reservation Staff',  color: 'bg-cyan-600',   desc: 'Hotel bookings, guest management, Jade AI' },
  sales_agent:        { label: 'Sales Agent',              color: 'bg-orange-600', desc: 'Assigned leads, CRM, own clients, Jade AI' },
  accountant:         { label: 'Accountant',               color: 'bg-rose-600',   desc: 'Payments, refunds, financial reports only' },
  customer_support:   { label: 'Customer Support',         color: 'bg-slate-600',  desc: 'Tickets, client profiles, booking status, Jade AI' },
  sales_rep:          { label: 'Sales Representative',     color: 'bg-yellow-600', desc: 'Leads and reports only, Jade AI' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id:          string
  name:        string
  email:       string
  role:        string
  permissions: Record<string, boolean> | null
  isActive:    boolean
}

// ─── Role Defaults Tab ────────────────────────────────────────────────────────

function RoleDefaultsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const roles = Object.keys(ROLE_META) as AdminRole[]
  const [selectedRole, setSelectedRole] = useState<AdminRole>('coordinator')
  const [dbRoles,      setDbRoles]      = useState<Record<string, Record<string, boolean>>>({})
  const [editPerms,    setEditPerms]    = useState<Record<string, boolean>>({})
  const [editMode,     setEditMode]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({})
  const [loadingDB,    setLoadingDB]    = useState(true)

  useEffect(() => {
    fetch('/api/admin/roles')
      .then(r => r.json())
      .then((records: Array<{ role: string; permissions: Record<string, boolean> }>) => {
        const map: Record<string, Record<string, boolean>> = {}
        if (Array.isArray(records)) {
          records.forEach(r => { map[r.role] = (r.permissions as Record<string, boolean>) || {} })
        }
        setDbRoles(map)
        setLoadingDB(false)
      })
      .catch(() => setLoadingDB(false))
  }, [])

  function selectRole(role: AdminRole) {
    setSelectedRole(role)
    setEditPerms({ ...(dbRoles[role] || {}) })
    setEditMode(false)
    setSaved(false)
  }

  async function saveRole() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/roles/${selectedRole}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: editPerms }),
      })
      if (res.ok) {
        setDbRoles(prev => ({ ...prev, [selectedRole]: { ...editPerms } }))
        setEditMode(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally { setSaving(false) }
  }

  // super_admin always shows all permissions as true regardless of DB
  const rawPerms = editMode ? editPerms : (dbRoles[selectedRole] || {})
  const currentPerms = selectedRole === 'super_admin'
    ? Object.fromEntries(PERMISSION_GROUPS.flatMap(g => g.keys.map(({ key }) => [key, true])))
    : rawPerms
  const hasDbRecord = selectedRole in dbRoles
  const grantedCount = PERMISSION_GROUPS.reduce((acc, g) => acc + g.keys.filter(({ key }) => currentPerms[key]).length, 0)
  const totalCount   = PERMISSION_GROUPS.reduce((acc, g) => acc + g.keys.length, 0)

  function applyPreset(preset: 'grant_all' | 'revoke_all' | 'reset_default') {
    if (preset === 'grant_all') {
      const all: Record<string, boolean> = {}
      PERMISSION_GROUPS.forEach(g => g.keys.forEach(({ key }) => { all[key] = true }))
      setEditPerms(all)
    } else if (preset === 'revoke_all') {
      const none: Record<string, boolean> = {}
      PERMISSION_GROUPS.forEach(g => g.keys.forEach(({ key }) => { none[key] = false }))
      setEditPerms(none)
    } else {
      const defaults = ROLE_DEFAULTS[selectedRole] ?? {}
      const resolved: Record<string, boolean> = {}
      PERMISSION_GROUPS.forEach(g => g.keys.forEach(({ key }) => {
        resolved[key] = (defaults as Record<string, boolean>)[key] ?? false
      }))
      setEditPerms(resolved)
    }
    setSaved(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Role list */}
      <div className="lg:col-span-1 space-y-1.5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Select Role</p>
        {roles.map(role => {
          const meta  = ROLE_META[role]
          const inDb    = role in dbRoles
          const perms   = role === 'super_admin'
            ? Object.fromEntries(PERMISSION_GROUPS.flatMap(g => g.keys.map(({ key }) => [key, true])))
            : (dbRoles[role] || {})
          const count   = PERMISSION_GROUPS.reduce((acc, g) => acc + g.keys.filter(({ key }) => perms[key]).length, 0)
          return (
            <button key={role} onClick={() => selectRole(role)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                selectedRole === role
                  ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                  : 'bg-white border-gray-100 hover:border-gray-200 text-gray-700'
              }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.color}`} />
                <span className="text-xs font-semibold truncate">{meta.label}</span>
                {!loadingDB && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    !inDb && role !== 'super_admin'
                      ? (selectedRole === role ? 'bg-orange-500/30 text-orange-200' : 'bg-orange-100 text-orange-600')
                      : (selectedRole === role ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500')
                  }`}>{!inDb && role !== 'super_admin' ? '—' : count}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Permission panel */}
      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${ROLE_META[selectedRole].color}`} />
              <h2 className="text-base font-bold text-[#0B1F3A]">{ROLE_META[selectedRole].label}</h2>
              {!loadingDB && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                  {grantedCount} / {totalCount} enabled
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{ROLE_META[selectedRole].desc}</p>
          </div>
          {isSuperAdmin && selectedRole !== 'super_admin' && !loadingDB && (
            editMode ? (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => applyPreset('grant_all')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors font-medium">
                  Grant All
                </button>
                <button onClick={() => applyPreset('revoke_all')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors font-medium">
                  Revoke All
                </button>
                <button onClick={() => applyPreset('reset_default')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors font-medium">
                  Reset Default
                </button>
                <button onClick={saveRole} disabled={saving}
                  className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={() => { setEditMode(false); setEditPerms({ ...(dbRoles[selectedRole] || {}) }) }}
                  className="text-xs px-4 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => { setEditPerms({ ...(dbRoles[selectedRole] || {}) }); setEditMode(true) }}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-semibold bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] transition-colors">
                <Unlock className="w-3.5 h-3.5" />
                {saved ? 'Saved! ✓' : 'Edit Permissions'}
              </button>
            )
          )}
          {selectedRole === 'super_admin' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
              <Lock className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs text-violet-600 font-medium">Super Admin always has full access</span>
            </div>
          )}
        </div>

        {editMode && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Click any permission to toggle it. Changes affect all {ROLE_META[selectedRole].label}s immediately after saving.
          </div>
        )}

        {/* No DB record yet — show Initialize button */}
        {!loadingDB && !hasDbRecord && selectedRole !== 'super_admin' && !editMode && (
          <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-orange-500" />
            <span className="flex-1">This role has no permissions record in the database yet. Click Initialize to create it with default permissions.</span>
            {isSuperAdmin && (
              <button
                onClick={() => {
                  const defaults = ROLE_DEFAULTS[selectedRole] ?? {}
                  const resolved: Record<string, boolean> = {}
                  PERMISSION_GROUPS.forEach(g => g.keys.forEach(({ key }) => {
                    resolved[key] = (defaults as Record<string, boolean>)[key] ?? false
                  }))
                  setEditPerms(resolved)
                  setEditMode(true)
                }}
                className="px-3 py-1.5 rounded-lg font-semibold bg-orange-600 hover:bg-orange-700 text-white transition-colors whitespace-nowrap"
              >
                Initialize
              </button>
            )}
          </div>
        )}

        {loadingDB ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-[#C9A84C] animate-spin" />
          </div>
        ) : (
          PERMISSION_GROUPS.map(group => {
            const isOpen  = expanded[group.label] !== false
            const granted = group.keys.filter(({ key }) => currentPerms[key]).length
            return (
              <div key={group.label} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(p => ({ ...p, [group.label]: !isOpen }))}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="text-sm font-bold text-[#0B1F3A]">{group.label}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    <span className={`font-bold ${granted > 0 ? 'text-green-600' : 'text-gray-400'}`}>{granted}</span>
                    <span className="text-gray-400"> / {group.keys.length}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-50 divide-y divide-gray-50">
                    {group.keys.map(({ key, label, desc }) => {
                      const has = currentPerms[key] === true
                      return (
                        <div key={key}
                          onClick={() => editMode && setEditPerms(p => ({ ...p, [key]: !p[key] }))}
                          className={`flex items-center gap-4 px-5 py-3 ${editMode ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${has ? 'bg-green-100' : 'bg-gray-100'}`}>
                            {has ? <Check className="w-3 h-3 text-green-600" /> : <X className="w-3 h-3 text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-[#0B1F3A]">{label}</div>
                            <div className="text-xs text-gray-400 truncate">{desc}</div>
                          </div>
                          <code className="text-[10px] text-gray-300 font-mono hidden sm:block">{key}</code>
                          {editMode && <span className="text-[10px] text-gray-400">{has ? 'click to revoke' : 'click to grant'}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Staff Overrides Tab ──────────────────────────────────────────────────────

function StaffOverridesTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<StaffMember[]>([])
  const [selected,  setSelected]  = useState<StaffMember | null>(null)
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({})
  const [searching, setSearching] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({})

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res  = await fetch(`/api/admin/staff?q=${encodeURIComponent(q)}&limit=8`)
      const data = await res.json()
      setResults(data.staff ?? data ?? [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const selectStaff = (s: StaffMember) => {
    setSelected(s)
    setQuery('')
    setResults([])
    const existing: Record<string, boolean | null> = {}
    if (s.permissions) {
      for (const [k, v] of Object.entries(s.permissions)) {
        existing[k] = v
      }
    }
    setOverrides(existing)
    setSaved(false)
  }

  const getRolePerms = (): Permission[] => {
    if (!selected) return []
    return ROLE_PERMISSIONS[selected.role as AdminRole] ?? []
  }

  const getPermState = (perm: Permission): 'role-yes' | 'role-no' | 'granted' | 'denied' => {
    const override = overrides[perm]
    const roleHas  = getRolePerms().includes(perm)
    if (override === true)  return 'granted'
    if (override === false) return 'denied'
    return roleHas ? 'role-yes' : 'role-no'
  }

  const togglePerm = (perm: Permission) => {
    if (!isSuperAdmin) return
    const state   = getPermState(perm)
    const roleHas = getRolePerms().includes(perm)
    setOverrides(prev => {
      const next = { ...prev }
      if      (state === 'role-yes') next[perm] = false
      else if (state === 'role-no')  next[perm] = true
      else                           delete next[perm]
      // if result matches role default exactly, remove the override
      if (next[perm] === true  &&  roleHas) delete next[perm]
      if (next[perm] === false && !roleHas) delete next[perm]
      return next
    })
    setSaved(false)
  }

  const clearOverrides = () => { setOverrides({}); setSaved(false) }

  const save = async () => {
    if (!selected || !isSuperAdmin) return
    setSaving(true)
    try {
      await fetch(`/api/admin/staff/${selected.id}/permissions`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permissions: overrides }),
      })
      setSaved(true)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const overrideCount = Object.keys(overrides).length

  return (
    <div className="space-y-5">
      {/* Staff search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#C9A84C]" /> Find Staff Member
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
            placeholder="Search by name or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>
        {results.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {results.map(s => (
              <button key={s.id} onClick={() => selectStaff(s)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left transition-colors">
                <div className="w-8 h-8 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#C9A84C] text-xs font-bold">{s.name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#0B1F3A] truncate">{s.name}</div>
                  <div className="text-xs text-gray-400 truncate">{s.email}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${ROLE_META[s.role as AdminRole]?.color ?? 'bg-gray-500'}`}>
                  {ROLE_META[s.role as AdminRole]?.label ?? s.role}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <>
          {/* Staff header */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
              <span className="text-[#C9A84C] font-bold">{selected.name[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#0B1F3A]">{selected.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${ROLE_META[selected.role as AdminRole]?.color ?? 'bg-gray-500'}`}>
                  {ROLE_META[selected.role as AdminRole]?.label ?? selected.role}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{selected.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {overrideCount > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                  {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                </span>
              )}
              {isSuperAdmin && (
                <>
                  <button onClick={clearOverrides}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-500 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" /> Clear Overrides
                  </button>
                  <button onClick={() => void save()} disabled={saving}
                    className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50 ${
                      saved ? 'bg-green-600 text-white' : 'bg-[#0B1F3A] text-white hover:bg-[#0d2345]'
                    }`}>
                    {saving  ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Permissions'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" /> Role default (allowed)</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-400 inline-block" /> GRANTED above role</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> DENIED below role</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" /> Not allowed by role</div>
            {!isSuperAdmin && (
              <div className="flex items-center gap-1.5 text-gray-400 ml-auto">
                <Lock className="w-3 h-3" /> Read-only — super admin only
              </div>
            )}
          </div>

          {!isSuperAdmin && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Permission overrides can only be edited by Super Admins. Contact your Super Admin to adjust individual staff permissions.
            </div>
          )}

          {/* Permission groups */}
          {PERM_GROUPS.map(group => {
            const isOpen = expanded[group.label] !== false
            const states = group.perms.map(p => getPermState(p))
            const grantedCount   = states.filter(s => s === 'role-yes' || s === 'granted').length
            const overrideExists = states.some(s => s === 'granted' || s === 'denied')
            return (
              <div key={group.label} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded(p => ({ ...p, [group.label]: !isOpen }))}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="text-sm font-bold text-[#0B1F3A]">{group.label}</span>
                    {overrideExists && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">overrides</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    <span className={`font-bold ${grantedCount > 0 ? 'text-green-600' : 'text-gray-400'}`}>{grantedCount}</span>
                    <span className="text-gray-400"> / {group.perms.length}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-50 divide-y divide-gray-50">
                    {group.perms.map(perm => {
                      const state = getPermState(perm)
                      const meta  = PERM_META[perm]
                      const bg = {
                        'role-yes': 'bg-green-50 hover:bg-green-100',
                        'role-no':  'bg-white hover:bg-gray-50',
                        'granted':  'bg-blue-50 hover:bg-blue-100',
                        'denied':   'bg-red-50 hover:bg-red-100',
                      }[state]
                      const icon = {
                        'role-yes': <Check className="w-3.5 h-3.5 text-green-600" />,
                        'role-no':  <X className="w-3.5 h-3.5 text-gray-300" />,
                        'granted':  <Unlock className="w-3.5 h-3.5 text-blue-600" />,
                        'denied':   <Lock className="w-3.5 h-3.5 text-red-500" />,
                      }[state]
                      const badge = {
                        'role-yes': null,
                        'role-no':  null,
                        'granted':  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold border border-blue-200">GRANTED ↑</span>,
                        'denied':   <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold border border-red-200">DENIED ↓</span>,
                      }[state]
                      return (
                        <div key={perm}
                          onClick={() => isSuperAdmin && togglePerm(perm)}
                          className={`flex items-center gap-4 px-5 py-3 transition-colors ${bg} ${isSuperAdmin ? 'cursor-pointer' : 'cursor-default'}`}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-white border border-gray-200">
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#0B1F3A]">{meta.label}</span>
                              {badge}
                            </div>
                            <div className="text-xs text-gray-400 truncate">{meta.desc}</div>
                          </div>
                          <code className="text-[10px] text-gray-300 font-mono hidden sm:block">{perm}</code>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Shield className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Search for a staff member above to view and edit their permissions</p>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoleManagerPage() {
  const { profile }    = useStaffPermissions()
  const [activeTab, setActiveTab] = useState<'defaults' | 'overrides'>('defaults')
  const isSuperAdmin = profile?.role === 'super_admin'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Role Manager</h1>
          <p className="text-sm text-gray-500 mt-1">
            View default role permissions and manage individual staff permission overrides.
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
            <Shield className="w-3.5 h-3.5 text-violet-600" />
            <span className="text-xs font-semibold text-violet-700">Super Admin — full edit access</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'defaults',  label: 'Role Defaults',   sub: 'View what each role can access' },
          { id: 'overrides', label: 'Staff Overrides',  sub: isSuperAdmin ? 'Grant / deny individual permissions' : 'View staff permissions (read-only)' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#C9A84C] text-[#0B1F3A]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {tab.label}
            <span className="text-[10px] text-gray-400 hidden sm:block">{tab.sub}</span>
          </button>
        ))}
      </div>

      {activeTab === 'defaults'  && <RoleDefaultsTab isSuperAdmin={isSuperAdmin} />}
      {activeTab === 'overrides' && <StaffOverridesTab isSuperAdmin={isSuperAdmin} />}
    </div>
  )
}
