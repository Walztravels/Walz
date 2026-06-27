/**
 * RBAC Permissions Utility
 *
 * Architecture:
 *   - RolePermission table stores default permissions per role (the baseline).
 *   - Staff.permissions (Json) stores per-staff overrides — empty {} = use role defaults.
 *   - getStaffPermissions() merges both: role defaults first, then staff overrides win.
 *
 * All checks are pure functions — call them from server components, API routes, or
 * the /api/admin/me endpoint that the client-side hook consumes.
 */

export type Role =
  | 'super_admin'
  | 'general_manager'
  | 'senior_manager'
  | 'coordinator'
  | 'sales_rep'

export type PermissionKey =
  // Dashboard
  | 'dashboard_view'
  | 'dashboard_stats_all'
  // Staff
  | 'staff_view'
  | 'staff_create'
  | 'staff_edit'
  | 'staff_delete'
  | 'staff_manage_roles'
  // Applications
  | 'applications_view'
  | 'applications_view_all'
  | 'applications_create'
  | 'applications_edit'
  | 'applications_delete'
  | 'applications_assign'
  | 'applications_approve'
  // Visa
  | 'visa_view'
  | 'visa_view_all'
  | 'visa_own'
  | 'visa_create'
  | 'visa_edit'
  | 'visa_delete'
  | 'visa_approve'
  | 'visa_send_form'
  | 'visa_form_tracker'
  | 'visa_bank_analyser'
  // Trips / Trip Planner
  | 'trips_view'
  | 'trips_view_all'
  | 'trips_create'
  | 'trips_edit'
  | 'trips_delete'
  | 'trips_assign'
  | 'trips_proposals'
  // Clients
  | 'clients_view'
  | 'clients_create'
  | 'clients_edit'
  | 'clients_delete'
  // Leads
  | 'leads_view'
  | 'leads_manage'
  // Bookings
  | 'bookings_view'
  | 'bookings_view_all'
  | 'bookings_create'
  | 'bookings_edit'
  | 'bookings_cancel'
  | 'bookings_delete'
  // Flights
  | 'flights_search'
  | 'flight_deals_view'
  // Payments
  | 'payments_view'
  | 'payments_view_all'
  | 'payments_create'
  | 'payments_manage'
  | 'payments_edit'
  | 'payments_delete'
  | 'payments_refund'
  // Accounting
  | 'accounting_view'
  | 'accounting_export'
  // Invoices
  | 'invoices_view'
  | 'invoices_create'
  | 'invoices_send'
  // Payroll
  | 'payroll_view'
  | 'payroll_run'
  // Reports
  | 'reports_view'
  | 'reports_submit'
  | 'reports_all'
  | 'reports_revenue'
  | 'reports_staff'
  | 'reports_export'
  // Inbox
  | 'inbox_view'
  | 'inbox_reply'
  | 'inbox_assign'
  | 'inbox_delete'
  // Notifications
  | 'notifications_view'
  | 'notifications_send'
  | 'notifications_broadcast'
  // Content & Marketing
  | 'destinations_view'
  | 'destinations_edit'
  | 'hotel_promos_view'
  | 'hotel_promos_edit'
  | 'flight_extras_view'
  | 'jade_miles_view'
  | 'cms_view'
  | 'cms_edit'
  | 'cms_publish'
  // Tools
  | 'ticket_generator'
  | 'itinerary_planner'
  | 'trip_requests'
  | 'transfers_view'
  | 'visa_intelligence'
  // Settings
  | 'settings_view'
  | 'settings_edit'
  | 'settings_roles'
  | 'settings_integrations'
  // Role Management
  | 'roles_view'
  | 'roles_manage'
  | 'roles_assign'

export type Permissions = Record<PermissionKey, boolean>

