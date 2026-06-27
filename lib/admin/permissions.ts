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
  // ── General ──────────────────────────────────────────────────────────────
  | 'dashboard'
  | 'analytics'
  | 'inbox'
  // ── Clients & Leads ──────────────────────────────────────────────────────
  | 'clients'
  | 'clients.create'
  | 'clients.delete'
  | 'clients.all'
  | 'leads'
  | 'leads.all'
  // ── Bookings & Travel ────────────────────────────────────────────────────
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
  // ── Finance ──────────────────────────────────────────────────────────────
  | 'payments'
  | 'payments.refund'
  | 'payments.all'
  | 'reports'
  | 'reports.financial'
  | 'reports.all'
  | 'payroll'
  | 'commissions'
  // ── Staff & System ────────────────────────────────────────────────────────
  | 'staff'
  | 'staff.create'
  | 'staff.edit'
  | 'staff.delete'
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
  // ── Intelligence Hub ─────────────────────────────────────────────────────
  | 'intelligence'
  | 'intelligence.financial_dna'
  | 'intelligence.officer_sim'
  | 'intelligence.embassy_feed'
  | 'intelligence.doc_centre'
  | 'intelligence.doc_upload'
  | 'intelligence.form_check'
  | 'intelligence.letters'
  | 'intelligence.tickets'
  | 'intelligence.cris'
  | 'intelligence.revenue'
  | 'intelligence.diaspora'
  | 'intelligence.staff_perf'
  | 'intelligence.conversation'
  | 'intelligence.lifecycle'
  // ── Jade AI ──────────────────────────────────────────────────────────────
  | 'jade.staff'

