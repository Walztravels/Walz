/**
 * RBAC Role Catalogue — single source of truth for assignable staff roles.
 *
 * Before this file existed, the same 13-role list was defined four separate
 * times and had already drifted:
 *   - app/admin/staff/page.tsx's local `RbacRole` type + `STAFF_ROLES` array
 *   - app/api/admin/roles/[role]/route.ts's local `ROLE_DISPLAY` label/color map
 *   - app/admin/roles/page.tsx's local `ROLE_META` label/color/description map
 *   - app/api/admin/staff/route.ts + .../staff/[id]/route.ts's hardcoded
 *     5-role `VALID_ROLES` allowlist (a stopgap that silently rejected 8 of
 *     the 13 roles the Staff creation UI actually offered)
 *
 * IMPORTANT — what this catalogue does NOT do: listing a role here does not
 * grant it any permissions. Only a row in the `RolePermission` table (created
 * via Role Manager, Settings → Roles) grants access at runtime — see
 * lib/admin-auth.ts's getAdminSession(). A role can legitimately appear here
 * "assignable" while having zero configured permissions; the Staff API's
 * requireConfiguredRole() guard (below) is what stops that gap from being
 * hit silently, by refusing to create/update a Staff record with a role that
 * has no RolePermission row yet (super_admin is exempt — it is handled
 * specially everywhere and never needs a DB row).
 *
 * Do NOT add RolePermission rows here or anywhere else for roles that don't
 * have one yet — that is a deliberate, separate decision for a human to make
 * in Role Manager, not something this catalogue should auto-provision.
 */

export type RbacRole =
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

export interface RoleCatalogEntry {
  value: RbacRole
  label: string
  /** Short one-line description — Staff page role list badges / reference card. */
  description: string
  /** Longer description — Staff creation/edit form info box. */
  fullDescription: string
  /** Longer description — Role Manager's role list/detail panel (a separately
   *  authored copy that predates this catalogue; kept distinct so consolidating
   *  the *list* of roles doesn't silently rewrite that page's copy). */
  managerDescription: string
  /** Tailwind pill classes, e.g. "bg-blue-100 text-blue-700" (Staff page badges). */
  badgeClass: string
  /** Tailwind dot classes for the pill's dot, e.g. "bg-blue-500" (Staff page). */
  dotClass: string
  /** Solid (600-weight, white-text) Tailwind class — Role Manager's role list
   *  dots/badges and Staff Overrides tab role chip. */
  solidClass: string
  /** Hex color persisted to RolePermission.color when a role's row is first
   *  created via PATCH /api/admin/roles/[role]. */
  hexColor: string
  /** true only for super_admin: always-all-permissions, never stored in or
   *  edited via RolePermission, exempt from the configured-role guard. */
  isSuperAdmin: boolean
}

const SUPER_ADMIN_ENTRY: RoleCatalogEntry = {
  value:              'super_admin',
  label:              'Super Admin',
  description:        'Full system access — all features, settings and staff management',
  fullDescription:    'Unrestricted access to all features, system settings, API credentials, audit logs and staff management.',
  managerDescription: 'Full unrestricted access to everything',
  badgeClass:         'bg-violet-100 text-violet-700',
  dotClass:           'bg-violet-500',
  solidClass:         'bg-violet-600',
  hexColor:           '#7C3AED',
  isSuperAdmin:       true,
}

