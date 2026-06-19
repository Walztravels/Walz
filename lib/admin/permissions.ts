export type AdminRole =
  | 'super_admin'
  | 'operations_manager'
  | 'visa_officer'
  | 'flight_staff'
  | 'tours_staff'
  | 'hotel_staff'
  | 'sales_agent'
  | 'accountant'
  | 'customer_support'
  // ── Backward-compatible aliases for existing staff ───────────────────────
  | 'general_manager'
  | 'senior_manager'
  | 'coordinator'
  | 'sales_rep'

export type Permission =
  | 'dashboard'
  | 'analytics'
  | 'inbox'
  | 'clients'
  | 'clients.create'
  | 'clients.delete'
  | 'clients.all'
  | 'leads'
  | 'leads.all'
  | 'bookings'
  | 'bookings.create'
  | 'bookings.delete'
  | 'bookings.all'
  | 'flights'
  | 'flights.issue'
  | 'hotels'
  | 'hotels.manage'
  | 'visa'
  | 'visa.approve'
  | 'visa.documents'
  | 'tours'
  | 'tours.manage'
  | 'transfers'
  | 'payments'
  | 'payments.refund'
  | 'payments.all'
  | 'reports'
  | 'reports.financial'
  | 'reports.all'
  | 'staff'
  | 'staff.create'
  | 'staff.edit'
  | 'staff.delete'
  | 'payroll'
  | 'commissions'
  | 'suppliers'
  | 'tools'
  | 'settings'
  | 'content'
  | 'audit_logs'
  | 'api_keys'
  | 'approvals'
  | 'approvals.resolve'
  | 'blog'
  | 'blog.publish'
  | 'documents'

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    'dashboard', 'analytics', 'inbox', 'clients', 'clients.create', 'clients.delete', 'clients.all',
    'leads', 'leads.all', 'bookings', 'bookings.create', 'bookings.delete', 'bookings.all',
    'flights', 'flights.issue', 'hotels', 'hotels.manage', 'visa', 'visa.approve', 'visa.documents',
    'tours', 'tours.manage', 'transfers', 'payments', 'payments.refund', 'payments.all',
    'reports', 'reports.financial', 'reports.all', 'staff', 'staff.create', 'staff.edit', 'staff.delete',
    'payroll', 'commissions', 'suppliers', 'tools', 'settings', 'content', 'audit_logs', 'api_keys',
    'approvals', 'approvals.resolve', 'blog', 'blog.publish', 'documents',
  ],
  operations_manager: [
    'dashboard', 'analytics', 'inbox', 'clients', 'clients.create', 'clients.all',
    'leads', 'leads.all', 'bookings', 'bookings.create', 'bookings.all',
    'flights', 'hotels', 'visa', 'visa.approve', 'tours', 'transfers',
    'payments', 'reports', 'reports.financial', 'reports.all',
    'staff', 'suppliers', 'commissions', 'approvals', 'approvals.resolve',
    'blog', 'documents',
  ],
  visa_officer: [
    'dashboard', 'inbox', 'clients', 'visa', 'visa.approve', 'visa.documents',
    'documents', 'reports', 'approvals',
  ],
  flight_staff: [
    'dashboard', 'inbox', 'bookings', 'bookings.create', 'flights', 'flights.issue',
    'clients', 'transfers', 'approvals',
  ],
  tours_staff: [
    'dashboard', 'inbox', 'tours', 'tours.manage', 'bookings', 'bookings.create',
    'clients', 'documents', 'transfers',
  ],
  hotel_staff: [
    'dashboard', 'inbox', 'hotels', 'hotels.manage', 'bookings', 'bookings.create',
    'clients',
  ],
  sales_agent: [
    'dashboard', 'inbox', 'leads', 'clients', 'clients.create',
    'bookings.create', 'commissions', 'approvals',
  ],
  accountant: [
    'dashboard', 'payments', 'payments.refund', 'payments.all',
    'reports', 'reports.financial', 'reports.all', 'commissions', 'payroll',
    'approvals', 'approvals.resolve',
  ],
  customer_support: [
    'dashboard', 'inbox', 'clients', 'bookings', 'visa', 'leads', 'approvals',
  ],
  // ── Backward-compatible aliases for existing staff ───────────────────────
  general_manager: [
    'dashboard', 'analytics', 'inbox', 'clients', 'clients.create', 'clients.all',
    'leads', 'leads.all', 'bookings', 'bookings.create', 'bookings.all',
    'flights', 'hotels', 'visa', 'visa.approve', 'visa.documents',
    'tours', 'tours.manage', 'transfers', 'payments', 'reports', 'reports.financial',
    'reports.all', 'staff', 'suppliers', 'commissions', 'approvals', 'approvals.resolve',
    'blog', 'blog.publish', 'documents', 'content', 'tools', 'settings', 'audit_logs',
    'api_keys', 'payroll',
  ],
  senior_manager: [
    'dashboard', 'analytics', 'inbox', 'clients', 'clients.create', 'clients.all',
    'leads', 'leads.all', 'bookings', 'bookings.create', 'bookings.all',
    'flights', 'hotels', 'visa', 'visa.approve', 'visa.documents',
    'tours', 'transfers', 'reports', 'approvals', 'blog', 'documents',
  ],
  coordinator: [
    'dashboard', 'inbox', 'clients', 'clients.create', 'leads',
    'bookings', 'bookings.create', 'visa', 'visa.documents', 'visa.approve',
    'documents', 'reports', 'approvals', 'transfers',
  ],
  sales_rep: [
    'dashboard', 'inbox', 'leads', 'clients', 'clients.create',
    'bookings.create', 'approvals', 'reports',
  ],
}