/** Safe defaults — all false; used when role lookup fails */
export const EMPTY_PERMISSIONS: Permissions = {
  dashboard_view: false,
  dashboard_stats_all: false,
  staff_view: false,
  staff_create: false,
  staff_edit: false,
  staff_delete: false,
  staff_manage_roles: false,
  applications_view: false,
  applications_view_all: false,
  applications_create: false,
  applications_edit: false,
  applications_delete: false,
  applications_assign: false,
  applications_approve: false,
  visa_view: false,
  visa_view_all: false,
  visa_own: false,
  visa_create: false,
  visa_edit: false,
  visa_delete: false,
  visa_approve: false,
  visa_send_form: false,
  visa_form_tracker: false,
  visa_bank_analyser: false,
  trips_view: false,
  trips_view_all: false,
  trips_create: false,
  trips_edit: false,
  trips_delete: false,
  trips_assign: false,
  trips_proposals: false,
  clients_view: false,
  clients_create: false,
  clients_edit: false,
  clients_delete: false,
  leads_view: false,
  leads_manage: false,
  bookings_view: false,
  bookings_view_all: false,
  bookings_create: false,
  bookings_edit: false,
  bookings_cancel: false,
  bookings_delete: false,
  flights_search: false,
  flight_deals_view: false,
  payments_view: false,
  payments_view_all: false,
  payments_create: false,
  payments_manage: false,
  payments_edit: false,
  payments_delete: false,
  payments_refund: false,
  accounting_view: false,
  accounting_export: false,
  invoices_view: false,
  invoices_create: false,
  invoices_send: false,
  payroll_view: false,
  payroll_run: false,
  reports_view: false,
  reports_submit: false,
  reports_all: false,
  reports_revenue: false,
  reports_staff: false,
  reports_export: false,
  inbox_view: false,
  inbox_reply: false,
  inbox_assign: false,
  inbox_delete: false,
  notifications_view: false,
  notifications_send: false,
  notifications_broadcast: false,
  destinations_view: false,
  destinations_edit: false,
  hotel_promos_view: false,
  hotel_promos_edit: false,
  flight_extras_view: false,
  jade_miles_view: false,
  cms_view: false,
  cms_edit: false,
  cms_publish: false,
  ticket_generator: false,
  itinerary_planner: false,
  trip_requests: false,
  transfers_view: false,
  visa_intelligence: false,
  settings_view: false,
  settings_edit: false,
  settings_roles: false,
  settings_integrations: false,
  roles_view: false,
  roles_manage: false,
  roles_assign: false,
}

/**
 * Merge role-level defaults with per-staff overrides.
 * Staff-level overrides win. Unknown keys in overrides are ignored.
 */
export function mergePermissions(
  roleDefaults: Partial<Permissions>,
  staffOverrides: Partial<Permissions>,
): Permissions {
  return {
    ...EMPTY_PERMISSIONS,
    ...roleDefaults,
    ...staffOverrides,
  } as Permissions
}

/**
 * Check a single permission against a resolved Permissions object.
 */
export function can(permissions: Permissions, key: PermissionKey): boolean {
  return permissions[key] === true
}

/**
 * Check multiple permissions — returns true only if ALL are granted.
 */
export function canAll(permissions: Permissions, keys: PermissionKey[]): boolean {
  return keys.every((k) => permissions[k] === true)
}

/**
 * Check multiple permissions — returns true if ANY is granted.
 */
export function canAny(permissions: Permissions, keys: PermissionKey[]): boolean {
  return keys.some((k) => permissions[k] === true)
}

/**
 * Role hierarchy for display and ordering.
 * Higher index = more authority.
 */
export const ROLE_HIERARCHY: Role[] = [
  'sales_rep',
  'coordinator',
  'senior_manager',
  'general_manager',
  'super_admin',
]

export const ROLE_LABELS: Record<Role, string> = {
  super_admin:      'Super Admin',
  general_manager:  'General Manager',
  senior_manager:   'Senior Manager',
  coordinator:      'Coordinator',
  sales_rep:        'Sales Representative',
}

export const ROLE_COLORS: Record<Role, string> = {
  super_admin:      '#7C3AED',
  general_manager:  '#0B1F3A',
  senior_manager:   '#C9A84C',
  coordinator:      '#2563EB',
  sales_rep:        '#16A34A',
}

