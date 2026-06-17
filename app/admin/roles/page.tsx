'use client'

import { useState } from 'react'
import { ChevronRight, Check, X, Info } from 'lucide-react'
import { ROLE_PERMISSIONS, type AdminRole, type Permission } from '@/lib/admin/permissions'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

const ROLE_META: Record<string, { label: string; color: string; desc: string }> = {
  super_admin:        { label: 'Super Admin',              color: 'bg-violet-600', desc: 'Full unrestricted access'                        },
  operations_manager: { label: 'Operations Manager',       color: 'bg-blue-600',   desc: 'All ops, clients, bookings, staff oversight'      },
  general_manager:    { label: 'General Manager',          color: 'bg-indigo-600', desc: 'Broad access — bookings, clients, visa & tours'   },
  senior_manager:     { label: 'Senior Manager',           color: 'bg-teal-600',   desc: 'Bookings, visa, clients, reports'                 },
  visa_officer:       { label: 'Visa Officer',             color: 'bg-purple-600', desc: 'Visa applications, documents, compliance'          },
  flight_staff:       { label: 'Flight Ticketing Staff',   color: 'bg-sky-600',    desc: 'Flights, tickets, PNRs, refunds'                  },
  tours_staff:        { label: 'Tours & Activities Staff', color: 'bg-green-600',  desc: 'Tours, activities, vouchers'                      },
  hotel_staff:        { label: 'Hotel Reservation Staff',  color: 'bg-cyan-600',   desc: 'Hotel bookings, guest management'                 },
  sales_agent:        { label: 'Sales Agent',              color: 'bg-orange-600', desc: 'Assigned leads, CRM, own clients only'            },
  coordinator:        { label: 'Coordinator',              color: 'bg-amber-600',  desc: 'Visa + booking coordination'                      },
  sales_rep:          { label: 'Sales Representative',     color: 'bg-yellow-600', desc: 'Leads and reports only'                           },
  accountant:         { label: 'Accountant',               color: 'bg-rose-600',   desc: 'Payments, refunds, financial reports'             },
  customer_support:   { label: 'Customer Support',         color: 'bg-slate-600',  desc: 'Tickets, client profiles, booking status'         },
}

const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: 'General',  permissions: ['dashboard', 'analytics', 'inbox'] },
  { label: 'Clients',  permissions: ['clients', 'clients.create', 'clients.delete', 'clients.all', 'leads', 'leads.all'] },
  { label: 'Bookings', permissions: ['bookings', 'bookings.create', 'bookings.delete', 'bookings.all', 'flights', 'flights.issue', 'hotels', 'hotels.manage', 'transfers'] },
  { label: 'Services', permissions: ['visa', 'visa.approve', 'visa.documents', 'tours', 'tours.manage', 'documents'] },
  { label: 'Finance',  permissions: ['payments', 'payments.refund', 'payments.all', 'commissions', 'payroll'] },
  { label: 'Reports',  permissions: ['reports', 'reports.financial', 'reports.all', 'approvals', 'approvals.resolve'] },
  { label: 'Content',  permissions: ['blog', 'blog.publish', 'content'] },
  { label: 'Admin',    permissions: ['staff', 'staff.create', 'staff.edit', 'staff.delete', 'suppliers', 'tools', 'audit_logs', 'api_keys', 'settings'] },
]

export default function RoleManagerPage() {
  const { can } = useStaffPermissions()
  const [selectedRole, setSelectedRole] = useState<string>('visa_officer')
  const roles = Object.keys(ROLE_META)
  const rolePerms = ROLE_PERMISSIONS[selectedRole as AdminRole] ?? []

  if (!can('staff_view')) {
    return (
      <div className="p-8 text-center text-gray-400">
        You don&apos;t have permission to view role configurations.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Role Manager</h1>
        <p className="text-gray-400 text-sm mt-1">
          View what each role can access. To assign a role to a staff member, go to Staff Management.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Role list */}
        <div className="lg:col-span-1 space-y-1">
          {roles.map(role => {
            const meta = ROLE_META[role]
            const perms = ROLE_PERMISSIONS[role as AdminRole] ?? []
            const isSelected = selectedRole === role
            return (
              <button key={role} onClick={() => setSelectedRole(role)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[#0B1F3A] text-white'
                    : 'bg-white hover:bg-gray-50 border border-gray-100'
                }`}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.color}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-[#0B1F3A]'}`}>
                    {meta.label}
                  </p>
                  <p className={`text-[10px] truncate ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                    {perms.length} permissions
                  </p>
                </div>
                <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white/60' : 'text-gray-300'}`} />
              </button>
            )
          })}
        </div>

        {/* Permission detail */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${ROLE_META[selectedRole]?.color}`} />
              <div>
                <h2 className="font-bold text-[#0B1F3A]">{ROLE_META[selectedRole]?.label}</h2>
                <p className="text-gray-400 text-xs">{ROLE_META[selectedRole]?.desc}</p>
              </div>
              <div className="ml-auto bg-[#0B1F3A] text-white text-xs font-bold px-3 py-1 rounded-full">
                {rolePerms.length} permissions
              </div>
            </div>

            {/* Permission groups */}
            <div className="p-5 space-y-5">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {group.permissions.map(perm => {
                      const has = rolePerms.includes(perm)
                      return (
                        <div key={perm}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                            has
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-gray-50 text-gray-300 border border-gray-100'
                          }`}>
                          {has
                            ? <Check className="w-3 h-3 flex-shrink-0 text-green-500" />
                            : <X className="w-3 h-3 flex-shrink-0 text-gray-300" />
                          }
                          <span className="truncate">{perm}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Info footer */}
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                These are default role permissions. Individual staff members can have additional
                permissions granted or denied by a Super Admin via the Staff Management page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
