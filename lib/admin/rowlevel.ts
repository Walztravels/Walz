import { canSeeAllRecords } from './permissions'

interface StaffCtx {
  id:          string
  role:        string
  permissions: unknown
  branch:      string
}

/** Prisma where-clause fragment for clients / portal applications */
export function clientsFilter(staff: StaffCtx) {
  const filter: Record<string, unknown> = {}

  if (staff.role !== 'super_admin') {
    filter.branch = staff.branch
  }

  if (!canSeeAllRecords(staff, 'clients')) {
    filter.assignedToId = staff.id
  }

  return filter
}

/** Prisma where-clause fragment for leads */
export function leadsFilter(staff: StaffCtx) {
  const filter: Record<string, unknown> = {}

  if (staff.role !== 'super_admin') {
    filter.branch = staff.branch
  }

  if (!canSeeAllRecords(staff, 'leads')) {
    filter.assignedToId = staff.id
  }

  return filter
}

/** Prisma where-clause fragment for bookings */
export function bookingsFilter(staff: StaffCtx) {
  const filter: Record<string, unknown> = {}

  if (staff.role !== 'super_admin') {
    filter.branch = staff.branch
  }

  if (!canSeeAllRecords(staff, 'bookings')) {
    filter.createdByStaffId = staff.id
  }

  return filter
}