export const ROLE_BG_CLASSES: Record<Role, string> = {
  super_admin:      'bg-violet-600 text-white',
  general_manager:  'bg-[#0B1F3A] text-white',
  senior_manager:   'bg-[#C9A84C] text-[#0B1F3A]',
  coordinator:      'bg-blue-600 text-white',
  sales_rep:        'bg-green-600 text-white',
}

/**
 * Returns true if roleA has equal or greater authority than roleB.
 */
export function isAtLeast(roleA: Role, roleB: Role): boolean {
  return ROLE_HIERARCHY.indexOf(roleA) >= ROLE_HIERARCHY.indexOf(roleB)
}

/**
 * Route → required permission map.
 * Used by middleware for coarse-grained route protection.
 */
export const ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
  '/admin/dashboard':   'dashboard_view',
  '/admin/staff':       'staff_view',
  '/admin/applications':'applications_view',
  '/admin/visa':        'visa_view',
  '/admin/trip-planner':'trips_view',
  '/admin/bookings':    'bookings_view',
  '/admin/payments':    'payments_view',
  '/admin/accounting':  'accounting_view',
  '/admin/reports':     'reports_view',
  '/admin/settings':    'settings_view',
  '/admin/cms':         'cms_view',
  '/admin/roles':       'roles_view',
}

// ─── Master permission groups ─────────────────────────────────────────────────
// Single source of truth for Role Manager UI and the DB seed.