export function hasPermission(
  staff: { role: string; permissions: unknown },
  permission: Permission,
): boolean {
  const role = staff.role as AdminRole

  // Unknown roles fall back to the most restrictive known role
  const knownRoles = Object.keys(ROLE_PERMISSIONS) as AdminRole[]
  const safeRole   = knownRoles.includes(role) ? role : 'sales_rep'
  const rolePerms  = ROLE_PERMISSIONS[safeRole] ?? []

  const overrides = (
    typeof staff.permissions === 'object' && staff.permissions !== null
      ? staff.permissions
      : {}
  ) as Record<string, boolean>

  if (overrides[permission] === true)  return true
  if (overrides[permission] === false) return false
  return rolePerms.includes(permission)
}

export function canSeeAllRecords(
  staff: { role: string; permissions: unknown },
  module: 'clients' | 'leads' | 'bookings',
): boolean {
  const permMap: Record<string, Permission> = {
    clients:  'clients.all',
    leads:    'leads.all',
    bookings: 'bookings.all',
  }
  return hasPermission(staff, permMap[module])
}

// ── Role display config ────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin:        'Super Admin',
  operations_manager: 'Operations Manager',
  visa_officer:       'Visa Officer',
  flight_staff:       'Flight Staff',
  tours_staff:        'Tours Staff',
  hotel_staff:        'Hotel Staff',
  sales_agent:        'Sales Agent',
  accountant:         'Accountant',
  customer_support:   'Customer Support',
  // ── Backward-compatible aliases ──────────────────────────────────────────
  general_manager:    'General Manager',
  senior_manager:     'Senior Manager',
  coordinator:        'Coordinator',
  sales_rep:          'Sales Rep',
}

export const ROLE_BADGE_CLASSES: Record<AdminRole, string> = {
  super_admin:        'bg-yellow-500 text-yellow-950',
  operations_manager: 'bg-blue-600 text-white',
  visa_officer:       'bg-purple-600 text-white',
  flight_staff:       'bg-sky-500 text-white',
  tours_staff:        'bg-green-600 text-white',
  hotel_staff:        'bg-teal-600 text-white',
  sales_agent:        'bg-orange-500 text-white',
  accountant:         'bg-rose-600 text-white',
  customer_support:   'bg-gray-500 text-white',
  // ── Backward-compatible aliases ──────────────────────────────────────────
  general_manager:    'bg-blue-600 text-white',
  senior_manager:     'bg-teal-600 text-white',
  coordinator:        'bg-indigo-600 text-white',
  sales_rep:          'bg-orange-500 text-white',
}