// ── All permissions (super_admin gets all automatically) ─────────────────────

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard', 'analytics', 'inbox',
  'clients', 'clients.create', 'clients.delete', 'clients.all',
  'leads', 'leads.all',
  'bookings', 'bookings.create', 'bookings.delete', 'bookings.all',
  'flights', 'flights.issue', 'hotels', 'hotels.manage',
  'visa', 'visa.approve', 'visa.documents',
  'tours', 'tours.manage', 'transfers',
  'payments', 'payments.refund', 'payments.all',
  'reports', 'reports.financial', 'reports.all',
  'payroll', 'commissions',
  'staff', 'staff.create', 'staff.edit', 'staff.delete',
  'suppliers', 'tools', 'settings', 'content',
  'audit_logs', 'api_keys',
  'approvals', 'approvals.resolve',
  'blog', 'blog.publish', 'documents',
  'intelligence',
  'intelligence.financial_dna', 'intelligence.officer_sim',
  'intelligence.embassy_feed', 'intelligence.doc_centre',
  'intelligence.doc_upload', 'intelligence.form_check',
  'intelligence.letters', 'intelligence.tickets',
  'intelligence.cris', 'intelligence.revenue',
  'intelligence.diaspora', 'intelligence.staff_perf',
  'intelligence.conversation', 'intelligence.lifecycle',
  'jade.staff',
]

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS,

  operations_manager: [
    'dashboard', 'analytics', 'inbox',
    'clients', 'clients.create', 'clients.all',
    'leads', 'leads.all',
    'bookings', 'bookings.create', 'bookings.all',
    'flights', 'hotels', 'visa', 'visa.approve', 'tours', 'transfers',
    'payments', 'reports', 'reports.financial', 'reports.all',
    'staff', 'suppliers', 'commissions', 'approvals', 'approvals.resolve',
    'blog', 'documents',
    'intelligence',
    'intelligence.financial_dna', 'intelligence.officer_sim',
    'intelligence.embassy_feed', 'intelligence.doc_centre',
    'intelligence.doc_upload', 'intelligence.form_check',
    'intelligence.letters', 'intelligence.tickets',
    'intelligence.cris', 'intelligence.revenue',
    'intelligence.diaspora', 'intelligence.staff_perf',
    'intelligence.conversation', 'intelligence.lifecycle',
    'jade.staff',
  ],

  visa_officer: [
    'dashboard', 'inbox',
    'clients', 'visa', 'visa.approve', 'visa.documents',
    'documents', 'reports', 'approvals',
    'intelligence',
    'intelligence.financial_dna', 'intelligence.officer_sim',
    'intelligence.embassy_feed', 'intelligence.doc_centre',
    'intelligence.doc_upload', 'intelligence.form_check',
    'intelligence.letters', 'intelligence.tickets',
    'jade.staff',
  ],

  coordinator: [
    'dashboard', 'inbox',
    'clients', 'clients.create', 'leads',
    'bookings', 'bookings.create',
    'visa', 'visa.documents', 'visa.approve',
    'documents', 'reports', 'approvals', 'transfers',
    'intelligence',
    'intelligence.doc_centre', 'intelligence.doc_upload',
    'intelligence.form_check', 'intelligence.letters', 'intelligence.tickets',
    'jade.staff',
  ],

  flight_staff: [
    'dashboard', 'inbox',
    'bookings', 'bookings.create', 'flights', 'flights.issue',
    'clients', 'transfers', 'approvals',
    'intelligence.tickets',
    'jade.staff',
  ],

  tours_staff: [
    'dashboard', 'inbox',
    'tours', 'tours.manage', 'bookings', 'bookings.create',
    'clients', 'documents', 'transfers',
    'jade.staff',
  ],

  hotel_staff: [
    'dashboard', 'inbox',
    'hotels', 'hotels.manage', 'bookings', 'bookings.create',
    'clients',
    'jade.staff',
  ],

  sales_agent: [
    'dashboard', 'inbox',
    'leads', 'clients', 'clients.create',
    'bookings.create', 'commissions', 'approvals',
    'jade.staff',
  ],

  accountant: [
    'dashboard',
    'payments', 'payments.refund', 'payments.all',
    'reports', 'reports.financial', 'reports.all',
    'commissions', 'payroll',
    'approvals', 'approvals.resolve',
  ],

  customer_support: [
    'dashboard', 'inbox',
    'clients', 'bookings', 'visa', 'leads', 'approvals',
    'jade.staff',
  ],

  // ── Backward-compatible aliases ──────────────────────────────────────────
  general_manager: [
    'dashboard', 'analytics', 'inbox',
    'clients', 'clients.create', 'clients.all',
    'leads', 'leads.all',
    'bookings', 'bookings.create', 'bookings.all',
    'flights', 'hotels', 'visa', 'visa.approve', 'visa.documents',
    'tours', 'tours.manage', 'transfers',
    'payments', 'reports', 'reports.financial', 'reports.all',
    'staff', 'staff.create', 'staff.edit', 'suppliers', 'commissions', 'approvals', 'approvals.resolve',
    'blog', 'blog.publish', 'documents', 'content', 'tools', 'settings',
    'audit_logs', 'api_keys', 'payroll',
    'intelligence',
    'intelligence.financial_dna', 'intelligence.officer_sim',
    'intelligence.embassy_feed', 'intelligence.doc_centre',
    'intelligence.doc_upload', 'intelligence.form_check',
    'intelligence.letters', 'intelligence.tickets',
    'intelligence.cris', 'intelligence.revenue',
    'intelligence.diaspora', 'intelligence.staff_perf',
    'intelligence.conversation', 'intelligence.lifecycle',
    'jade.staff',
  ],

  senior_manager: [
    'dashboard', 'analytics', 'inbox',
    'clients', 'clients.create', 'clients.all',
    'leads', 'leads.all',
    'bookings', 'bookings.create', 'bookings.all',
    'flights', 'hotels', 'visa', 'visa.approve', 'visa.documents',
    'tours', 'transfers', 'payments', 'reports', 'approvals', 'blog', 'documents',
    'intelligence',
    'intelligence.doc_centre', 'intelligence.letters', 'intelligence.tickets',
    'intelligence.cris', 'intelligence.revenue',
    'jade.staff',
  ],

  sales_rep: [
    'dashboard', 'inbox',
    'leads', 'clients', 'clients.create',
    'bookings.create', 'approvals', 'reports',
    'jade.staff',
  ],
}

// ─── hasPermission ─────────────────────────────────────────────────────────────

/**
 * Maps coarse sidebar Permission strings → fine-grained RBAC keys.
 * Allows a Role Manager grant (e.g. payments_view: true) to also unlock the
 * corresponding sidebar section ('payments'), bridging the two permission systems.
 */
const PERMISSION_TO_RBAC: Partial<Record<Permission, string[]>> = {
  payments:         ['payments_view'],
  'payments.all':   ['payments_view_all'],
  'payments.refund':['payments_refund'],
  reports:          ['reports_view'],
  'reports.all':    ['reports_all'],
  payroll:          ['payroll'],
  commissions:      ['commissions'],
  staff:            ['staff_view'],
  'staff.create':   ['staff_create'],
  'staff.edit':     ['staff_edit'],
  'staff.delete':   ['staff_delete'],
  settings:         ['settings_view'],
}