export interface PermissionGroup {
  label: string
  keys:  Array<{ key: PermissionKey; label: string; desc: string }>
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: 'Dashboard',
    keys: [
      { key: 'dashboard_view',      label: 'View Dashboard',         desc: 'Access the admin dashboard home' },
      { key: 'dashboard_stats_all', label: 'All Dashboard Stats',    desc: 'See org-wide summary stats, not just own' },
    ],
  },
  {
    label: 'Clients & Leads',
    keys: [
      { key: 'clients_view',   label: 'View Clients',   desc: 'See client list and profiles' },
      { key: 'clients_create', label: 'Create Clients', desc: 'Add new client records' },
      { key: 'clients_edit',   label: 'Edit Clients',   desc: 'Update client details' },
      { key: 'clients_delete', label: 'Delete Clients', desc: 'Permanently remove client records' },
      { key: 'leads_view',     label: 'View Leads',     desc: 'See leads and enquiry list' },
      { key: 'leads_manage',   label: 'Manage Leads',   desc: 'Assign, update, and convert leads' },
    ],
  },
  {
    label: 'Bookings',
    keys: [
      { key: 'bookings_view',     label: 'View Bookings',     desc: 'See own bookings and details' },
      { key: 'bookings_view_all', label: 'View All Bookings', desc: "View all staff members' bookings" },
      { key: 'bookings_create',   label: 'Create Bookings',   desc: 'Make new flight, hotel, or tour bookings' },
      { key: 'bookings_edit',     label: 'Edit Bookings',     desc: 'Modify existing booking details' },
      { key: 'bookings_cancel',   label: 'Cancel Bookings',   desc: 'Cancel bookings and initiate voids' },
      { key: 'bookings_delete',   label: 'Delete Bookings',   desc: 'Permanently remove booking records' },
    ],
  },
  {
    label: 'Flights & Trips',
    keys: [
      { key: 'flights_search',   label: 'Search Flights',    desc: 'Search and price flights' },
      { key: 'flight_deals_view',label: 'View Flight Deals', desc: 'See promoted flight deals and specials' },
      { key: 'ticket_generator', label: 'Ticket Generator',  desc: 'Generate flight itinerary PDFs' },
      { key: 'itinerary_planner',label: 'Itinerary Planner', desc: 'Build full trip itineraries' },
      { key: 'trip_requests',    label: 'Trip Requests',     desc: 'Send and receive client trip intake forms' },
      { key: 'transfers_view',   label: 'Transfers',         desc: 'View and manage airport transfers' },
      { key: 'trips_view',       label: 'View Trips',        desc: 'See trip planner records' },
      { key: 'trips_view_all',   label: 'View All Trips',    desc: "View all staff members' trips" },
      { key: 'trips_create',     label: 'Create Trips',      desc: 'Create new trip plans' },
      { key: 'trips_edit',       label: 'Edit Trips',        desc: 'Modify trip details' },
      { key: 'trips_delete',     label: 'Delete Trips',      desc: 'Remove trip records' },
      { key: 'trips_assign',     label: 'Assign Trips',      desc: 'Assign trips to other staff' },
      { key: 'trips_proposals',  label: 'Trip Proposals',    desc: 'Create and send trip proposals to clients' },
    ],
  },
  {
    label: 'Visa Applications',
    keys: [
      { key: 'visa_view',         label: 'View Visa Apps',        desc: 'See visa application list' },
      { key: 'visa_view_all',     label: 'View All Visa Apps',    desc: "View all staff members' visa applications" },
      { key: 'visa_own',          label: 'View Own Visa Apps',    desc: 'View only personally assigned visa applications' },
      { key: 'visa_create',       label: 'Create Visa Apps',      desc: 'Submit new visa applications' },
      { key: 'visa_edit',         label: 'Edit Visa Apps',        desc: 'Update visa application details' },
      { key: 'visa_approve',      label: 'Approve Visa Apps',     desc: 'Change visa status and make approval decisions' },
      { key: 'visa_delete',       label: 'Delete Visa Apps',      desc: 'Remove visa application records' },
      { key: 'visa_send_form',    label: 'Send Visa Forms',       desc: 'Send application forms to clients' },
      { key: 'visa_form_tracker', label: 'Form Tracker',          desc: 'Track client form completion status' },
      { key: 'visa_bank_analyser',label: 'Bank Statement Analyser',desc: 'Analyse bank statements for visa applications' },
      { key: 'visa_intelligence', label: 'Visa Intelligence',     desc: 'AI-powered visa document and risk analysis' },
    ],
  },
  {
    label: 'Payments',
    keys: [
      { key: 'payments_view',     label: 'View Payments',      desc: 'See payment records and statuses' },
      { key: 'payments_view_all', label: 'View All Payments',  desc: 'View full payment history across all staff' },
      { key: 'payments_create',   label: 'Create Payment Links',desc: 'Generate Stripe, Flutterwave, and VA payment links' },
      { key: 'payments_manage',   label: 'Manage Payments',    desc: 'Verify transactions and manually mark as paid' },
      { key: 'payments_edit',     label: 'Edit Payments',      desc: 'Update payment reference and details' },
      { key: 'payments_refund',   label: 'Process Refunds',    desc: 'Issue full and partial refunds' },
      { key: 'payments_delete',   label: 'Delete Payments',    desc: 'Remove payment records' },
    ],
  },
  {
    label: 'Accounting & Finance',
    keys: [
      { key: 'accounting_view',   label: 'View Accounting',    desc: 'Access the transaction ledger and accounting page' },
      { key: 'accounting_export', label: 'Export Transactions', desc: 'Download transaction data as CSV' },
      { key: 'invoices_view',     label: 'View Invoices',       desc: 'See invoice list and details' },
      { key: 'invoices_create',   label: 'Create Invoices',     desc: 'Generate new invoices' },
      { key: 'invoices_send',     label: 'Send Invoices',       desc: 'Email invoices to clients' },
      { key: 'payroll_view',      label: 'View Payroll',        desc: 'See staff payroll records' },
      { key: 'payroll_run',       label: 'Run Payroll',         desc: 'Process and approve payroll runs' },
      { key: 'reports_view',      label: 'View Own Reports',    desc: 'Access own report submissions' },
      { key: 'reports_submit',    label: 'Submit Reports',      desc: 'Submit new reports for review' },
      { key: 'reports_all',       label: 'View All Reports',    desc: "View all staff members' reports" },
      { key: 'reports_revenue',   label: 'Revenue Reports',     desc: 'See revenue, P&L, and financial summaries' },
      { key: 'reports_staff',     label: 'Staff Reports',       desc: 'View staff performance and activity reports' },
      { key: 'reports_export',    label: 'Export Reports',      desc: 'Download report data' },
    ],
  },
  {
    label: 'Staff Management',
    keys: [
      { key: 'staff_view',        label: 'View Staff',         desc: 'See staff list and profiles' },
      { key: 'staff_create',      label: 'Create Staff',       desc: 'Add new staff accounts' },
      { key: 'staff_edit',        label: 'Edit Staff',         desc: 'Update staff details and roles' },
      { key: 'staff_delete',      label: 'Delete Staff',       desc: 'Deactivate or remove staff accounts' },
      { key: 'staff_manage_roles',label: 'Manage Staff Roles', desc: 'Change staff role assignments' },
    ],
  },
  {
    label: 'Applications',
    keys: [
      { key: 'applications_view',     label: 'View Own Applications', desc: 'See personally submitted applications' },
      { key: 'applications_view_all', label: 'View All Applications', desc: "View all staff members' applications" },
      { key: 'applications_create',   label: 'Create Applications',   desc: 'Submit new applications' },
      { key: 'applications_edit',     label: 'Edit Applications',     desc: 'Modify application details' },
      { key: 'applications_delete',   label: 'Delete Applications',   desc: 'Remove application records' },
      { key: 'applications_assign',   label: 'Assign Applications',   desc: 'Assign applications to other staff' },
      { key: 'applications_approve',  label: 'Approve Applications',  desc: 'Approve or reject applications' },
    ],
  },
  {
    label: 'Inbox & Communications',
    keys: [
      { key: 'inbox_view',              label: 'View Inbox',           desc: 'Read incoming client messages' },
      { key: 'inbox_reply',             label: 'Reply to Messages',    desc: 'Send replies to clients' },
      { key: 'inbox_assign',            label: 'Assign Messages',      desc: 'Assign conversations to other staff' },
      { key: 'inbox_delete',            label: 'Delete Messages',      desc: 'Delete inbox threads' },
      { key: 'notifications_view',      label: 'View Notifications',   desc: 'See system notifications' },
      { key: 'notifications_send',      label: 'Send Notifications',   desc: 'Send notifications to staff or clients' },
      { key: 'notifications_broadcast', label: 'Broadcast Notifications', desc: 'Send mass notifications to all staff' },
    ],
  },
  {
    label: 'Content & Marketing',
    keys: [
      { key: 'destinations_view',  label: 'View Destinations',    desc: 'See destination pages and content' },
      { key: 'destinations_edit',  label: 'Edit Destinations',    desc: 'Update destination page content' },
      { key: 'hotel_promos_view',  label: 'View Hotel Promos',    desc: 'See hotel promotional listings' },
      { key: 'hotel_promos_edit',  label: 'Edit Hotel Promos',    desc: 'Update hotel promotional content' },
      { key: 'flight_extras_view', label: 'View Flight Extras',   desc: 'See flight extras and add-on content' },
      { key: 'jade_miles_view',    label: 'View Jade Miles',      desc: 'See Jade Miles loyalty programme data' },
      { key: 'cms_view',           label: 'View CMS',             desc: 'Access website content management' },
      { key: 'cms_edit',           label: 'Edit CMS Content',     desc: 'Update homepage, testimonials, slides' },
      { key: 'cms_publish',        label: 'Publish CMS',          desc: 'Publish content changes to live site' },
    ],
  },
  {
    label: 'Administration',
    keys: [
      { key: 'roles_view',            label: 'View Role Manager',     desc: 'View role permissions and settings' },
      { key: 'roles_manage',          label: 'Manage Role Permissions',desc: 'Edit default permissions for each role' },
      { key: 'roles_assign',          label: 'Assign Roles',          desc: 'Change the role assigned to a staff member' },
      { key: 'settings_view',         label: 'View Settings',         desc: 'Access system settings pages' },
      { key: 'settings_edit',         label: 'Edit Settings',         desc: 'Modify system configuration' },
      { key: 'settings_roles',        label: 'Manage Integrations Config', desc: 'Configure role-linked settings' },
      { key: 'settings_integrations', label: 'Manage Integrations',   desc: 'Connect and configure third-party integrations' },
    ],
  },
]