// ── Nav definition ─────────────────────────────────────────────────────────────

export interface NavItem {
  href:       string
  label:      string
  icon:       string
  permission: Permission
}

export interface NavSection {
  section: string
  items:   NavItem[]
}

export const NAV_ITEMS: NavSection[] = [
  {
    section: 'OVERVIEW',
    items: [
      { href: '/admin/dashboard',   label: 'Dashboard',      icon: 'LayoutDashboard', permission: 'dashboard'       },
      { href: '/admin/analytics',   label: 'Analytics',      icon: 'TrendingUp',      permission: 'analytics'       },
      { href: '/admin/inbox',       label: 'Inbox',          icon: 'MessageSquare',   permission: 'inbox'           },
    ],
  },
  {
    section: 'CLIENTS & LEADS',
    items: [
      { href: '/admin/clients',     label: 'Clients',        icon: 'Users',           permission: 'clients'         },
      { href: '/admin/leads',       label: 'Leads',          icon: 'UserPlus',        permission: 'leads'           },
    ],
  },
  {
    section: 'BOOKINGS',
    items: [
      { href: '/admin/bookings',    label: 'All Bookings',   icon: 'Calendar',        permission: 'bookings'        },
      { href: '/admin/book',        label: 'New Booking',    icon: 'Plus',            permission: 'bookings.create' },
      { href: '/admin/flights',     label: 'Flight Deals',   icon: 'Plane',           permission: 'flights'         },
      { href: '/admin/hotels',      label: 'Hotel Promos',   icon: 'Building2',       permission: 'hotels'          },
      { href: '/admin/transfers',   label: 'Transfers',      icon: 'Car',             permission: 'transfers'       },
    ],
  },
  {
    section: 'SERVICES',
    items: [
      { href: '/admin/visa-applications',  label: 'Visa Applications',   icon: 'FileText',      permission: 'visa'      },
      { href: '/admin/visa-pricing',       label: 'Visa Pricing',         icon: 'Tag',           permission: 'visa'      },
      { href: '/admin/visa/bank-analyser', label: 'Bank Analyser',        icon: 'ScanSearch',    permission: 'visa'      },
      { href: '/admin/tours',              label: 'Tours',               icon: 'Map',           permission: 'tours'     },
      { href: '/admin/documents',          label: 'Documents',           icon: 'FolderOpen',    permission: 'documents' },
      { href: '/admin/activities',         label: 'Activities',          icon: 'MapPin',        permission: 'tours'     },
      { href: '/admin/packages',           label: 'Packages',            icon: 'Package',       permission: 'tours'     },
      { href: '/admin/esim',               label: 'Jade Connect / eSIM', icon: 'Signal',        permission: 'bookings'  },
      { href: '/admin/portal',             label: 'Client Portal',       icon: 'Globe',         permission: 'clients'   },
    ],
  },
  {
    section: 'FINANCE',
    items: [
      { href: '/admin/payments',    label: 'Payments',       icon: 'CreditCard',      permission: 'payments'        },
      { href: '/admin/vouchers',    label: 'Vouchers',       icon: 'Gift',            permission: 'payments'        },
      { href: '/admin/commissions', label: 'Commissions',    icon: 'Award',           permission: 'commissions'     },
      { href: '/admin/payroll',     label: 'Payroll',        icon: 'DollarSign',      permission: 'payroll'         },
    ],
  },
  {
    section: 'REPORTS',
    items: [
      { href: '/admin/reports',     label: 'Staff Reports',  icon: 'ClipboardList',   permission: 'reports'         },
      { href: '/admin/approvals',   label: 'Approvals',      icon: 'CheckCircle',     permission: 'approvals'       },
    ],
  },
  {
    section: 'WEBSITE',
    items: [
      { href: '/admin/hero-slides',     label: 'Hero Slides',      icon: 'Image',         permission: 'content'   },
      { href: '/admin/blog',            label: 'Blog',             icon: 'BookOpen',      permission: 'blog'      },
      { href: '/admin/blog/new',        label: 'New Post',         icon: 'Plus',          permission: 'blog.publish' },
      { href: '/admin/content',         label: 'Website Content',  icon: 'Edit',          permission: 'content'   },
      { href: '/admin/testimonials',    label: 'Testimonials',     icon: 'Star',          permission: 'content'   },
      { href: '/admin/stats',           label: 'Homepage Stats',   icon: 'TrendingUp',    permission: 'content'   },
      { href: '/admin/featured-deals',  label: 'Featured Deals',   icon: 'Tag',           permission: 'bookings'  },
      { href: '/admin/travel-advisory', label: 'Travel Advisories',icon: 'AlertTriangle', permission: 'visa'      },
      { href: '/admin/newsletter',      label: 'Newsletter',       icon: 'Mail',          permission: 'clients'   },
      { href: '/admin/referrals',       label: 'Referral Codes',   icon: 'Users',         permission: 'clients'   },
      { href: '/admin/site-settings',   label: 'Site Settings',    icon: 'Sliders',       permission: 'settings'  },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { href: '/admin/intelligence',                    label: 'Intelligence Hub',     icon: 'Brain',         permission: 'analytics'   },
      { href: '/admin/intelligence/dna',               label: 'Financial DNA',         icon: 'Dna',           permission: 'visa'        },
      { href: '/admin/intelligence/officer-sim',       label: 'Officer Simulation',    icon: 'UserCheck',     permission: 'visa'        },
      { href: '/admin/intelligence/embassy-feed',      label: 'Embassy Feed',          icon: 'Radio',         permission: 'visa'        },
      { href: '/admin/intelligence/doc-auth',          label: 'Document Authenticity', icon: 'ShieldCheck',   permission: 'visa'        },
      { href: '/admin/intelligence/cris',              label: 'Client Risk Score',     icon: 'AlertOctagon',  permission: 'clients'     },
      { href: '/admin/intelligence/revenue',           label: 'Revenue Opportunities', icon: 'Zap',           permission: 'analytics'   },
      { href: '/admin/intelligence/diaspora',          label: 'Diaspora Intelligence', icon: 'Globe',         permission: 'analytics'   },
      { href: '/admin/intelligence/staff-performance', label: 'Staff Performance',     icon: 'BarChart2',     permission: 'staff'       },
      { href: '/admin/intelligence/conversation',      label: 'Conversation Intel',    icon: 'MessageSquare', permission: 'inbox'       },
      { href: '/admin/intelligence/lifecycle',         label: 'Client Lifecycle',      icon: 'TrendingUp',    permission: 'analytics'   },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { href: '/admin/staff',       label: 'Staff',        icon: 'Shield',      permission: 'staff'       },
      { href: '/admin/staff/new',   label: 'Add Staff',    icon: 'UserPlus',    permission: 'staff.create' },
      { href: '/admin/roles',       label: 'Role Manager', icon: 'ShieldCheck', permission: 'staff'       },
      { href: '/admin/suppliers',   label: 'Suppliers',    icon: 'Package',     permission: 'suppliers'   },
      { href: '/admin/audit-logs',  label: 'Audit Logs',   icon: 'Activity',    permission: 'audit_logs'  },
      { href: '/admin/api-keys',    label: 'API Keys',     icon: 'Key',         permission: 'api_keys'    },
      { href: '/admin/settings',    label: 'Settings',     icon: 'Settings',    permission: 'settings'    },
    ],
  },
]

export function getNavForStaff(staff: { role: string; permissions: unknown }): NavSection[] {
  // Super admin sees everything — no filtering
  if (staff.role === 'super_admin') return NAV_ITEMS

  return NAV_ITEMS
    .map(section => ({
      ...section,
      items: section.items.filter(item => hasPermission(staff, item.permission)),
    }))
    .filter(section => section.items.length > 0)
}