export function hasPermission(
  staff: { role: string; permissions: unknown },
  permission: Permission,
): boolean {
  const role = staff.role as AdminRole
  const knownRoles = Object.keys(ROLE_PERMISSIONS) as AdminRole[]
  const safeRole   = knownRoles.includes(role) ? role : 'sales_rep'
  const rolePerms  = ROLE_PERMISSIONS[safeRole] ?? []

  const overrides = (
    typeof staff.permissions === 'object' && staff.permissions !== null
      ? staff.permissions
      : {}
  ) as Record<string, unknown>

  // Direct override (coarse key stored on individual staff)
  if (overrides[permission] === true)  return true
  if (overrides[permission] === false) return false

  // Bridge: if a fine-grained RBAC key was granted (via Role Manager JSONB),
  // treat the corresponding coarse sidebar permission as granted too.
  const rbacKeys = PERMISSION_TO_RBAC[permission]
  if (rbacKeys?.some(k => overrides[k] === true)) return true

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
      { href: '/admin/bookings',        label: 'All Bookings',    icon: 'Calendar', permission: 'bookings'        },
      { href: '/admin/book',            label: 'New Booking',     icon: 'Plus',     permission: 'bookings.create' },
      { href: '/admin/flight-bookings', label: 'Flight Bookings', icon: 'Plane',    permission: 'flights'         },
      { href: '/admin/flights',         label: 'Flight Deals',    icon: 'Plane',    permission: 'flights'         },
      { href: '/admin/flight-extras', label: 'Flight Extras',   icon: 'Sliders',    permission: 'flights'         },
      { href: '/admin/jade-miles',   label: 'Jade Miles',        icon: 'Star',       permission: 'flights'         },
      { href: '/admin/hotels',             label: 'Hotel Promos',       icon: 'Building2',  permission: 'hotels'          },
      { href: '/admin/hotel-destinations', label: 'Top Destinations',   icon: 'MapPin',     permission: 'hotels'          },
      { href: '/admin/transfers',   label: 'Transfers',         icon: 'Car',        permission: 'transfers'       },
      { href: '/admin/itinerary-planner', label: 'Itinerary Planner', icon: 'Plane',      permission: 'bookings'        },
      { href: '/admin/trip-requests', label: 'Trip Requests', icon: 'ClipboardList', permission: 'bookings' },
      { href: '/admin/invoices',    label: 'Invoices',          icon: 'Receipt',    permission: 'payments'        },
      { href: '/admin/tickets',     label: 'Ticket Generator',  icon: 'Ticket',     permission: 'bookings'        },
    ],
  },
  {
    section: 'SERVICES',
    items: [
      { href: '/admin/visa-applications',  label: 'Visa Applications',   icon: 'FileText',   permission: 'visa'      },
      { href: '/admin/visa-pricing',       label: 'Visa Pricing',        icon: 'Tag',        permission: 'visa'      },
      { href: '/admin/visa/bank-analyser', label: 'Bank Analyser',       icon: 'ScanSearch', permission: 'visa'      },
      { href: '/admin/group-visa',         label: 'Group Visa Analysis', icon: 'ShieldCheck', permission: 'visa'      },
      { href: '/admin/tours',              label: 'Tours',               icon: 'Map',        permission: 'tours'     },
      { href: '/admin/documents',          label: 'Documents',           icon: 'FolderOpen', permission: 'documents' },
      { href: '/admin/activities',         label: 'Activities',          icon: 'MapPin',     permission: 'tours'     },
      { href: '/admin/packages',           label: 'Packages',            icon: 'Package',    permission: 'tours'     },
      { href: '/admin/esim',               label: 'Jade Connect / eSIM', icon: 'Signal',     permission: 'bookings'  },
      { href: '/admin/portal',             label: 'Client Portal',       icon: 'Globe',      permission: 'clients'   },
      { href: '/admin/calls',              label: 'Calls',               icon: 'Phone',      permission: 'settings'  },
    ],
  },
  {
    section: 'FINANCE',
    items: [
      { href: '/admin/payments',    label: 'Payments',       icon: 'CreditCard',  permission: 'payments'    },
      { href: '/admin/accounting',  label: 'Accounting',     icon: 'BarChart2',   permission: 'payments'    },
      { href: '/admin/vouchers',    label: 'Vouchers',       icon: 'Gift',        permission: 'payments'    },
      { href: '/admin/commissions', label: 'Commissions',    icon: 'Award',       permission: 'commissions' },
      { href: '/admin/payroll',     label: 'Payroll',        icon: 'DollarSign',  permission: 'payroll'     },
    ],
  },
  {
    section: 'REPORTS',
    items: [
      { href: '/admin/reports',     label: 'Staff Reports',  icon: 'ClipboardList', permission: 'reports'   },
      { href: '/admin/approvals',   label: 'Approvals',      icon: 'CheckCircle',   permission: 'approvals' },
    ],
  },
  {
    section: 'WEBSITE',
    items: [
      { href: '/admin/homepage',        label: 'Homepage',          icon: 'Home',          permission: 'content'      },
      { href: '/admin/hero-slides',     label: 'Hero Slides',       icon: 'Image',         permission: 'content'      },
      { href: '/admin/blog',            label: 'Blog',              icon: 'BookOpen',      permission: 'blog'         },
      { href: '/admin/blog/new',        label: 'New Post',          icon: 'Plus',          permission: 'blog.publish' },
      { href: '/admin/content',         label: 'Website Content',   icon: 'Edit',          permission: 'content'      },
      { href: '/admin/testimonials',    label: 'Testimonials',      icon: 'Star',          permission: 'content'      },
      { href: '/admin/stats',           label: 'Homepage Stats',    icon: 'TrendingUp',    permission: 'content'      },
      { href: '/admin/featured-deals',  label: 'Featured Deals',    icon: 'Tag',           permission: 'bookings'     },
      { href: '/admin/travel-advisory', label: 'Travel Advisories', icon: 'AlertTriangle', permission: 'visa'         },
      { href: '/admin/newsletter',      label: 'Newsletter',        icon: 'Mail',          permission: 'clients'      },
      { href: '/admin/referrals',       label: 'Referral Codes',    icon: 'Users',         permission: 'clients'      },
      { href: '/admin/site-settings',   label: 'Site Settings',     icon: 'Sliders',       permission: 'settings'     },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { href: '/admin/jade',                            label: 'Jade Staff Assistant',  icon: 'Sparkles',      permission: 'jade.staff'                  },
      { href: '/admin/intelligence',                    label: 'Intelligence Hub',      icon: 'Brain',         permission: 'intelligence'                },
      { href: '/admin/intelligence/dna',               label: 'Financial DNA',          icon: 'Dna',           permission: 'intelligence.financial_dna'  },
      { href: '/admin/intelligence/officer-sim',       label: 'Officer Simulation',     icon: 'UserCheck',     permission: 'intelligence.officer_sim'    },
      { href: '/admin/intelligence/embassy-feed',      label: 'Embassy Feed',           icon: 'Radio',         permission: 'intelligence.embassy_feed'   },
      { href: '/admin/intelligence/doc-auth',          label: 'Document Intelligence',  icon: 'ShieldCheck',   permission: 'intelligence.doc_centre'     },
      { href: '/admin/intelligence/cris',              label: 'Client Risk Score',      icon: 'AlertOctagon',  permission: 'intelligence.cris'           },
      { href: '/admin/intelligence/revenue',           label: 'Revenue Opportunities',  icon: 'Zap',           permission: 'intelligence.revenue'        },
      { href: '/admin/intelligence/diaspora',          label: 'Diaspora Intelligence',  icon: 'Globe',         permission: 'intelligence.diaspora'       },
      { href: '/admin/intelligence/staff-performance', label: 'Staff Performance',      icon: 'BarChart2',     permission: 'intelligence.staff_perf'     },
      { href: '/admin/intelligence/conversation',      label: 'Conversation Intel',     icon: 'MessageSquare', permission: 'intelligence.conversation'   },
      { href: '/admin/intelligence/lifecycle',         label: 'Client Lifecycle',       icon: 'TrendingUp',    permission: 'intelligence.lifecycle'      },
    ],
  },
  {
    section: 'GROUP & AI FEATURES',
    items: [
      { href: '/admin/jade-oversight',   label: 'Jade Oversight',  icon: 'MessageSquare', permission: 'jade.staff' },
      { href: '/admin/group-sessions',   label: 'Group Sessions',  icon: 'Users',         permission: 'jade.staff' },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { href: '/admin/routing',     label: 'Routing',      icon: 'GitBranch',   permission: 'settings'     },
      { href: '/admin/staff',       label: 'Staff',        icon: 'Shield',      permission: 'staff'        },
      { href: '/admin/staff/new',   label: 'Add Staff',    icon: 'UserPlus',    permission: 'staff.create' },
      { href: '/admin/roles',       label: 'Role Manager', icon: 'ShieldCheck', permission: 'staff'        },
      { href: '/admin/suppliers',   label: 'Suppliers',    icon: 'Package',     permission: 'suppliers'    },
      { href: '/admin/audit-logs',  label: 'Audit Logs',   icon: 'Activity',    permission: 'audit_logs'   },
      { href: '/admin/api-keys',    label: 'API Keys',     icon: 'Key',         permission: 'api_keys'     },
      { href: '/admin/settings',    label: 'Settings',     icon: 'Settings',    permission: 'settings'     },
    ],
  },
]

export function getNavForStaff(staff: { role: string; permissions: unknown }): NavSection[] {
  if (staff.role === 'super_admin') return NAV_ITEMS
  return NAV_ITEMS
    .map(section => ({
      ...section,
      items: section.items.filter(item => hasPermission(staff, item.permission)),
    }))
    .filter(section => section.items.length > 0)
}