// ─── Role defaults (for "Reset to Default" preset) ───────────────────────────

const T = true
const F = false

export const ROLE_DEFAULTS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
  super_admin: Object.fromEntries(
    (Object.keys(EMPTY_PERMISSIONS) as PermissionKey[]).map(k => [k, true])
  ) as Partial<Record<PermissionKey, boolean>>,

  operations_manager: {
    dashboard_view: T, dashboard_stats_all: T,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: T,
    bookings_view: T, bookings_view_all: T, bookings_create: T, bookings_edit: T, bookings_cancel: T, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: T, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: T, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: T, trips_proposals: T,
    visa_view: T, visa_view_all: T, visa_own: T, visa_create: T, visa_edit: T, visa_approve: T, visa_delete: F,
    visa_send_form: T, visa_form_tracker: T, visa_bank_analyser: T, visa_intelligence: T,
    payments_view: T, payments_view_all: T, payments_create: T, payments_manage: T, payments_edit: T, payments_refund: T, payments_delete: F,
    accounting_view: T, accounting_export: T, invoices_view: T, invoices_create: T, invoices_send: T,
    payroll_view: T, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: T, reports_revenue: T, reports_staff: T, reports_export: T,
    staff_view: T, staff_create: T, staff_edit: T, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: T, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: T, applications_approve: T,
    inbox_view: T, inbox_reply: T, inbox_assign: T, inbox_delete: F,
    notifications_view: T, notifications_send: T, notifications_broadcast: T,
    destinations_view: T, destinations_edit: T, hotel_promos_view: T, hotel_promos_edit: T, flight_extras_view: T, jade_miles_view: T,
    cms_view: T, cms_edit: T, cms_publish: T,
    roles_view: T, roles_manage: F, roles_assign: F,
    settings_view: T, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  general_manager: {
    dashboard_view: T, dashboard_stats_all: T,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: T,
    bookings_view: T, bookings_view_all: T, bookings_create: T, bookings_edit: T, bookings_cancel: T, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: T, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: T, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: T, trips_proposals: T,
    visa_view: T, visa_view_all: T, visa_own: T, visa_create: T, visa_edit: T, visa_approve: T, visa_delete: F,
    visa_send_form: T, visa_form_tracker: T, visa_bank_analyser: T, visa_intelligence: T,
    payments_view: T, payments_view_all: T, payments_create: T, payments_manage: T, payments_edit: T, payments_refund: T, payments_delete: F,
    accounting_view: T, accounting_export: T, invoices_view: T, invoices_create: T, invoices_send: T,
    payroll_view: T, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: T, reports_revenue: T, reports_staff: T, reports_export: T,
    staff_view: T, staff_create: F, staff_edit: T, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: T, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: T, applications_approve: T,
    inbox_view: T, inbox_reply: T, inbox_assign: T, inbox_delete: F,
    notifications_view: T, notifications_send: T, notifications_broadcast: T,
    destinations_view: T, destinations_edit: T, hotel_promos_view: T, hotel_promos_edit: T, flight_extras_view: T, jade_miles_view: T,
    cms_view: T, cms_edit: T, cms_publish: T,
    roles_view: T, roles_manage: F, roles_assign: F,
    settings_view: T, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  senior_manager: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: T,
    bookings_view: T, bookings_view_all: T, bookings_create: T, bookings_edit: T, bookings_cancel: F, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: T, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: T, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: T, trips_proposals: T,
    visa_view: T, visa_view_all: T, visa_own: T, visa_create: T, visa_edit: T, visa_approve: T, visa_delete: F,
    visa_send_form: T, visa_form_tracker: T, visa_bank_analyser: T, visa_intelligence: T,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: T,
    staff_view: T, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: T, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: T, applications_approve: T,
    inbox_view: T, inbox_reply: T, inbox_assign: T, inbox_delete: F,
    notifications_view: T, notifications_send: T, notifications_broadcast: F,
    destinations_view: T, destinations_edit: F, hotel_promos_view: T, hotel_promos_edit: F, flight_extras_view: T, jade_miles_view: T,
    cms_view: T, cms_edit: T, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  visa_officer: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: F,
    bookings_view: F, bookings_view_all: F, bookings_create: F, bookings_edit: F, bookings_cancel: F, bookings_delete: F,
    flights_search: F, flight_deals_view: F, ticket_generator: F, itinerary_planner: F, transfers_view: F,
    trips_view: F, trips_view_all: F, trips_create: F, trips_edit: F, trips_delete: F, trips_assign: F, trips_proposals: F,
    visa_view: T, visa_view_all: T, visa_own: T, visa_create: T, visa_edit: T, visa_approve: T, visa_delete: F,
    visa_send_form: T, visa_form_tracker: T, visa_bank_analyser: T, visa_intelligence: T,
    payments_view: F, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: T, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: T,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: F, destinations_edit: F, hotel_promos_view: F, hotel_promos_edit: F, flight_extras_view: F, jade_miles_view: F,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  coordinator: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: F,
    bookings_view: T, bookings_view_all: F, bookings_create: T, bookings_edit: T, bookings_cancel: F, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: T, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: F, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: F, trips_proposals: T,
    visa_view: T, visa_view_all: F, visa_own: T, visa_create: T, visa_edit: T, visa_approve: F, visa_delete: F,
    visa_send_form: T, visa_form_tracker: T, visa_bank_analyser: T, visa_intelligence: T,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: F, destinations_edit: F, hotel_promos_view: F, hotel_promos_edit: F, flight_extras_view: F, jade_miles_view: F,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  flight_staff: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: F,
    bookings_view: T, bookings_view_all: F, bookings_create: T, bookings_edit: T, bookings_cancel: F, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: T, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: F, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: F, trips_proposals: T,
    visa_view: F, visa_view_all: F, visa_own: F, visa_create: F, visa_edit: F, visa_approve: F, visa_delete: F,
    visa_send_form: F, visa_form_tracker: F, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: F, destinations_edit: F, hotel_promos_view: F, hotel_promos_edit: F, flight_extras_view: T, jade_miles_view: F,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  tours_staff: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: F,
    bookings_view: T, bookings_view_all: F, bookings_create: T, bookings_edit: T, bookings_cancel: F, bookings_delete: F,
    flights_search: F, flight_deals_view: F, ticket_generator: F, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: F, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: F, trips_proposals: T,
    visa_view: F, visa_view_all: F, visa_own: F, visa_create: F, visa_edit: F, visa_approve: F, visa_delete: F,
    visa_send_form: F, visa_form_tracker: F, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: T, destinations_edit: F, hotel_promos_view: T, hotel_promos_edit: F, flight_extras_view: F, jade_miles_view: F,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  hotel_staff: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: F,
    bookings_view: T, bookings_view_all: F, bookings_create: T, bookings_edit: T, bookings_cancel: F, bookings_delete: F,
    flights_search: F, flight_deals_view: F, ticket_generator: F, itinerary_planner: T, transfers_view: T,
    trips_view: T, trips_view_all: F, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: F, trips_proposals: T,
    visa_view: F, visa_view_all: F, visa_own: F, visa_create: F, visa_edit: F, visa_approve: F, visa_delete: F,
    visa_send_form: F, visa_form_tracker: F, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: T, destinations_edit: F, hotel_promos_view: T, hotel_promos_edit: T, flight_extras_view: F, jade_miles_view: F,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  sales_agent: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: T,
    bookings_view: T, bookings_view_all: F, bookings_create: T, bookings_edit: F, bookings_cancel: F, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: F, itinerary_planner: F, transfers_view: F,
    trips_view: T, trips_view_all: F, trips_create: T, trips_edit: F, trips_delete: F, trips_assign: F, trips_proposals: T,
    visa_view: T, visa_view_all: F, visa_own: T, visa_create: T, visa_edit: F, visa_approve: F, visa_delete: F,
    visa_send_form: F, visa_form_tracker: F, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: T, destinations_edit: F, hotel_promos_view: T, hotel_promos_edit: F, flight_extras_view: T, jade_miles_view: T,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  accountant: {
    dashboard_view: T, dashboard_stats_all: T,
    clients_view: T, clients_create: F, clients_edit: F, clients_delete: F,
    leads_view: F, leads_manage: F,
    bookings_view: T, bookings_view_all: T, bookings_create: F, bookings_edit: F, bookings_cancel: F, bookings_delete: F,
    flights_search: F, flight_deals_view: F, ticket_generator: F, itinerary_planner: F, transfers_view: F,
    trips_view: F, trips_view_all: F, trips_create: F, trips_edit: F, trips_delete: F, trips_assign: F, trips_proposals: F,
    visa_view: F, visa_view_all: F, visa_own: F, visa_create: F, visa_edit: F, visa_approve: F, visa_delete: F,
    visa_send_form: F, visa_form_tracker: F, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: T, payments_create: T, payments_manage: T, payments_edit: T, payments_refund: T, payments_delete: F,
    accounting_view: T, accounting_export: T, invoices_view: T, invoices_create: T, invoices_send: T,
    payroll_view: T, payroll_run: T,
    reports_view: T, reports_submit: T, reports_all: T, reports_revenue: T, reports_staff: T, reports_export: T,
    staff_view: T, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: T, applications_create: F, applications_edit: F, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: F, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: F, destinations_edit: F, hotel_promos_view: F, hotel_promos_edit: F, flight_extras_view: F, jade_miles_view: F,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  customer_support: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: F,
    bookings_view: T, bookings_view_all: F, bookings_create: F, bookings_edit: F, bookings_cancel: F, bookings_delete: F,
    flights_search: F, flight_deals_view: T, ticket_generator: F, itinerary_planner: F, transfers_view: F,
    trips_view: T, trips_view_all: F, trips_create: F, trips_edit: F, trips_delete: F, trips_assign: F, trips_proposals: F,
    visa_view: T, visa_view_all: F, visa_own: T, visa_create: F, visa_edit: F, visa_approve: F, visa_delete: F,
    visa_send_form: F, visa_form_tracker: T, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: T, reports_submit: T, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: T, destinations_edit: F, hotel_promos_view: T, hotel_promos_edit: F, flight_extras_view: T, jade_miles_view: T,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },

  sales_rep: {
    dashboard_view: T, dashboard_stats_all: F,
    clients_view: T, clients_create: T, clients_edit: T, clients_delete: F,
    leads_view: T, leads_manage: T,
    bookings_view: T, bookings_view_all: F, bookings_create: T, bookings_edit: F, bookings_cancel: F, bookings_delete: F,
    flights_search: T, flight_deals_view: T, ticket_generator: F, itinerary_planner: F, transfers_view: F,
    trips_view: T, trips_view_all: F, trips_create: T, trips_edit: T, trips_delete: F, trips_assign: F, trips_proposals: F,
    visa_view: T, visa_view_all: F, visa_own: T, visa_create: T, visa_edit: T, visa_delete: F, visa_approve: F,
    visa_send_form: F, visa_form_tracker: F, visa_bank_analyser: F, visa_intelligence: F,
    payments_view: T, payments_view_all: F, payments_create: F, payments_manage: F, payments_edit: F, payments_refund: F, payments_delete: F,
    accounting_view: F, accounting_export: F, invoices_view: F, invoices_create: F, invoices_send: F,
    payroll_view: F, payroll_run: F,
    reports_view: F, reports_submit: F, reports_all: F, reports_revenue: F, reports_staff: F, reports_export: F,
    staff_view: F, staff_create: F, staff_edit: F, staff_delete: F, staff_manage_roles: F,
    applications_view: T, applications_view_all: F, applications_create: T, applications_edit: T, applications_delete: F, applications_assign: F, applications_approve: F,
    inbox_view: T, inbox_reply: T, inbox_assign: F, inbox_delete: F,
    notifications_view: T, notifications_send: F, notifications_broadcast: F,
    destinations_view: T, destinations_edit: F, hotel_promos_view: T, hotel_promos_edit: F, flight_extras_view: T, jade_miles_view: T,
    cms_view: F, cms_edit: F, cms_publish: F,
    roles_view: F, roles_manage: F, roles_assign: F,
    settings_view: F, settings_edit: F, settings_roles: F, settings_integrations: F,
  },
}
