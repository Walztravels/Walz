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
  | 'visa_create'
  | 'visa_edit'
  | 'visa_delete'
  | 'visa_approve'
  // Trips / Trip Planner
  | 'trips_view'
  | 'trips_view_all'
  | 'trips_create'
  | 'trips_edit'
  | 'trips_delete'
  | 'trips_assign'
  | 'trips_proposals'
  // Bookings
  | 'bookings_view'
  | 'bookings_view_all'
  | 'bookings_create'
  | 'bookings_edit'
  | 'bookings_delete'
  // Payments
  | 'payments_view'
  | 'payments_view_all'
  | 'payments_create'
  | 'payments_edit'
  | 'payments_delete'
  | 'payments_refund'
  // Reports
  | 'reports_view'
  | 'reports_all'
  | 'reports_revenue'
  | 'reports_staff'
  | 'reports_export'
  // Settings
  | 'settings_view'
  | 'settings_edit'
  | 'settings_roles'
  | 'settings_integrations'
  // CMS
  | 'cms_view'
  | 'cms_edit'
  | 'cms_publish'
  // Notifications
  | 'notifications_view'
  | 'notifications_send'
  | 'notifications_broadcast'

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
  visa_create: false,
  visa_edit: false,
  visa_delete: false,
  visa_approve: false,
  trips_view: false,
  trips_view_all: false,
  trips_create: false,
  trips_edit: false,
  trips_delete: false,
  trips_assign: false,
  trips_proposals: false,
  bookings_view: false,
  bookings_view_all: false,
  bookings_create: false,
  bookings_edit: false,
  bookings_delete: false,
  payments_view: false,
  payments_view_all: false,
  payments_create: false,
  payments_edit: false,
  payments_delete: false,
  payments_refund: false,
  reports_view: false,
  reports_all: false,
  reports_revenue: false,
  reports_staff: false,
  reports_export: false,
  settings_view: false,
  settings_edit: false,
  settings_roles: false,
  settings_integrations: false,
  cms_view: false,
  cms_edit: false,
  cms_publish: false,
  notifications_view: false,
  notifications_send: false,
  notifications_broadcast: false,
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
  '/admin/dashboard':           'dashboard_view',
  '/admin/staff':               'staff_view',
  '/admin/applications':        'applications_view',
  '/admin/visa':                'visa_view',
  '/admin/trip-planner':        'trips_view',
  '/admin/bookings':            'bookings_view',
  '/admin/payments':            'payments_view',
  '/admin/reports':             'reports_view',
  '/admin/settings':            'settings_view',
  '/admin/cms':                 'cms_view',
}