/** Non-super_admin roles, in the order the Staff creation dropdown has always shown them. */
const STAFF_CATALOG: RoleCatalogEntry[] = [
  {
    value:              'operations_manager',
    label:              'Operations Manager',
    description:        'All bookings, clients & staff oversight',
    fullDescription:    'Full operational access. Manages all bookings, clients, visa processing, supplier management and staff performance. Cannot access system settings or API credentials.',
    managerDescription: 'All ops, clients, bookings, staff oversight, intelligence',
    badgeClass:         'bg-blue-100 text-blue-700',
    dotClass:           'bg-blue-500',
    solidClass:         'bg-blue-600',
    hexColor:           '#2563EB',
    isSuperAdmin:       false,
  },
  {
    value:              'general_manager',
    label:              'General Manager',
    description:        'Broad access — bookings, clients, visa & tours',
    fullDescription:    'Operations access. Manages clients, bookings, visa applications and trip planner. Cannot access staff management, settings or financial reports.',
    managerDescription: 'Broad access — bookings, clients, visa, tours, intelligence',
    badgeClass:         'bg-indigo-100 text-indigo-700',
    dotClass:           'bg-indigo-500',
    solidClass:         'bg-indigo-600',
    hexColor:           '#4338CA',
    isSuperAdmin:       false,
  },
  {
    value:              'senior_manager',
    label:              'Senior Manager',
    description:        'Bookings, visa, clients & reports',
    fullDescription:    'Senior management access. Manages bookings, visa applications and client records. Has access to reports and analytics. Cannot manage staff or settings.',
    managerDescription: 'Bookings, visa, clients, reports, core intelligence',
    badgeClass:         'bg-teal-100 text-teal-700',
    dotClass:           'bg-teal-500',
    solidClass:         'bg-teal-700',
    hexColor:           '#0F766E',
    isSuperAdmin:       false,
  },
  {
    value:              'visa_officer',
    label:              'Visa Officer',
    description:        'Visa applications, documents & compliance',
    fullDescription:    'Visa department access only. Processes visa applications, reviews documents, tracks embassy appointments and manages compliance reports.',
    managerDescription: 'Visa applications, documents, Document Intelligence Centre',
    badgeClass:         'bg-purple-100 text-purple-700',
    dotClass:           'bg-purple-500',
    solidClass:         'bg-purple-600',
    hexColor:           '#7C3AED',
    isSuperAdmin:       false,
  },
  {
    value:              'flight_staff',
    label:              'Flight Ticketing Staff',
    description:        'Flights, tickets, PNRs & refunds',
    fullDescription:    'Flight operations access. Issues and manages tickets, PNR management, refund requests and airline communications. No access to visa or accounts.',
    managerDescription: 'Flights, tickets, PNRs, itinerary generator',
    badgeClass:         'bg-sky-100 text-sky-700',
    dotClass:           'bg-sky-500',
    solidClass:         'bg-sky-600',
    hexColor:           '#0284C7',
    isSuperAdmin:       false,
  },
  {
    value:              'tours_staff',
    label:              'Tours & Activities Staff',
    description:        'Tours, activities & vouchers',
    fullDescription:    'Tours department access. Manages tours, Hotelbeds activities, tour guides and customer vouchers.',
    managerDescription: 'Tours, activities, vouchers, Jade AI',
    badgeClass:         'bg-green-100 text-green-700',
    dotClass:           'bg-green-500',
    solidClass:         'bg-green-600',
    hexColor:           '#16A34A',
    isSuperAdmin:       false,
  },
  {
    value:              'hotel_staff',
    label:              'Hotel Reservation Staff',
    description:        'Hotel bookings & guest management',
    fullDescription:    'Hotel department access. Manages hotel bookings, supplier relationships and guest management.',
    managerDescription: 'Hotel bookings, guest management, Jade AI',
    badgeClass:         'bg-cyan-100 text-cyan-700',
    dotClass:           'bg-cyan-500',
    solidClass:         'bg-cyan-600',
    hexColor:           '#0891B2',
    isSuperAdmin:       false,
  },
  {
    value:              'sales_agent',
    label:              'Sales Agent',
    description:        'Assigned leads, CRM & quotes',
    fullDescription:    'Sales access only. Manages assigned leads, CRM, quotes and invoices. Can only see their own clients and leads. Cannot see other agents data.',
    managerDescription: 'Assigned leads, CRM, own clients, Jade AI',
    badgeClass:         'bg-orange-100 text-orange-700',
    dotClass:           'bg-orange-500',
    solidClass:         'bg-orange-600',
    hexColor:           '#EA580C',
    isSuperAdmin:       false,
  },
  {
    value:              'coordinator',
    label:              'Coordinator',
    description:        'Visa, clients & bookings coordination',
    fullDescription:    'Coordination access. Manages visa processing, client files and booking coordination. Cannot see financial reports or staff management.',
    managerDescription: 'Visa + booking coordination, document tools',
    badgeClass:         'bg-amber-100 text-amber-700',
    dotClass:           'bg-amber-500',
    solidClass:         'bg-amber-600',
    hexColor:           '#D97706',
    isSuperAdmin:       false,
  },
  {
    value:              'sales_rep',
    label:              'Sales Representative',
    description:        'Leads and reports only',
    fullDescription:    'Leads and reports only. Manages leads and submits daily reports. View only access to clients.',
    managerDescription: 'Leads and reports only, Jade AI',
    badgeClass:         'bg-yellow-100 text-yellow-700',
    dotClass:           'bg-yellow-500',
    solidClass:         'bg-yellow-600',
    hexColor:           '#CA8A04',
    isSuperAdmin:       false,
  },
  {
    value:              'accountant',
    label:              'Accountant',
    description:        'Payments, refunds & financial reports',
    fullDescription:    'Finance access only. Manages payments, refunds, invoices and revenue reports. Cannot modify bookings or visa files.',
    managerDescription: 'Payments, refunds, financial reports only',
    badgeClass:         'bg-rose-100 text-rose-700',
    dotClass:           'bg-rose-500',
    solidClass:         'bg-rose-600',
    hexColor:           '#DC2626',
    isSuperAdmin:       false,
  },
  {
    value:              'customer_support',
    label:              'Customer Support',
    description:        'Tickets, client profiles & booking status',
    fullDescription:    'Support access only. Manages support tickets, client profiles and booking status updates. Cannot issue refunds or access financial data.',
    managerDescription: 'Tickets, client profiles, booking status, Jade AI',
    badgeClass:         'bg-slate-100 text-slate-700',
    dotClass:           'bg-slate-500',
    solidClass:         'bg-slate-600',
    hexColor:           '#4B5563',
    isSuperAdmin:       false,
  },
]

