/**
 * Single source of truth for all permissions in the Walz admin system.
 *
 * Rule: every new feature gets a permission key added here.
 * The role manager reads from this registry so new keys auto-appear.
 * Use can(session, 'key') in every page/API route to gate access.
 */

export const PERMISSION_REGISTRY = {
  // DASHBOARD
  dashboard_view:       { label: 'View Dashboard',           section: 'Dashboard',              desc: 'Access the admin dashboard home' },
  dashboard_stats_all:  { label: 'All Dashboard Stats',      section: 'Dashboard',              desc: 'See org-wide summary stats, not just own' },

  // CLIENTS & LEADS
  clients_view:         { label: 'View Clients',             section: 'Clients & Leads',        desc: 'See client list and profiles' },
  clients_create:       { label: 'Create Clients',           section: 'Clients & Leads',        desc: 'Add new client records' },
  clients_edit:         { label: 'Edit Clients',             section: 'Clients & Leads',        desc: 'Update client details' },
  clients_delete:       { label: 'Delete Clients',           section: 'Clients & Leads',        desc: 'Permanently remove client records' },
  leads_view:           { label: 'View Leads',               section: 'Clients & Leads',        desc: 'See leads and enquiry list' },
  leads_manage:         { label: 'Manage Leads',             section: 'Clients & Leads',        desc: 'Assign, update, and convert leads' },

  // BOOKINGS
  bookings_view:        { label: 'View Bookings',            section: 'Bookings',               desc: 'See own bookings and details' },
  bookings_view_all:    { label: 'View All Bookings',        section: 'Bookings',               desc: "View all staff members' bookings" },
  bookings_create:      { label: 'Create Bookings',          section: 'Bookings',               desc: 'Make new flight, hotel, or tour bookings' },
  bookings_edit:        { label: 'Edit Bookings',            section: 'Bookings',               desc: 'Modify existing booking details' },
  bookings_cancel:      { label: 'Cancel Bookings',          section: 'Bookings',               desc: 'Cancel bookings and initiate voids' },
  bookings_delete:      { label: 'Delete Bookings',          section: 'Bookings',               desc: 'Permanently remove booking records' },

  // FLIGHTS & TRIPS
  flights_search:       { label: 'Search Flights',           section: 'Flights & Trips',        desc: 'Search and price flights' },
  flight_deals_view:    { label: 'View Flight Deals',        section: 'Flights & Trips',        desc: 'See promoted flight deals and specials' },
  ticket_generator:     { label: 'Ticket Generator',         section: 'Flights & Trips',        desc: 'Generate flight itinerary PDFs' },
  itinerary_planner:    { label: 'Itinerary Planner',        section: 'Flights & Trips',        desc: 'Build full trip itineraries' },
  trip_requests:        { label: 'Trip Requests',            section: 'Flights & Trips',        desc: 'Send and receive client trip intake forms' },
  transfers_view:       { label: 'Transfers',                section: 'Flights & Trips',        desc: 'View and manage airport transfers' },
  trips_view:           { label: 'View Trips',               section: 'Flights & Trips',        desc: 'See trip planner records' },
  trips_view_all:       { label: 'View All Trips',           section: 'Flights & Trips',        desc: "View all staff members' trips" },
  trips_create:         { label: 'Create Trips',             section: 'Flights & Trips',        desc: 'Create new trip plans' },
  trips_edit:           { label: 'Edit Trips',               section: 'Flights & Trips',        desc: 'Modify trip details' },
  trips_delete:         { label: 'Delete Trips',             section: 'Flights & Trips',        desc: 'Remove trip records' },
  trips_assign:         { label: 'Assign Trips',             section: 'Flights & Trips',        desc: 'Assign trips to other staff' },
  trips_proposals:      { label: 'Trip Proposals',           section: 'Flights & Trips',        desc: 'Create and send trip proposals to clients' },
  jade_miles_view:      { label: 'View Jade Miles',          section: 'Flights & Trips',        desc: 'See Jade Miles loyalty programme data' },

  // VISA SERVICES
  visa_view:            { label: 'View Visa Apps',           section: 'Visa Services',          desc: 'See visa application list' },
  visa_view_all:        { label: 'View All Visa Apps',       section: 'Visa Services',          desc: "View all staff members' visa applications" },
  visa_own:             { label: 'View Own Visa Apps',       section: 'Visa Services',          desc: 'View only personally assigned visa applications' },
  visa_create:          { label: 'Create Visa Apps',         section: 'Visa Services',          desc: 'Submit new visa applications' },
  visa_edit:            { label: 'Edit Visa Apps',           section: 'Visa Services',          desc: 'Update visa application details' },
  visa_approve:         { label: 'Approve Visa Apps',        section: 'Visa Services',          desc: 'Change visa status and make approval decisions' },
  visa_delete:          { label: 'Delete Visa Apps',         section: 'Visa Services',          desc: 'Remove visa application records' },
  visa_send_form:       { label: 'Send Visa Forms',          section: 'Visa Services',          desc: 'Send application forms to clients' },
  visa_form_tracker:    { label: 'Form Tracker',             section: 'Visa Services',          desc: 'Track client form completion status' },
  visa_bank_analyser:   { label: 'VisaFortress AI',          section: 'Visa Services',          desc: 'AI bank statement analyser for visa apps' },
  visa_intelligence:    { label: 'Visa Intelligence',        section: 'Visa Services',          desc: 'AI-powered visa document and risk analysis' },
  applications_view:         { label: 'View Own Applications',  section: 'Visa Services',      desc: 'See personally submitted applications' },
  applications_view_all:     { label: 'View All Applications',  section: 'Visa Services',      desc: "View all staff members' applications" },
  applications_create:       { label: 'Create Applications',    section: 'Visa Services',      desc: 'Submit new applications' },
  applications_edit:         { label: 'Edit Applications',      section: 'Visa Services',      desc: 'Modify application details' },
  applications_delete:       { label: 'Delete Applications',    section: 'Visa Services',      desc: 'Remove application records' },
  applications_assign:       { label: 'Assign Applications',    section: 'Visa Services',      desc: 'Assign applications to other staff' },
  applications_approve:      { label: 'Approve Applications',   section: 'Visa Services',      desc: 'Approve or reject applications' },

  // FINANCE
  payments_view:        { label: 'View Payments',            section: 'Finance',                desc: 'See payment records and statuses' },
  payments_view_all:    { label: 'View All Payments',        section: 'Finance',                desc: 'View full payment history across all staff' },
  payments_create:      { label: 'Create Payment Links',     section: 'Finance',                desc: 'Generate Stripe, Flutterwave, and VA payment links' },
  payments_manage:      { label: 'Manage Payments',          section: 'Finance',                desc: 'Verify transactions and manually mark as paid' },
  payments_edit:        { label: 'Edit Payments',            section: 'Finance',                desc: 'Update payment reference and details' },
  payments_refund:      { label: 'Process Refunds',          section: 'Finance',                desc: 'Issue full and partial refunds' },
  payments_delete:      { label: 'Delete Payments',          section: 'Finance',                desc: 'Remove payment records' },
  accounting_view:      { label: 'View Accounting',          section: 'Finance',                desc: 'Access the transaction ledger and accounting page' },
  accounting_export:    { label: 'Export Transactions',      section: 'Finance',                desc: 'Download transaction data as CSV' },
  invoices_view:        { label: 'View Invoices',            section: 'Finance',                desc: 'See invoice list and details' },
  invoices_create:      { label: 'Create Invoices',          section: 'Finance',                desc: 'Generate new invoices' },
  invoices_send:        { label: 'Send Invoices',            section: 'Finance',                desc: 'Email invoices to clients' },
  payroll_view:         { label: 'View Payroll',             section: 'Finance',                desc: 'See staff payroll records' },
  payroll_run:          { label: 'Run Payroll',              section: 'Finance',                desc: 'Process and approve payroll runs' },
  reports_view:         { label: 'View Own Reports',         section: 'Finance',                desc: 'Access own report submissions' },
  reports_submit:       { label: 'Submit Reports',           section: 'Finance',                desc: 'Submit new reports for review' },
  reports_all:          { label: 'View All Reports',         section: 'Finance',                desc: "View all staff members' reports" },
  reports_revenue:      { label: 'Revenue Reports',          section: 'Finance',                desc: 'See revenue, P&L, and financial summaries' },
  reports_staff:        { label: 'Staff Reports',            section: 'Finance',                desc: 'View staff performance and activity reports' },
  reports_export:       { label: 'Export Reports',           section: 'Finance',                desc: 'Download report data' },

  // CONTENT & MARKETING
  destinations_view:    { label: 'View Destinations',        section: 'Content & Marketing',    desc: 'See destination pages and content' },
  destinations_edit:    { label: 'Edit Destinations',        section: 'Content & Marketing',    desc: 'Update destination page content' },
  hotel_promos_view:    { label: 'View Hotel Promos',        section: 'Content & Marketing',    desc: 'See hotel promotional listings' },
  hotel_promos_edit:    { label: 'Edit Hotel Promos',        section: 'Content & Marketing',    desc: 'Update hotel promotional content' },
  flight_extras_view:   { label: 'View Flight Extras',       section: 'Content & Marketing',    desc: 'See flight extras and add-on content' },
  cms_view:             { label: 'View CMS',                 section: 'Content & Marketing',    desc: 'Access website content management' },
  cms_edit:             { label: 'Edit CMS Content',         section: 'Content & Marketing',    desc: 'Update homepage, testimonials, slides' },
  cms_publish:          { label: 'Publish CMS',              section: 'Content & Marketing',    desc: 'Publish content changes to live site' },

  // INBOX & COMMUNICATIONS
  inbox_view:               { label: 'View Inbox',           section: 'Inbox & Communications', desc: 'Read incoming client messages' },
  inbox_reply:              { label: 'Reply to Messages',    section: 'Inbox & Communications', desc: 'Send replies to clients' },
  inbox_assign:             { label: 'Assign Messages',      section: 'Inbox & Communications', desc: 'Assign conversations to other staff' },
  inbox_delete:             { label: 'Delete Messages',      section: 'Inbox & Communications', desc: 'Delete inbox threads' },
  notifications_view:       { label: 'View Notifications',   section: 'Inbox & Communications', desc: 'See system notifications' },
  notifications_send:       { label: 'Send Notifications',   section: 'Inbox & Communications', desc: 'Send notifications to staff or clients' },
  notifications_broadcast:  { label: 'Broadcast Notifications', section: 'Inbox & Communications', desc: 'Send mass notifications to all staff' },

  // STAFF MANAGEMENT
  staff_view:           { label: 'View Staff',               section: 'Staff Management',       desc: 'See staff list and profiles' },
  staff_create:         { label: 'Create Staff',             section: 'Staff Management',       desc: 'Add new staff accounts' },
  staff_edit:           { label: 'Edit Staff',               section: 'Staff Management',       desc: 'Update staff details and roles' },
  staff_delete:         { label: 'Delete Staff',             section: 'Staff Management',       desc: 'Deactivate or remove staff accounts' },
  staff_manage_roles:   { label: 'Manage Staff Roles',       section: 'Staff Management',       desc: 'Change role assignments for staff members' },

  // APPLICATIONS (duplicate of visa above — kept for backward compat)

  // ADMINISTRATION
  roles_view:               { label: 'View Role Manager',    section: 'Administration',         desc: 'View role permissions and settings' },
  roles_manage:             { label: 'Manage Role Permissions', section: 'Administration',      desc: 'Edit default permissions for each role' },
  roles_assign:             { label: 'Assign Roles',         section: 'Administration',         desc: 'Change the role assigned to a staff member' },
  settings_view:            { label: 'View Settings',        section: 'Administration',         desc: 'Access system settings pages' },
  settings_edit:            { label: 'Edit Settings',        section: 'Administration',         desc: 'Modify system configuration' },
  settings_roles:           { label: 'Manage Integrations Config', section: 'Administration',   desc: 'Configure role-linked settings' },
  settings_integrations:    { label: 'Manage Integrations',  section: 'Administration',         desc: 'Connect and configure third-party integrations' },
} as const

export type Permission = keyof typeof PERMISSION_REGISTRY

export const PERMISSION_SECTIONS = [
  'Dashboard',
  'Clients & Leads',
  'Bookings',
  'Flights & Trips',
  'Visa Services',
  'Finance',
  'Content & Marketing',
  'Inbox & Communications',
  'Staff Management',
  'Administration',
] as const

export function getPermissionsBySection(): Record<string, Array<{ key: string; label: string; desc: string }>> {
  const grouped: Record<string, Array<{ key: string; label: string; desc: string }>> = {}
  for (const [key, val] of Object.entries(PERMISSION_REGISTRY)) {
    if (!grouped[val.section]) grouped[val.section] = []
    grouped[val.section].push({ key, label: val.label, desc: val.desc })
  }
  return grouped
}

/**
 * Check a permission — super_admin bypasses all gates unconditionally.
 * Use this in API routes and server components.
 *
 * @example
 *   import { can } from '@/lib/permissions-registry'
 *   if (!can(session, 'accounting_view')) return 403
 */
export function can(session: { role?: string | null; permissions?: Record<string, boolean> | null } | null, permission: string): boolean {
  if (!session) return false
  if (session.role === 'super_admin') return true
  return session.permissions?.[permission] === true
}