/** Full catalogue, super_admin first — matches the order Staff creation shows
 *  roles to a super_admin caller ([superAdminEntry, ...STAFF_ROLES]). */
export const ROLE_CATALOG: RoleCatalogEntry[] = [SUPER_ADMIN_ENTRY, ...STAFF_CATALOG]

export const ROLE_CATALOG_MAP: Record<string, RoleCatalogEntry> = Object.fromEntries(
  ROLE_CATALOG.map(r => [r.value, r]),
)

/** Non-super_admin roles, in Staff-page dropdown order. */
export const ASSIGNABLE_STAFF_ROLES: RoleCatalogEntry[] = STAFF_CATALOG

export const SUPER_ADMIN_ROLE: RoleCatalogEntry = SUPER_ADMIN_ENTRY

/** All 13 role values, including super_admin. */
export const ALL_ROLE_VALUES: RbacRole[] = ROLE_CATALOG.map(r => r.value)

/** The 12 roles that must have a RolePermission DB row before they're assignable. */
export const NON_SUPER_ADMIN_ROLE_VALUES: RbacRole[] = STAFF_CATALOG.map(r => r.value)

/** Role Manager (app/admin/roles/page.tsx) list order — historically distinct
 *  from the Staff dropdown order above; kept as its own array so consolidating
 *  the catalogue doesn't reorder that page's role list. */
export const ROLE_MANAGER_ORDER: RbacRole[] = [
  'super_admin', 'operations_manager', 'general_manager', 'senior_manager',
  'visa_officer', 'coordinator', 'flight_staff', 'tours_staff', 'hotel_staff',
  'sales_agent', 'accountant', 'customer_support', 'sales_rep',
]

export function getRoleCatalogEntry(role: string): RoleCatalogEntry | undefined {
  return ROLE_CATALOG_MAP[role]
}

/**
 * THE CORE GUARD — refuses to let a role with no `RolePermission` row be
 * assigned to a Staff record. super_admin is exempt (never has/needs a row;
 * getAdminSession() always resolves it to full access regardless).
 *
 * Without this, a role can be picked in the Staff creation/edit UI, saved
 * successfully, and silently resolve to EMPTY_PERMISSIONS at login — exactly
 * the failure mode that took `coordinator` and `sales_rep` staff out of the
 * Inbox in production. Do NOT weaken this to a warning; it must block.
 *
 * Takes a lookup callback (rather than a typed Prisma client) so callers can
 * pass `r => prisma.rolePermission.findUnique({ where: { role: r } })`
 * directly, and tests can mock it trivially without reproducing Prisma's
 * generated delegate types.
 */
export async function requireConfiguredRole(
  findRolePermission: (role: string) => Promise<unknown>,
  role: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (role === 'super_admin') return { ok: true }
  const row = await findRolePermission(role)
  if (!row) {
    return {
      ok: false,
      error: `Role '${role}' has no permission profile yet. Configure it in Settings → Roles before assigning it to staff.`,
    }
  }
  return { ok: true }
}
