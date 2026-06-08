/**
 * Server-side helper: fetch merged permissions for a staff member.
 *
 * Merges RolePermission defaults + Staff.permissions overrides.
 * Result is cached in memory for the duration of the request via a simple
 * module-level Map (cleared between cold starts / deploys).
 *
 * Usage (server component / API route):
 *   const perms = await getStaffPermissions(staffId)
 *   if (!can(perms, 'staff_view')) redirect('/admin/unauthorized')
 */

import { prisma } from '@/lib/db'
import {
  mergePermissions,
  EMPTY_PERMISSIONS,
  type Permissions,
  type Role,
} from '@/lib/permissions'

/** In-request cache so we don't hit the DB twice per render */
const _cache = new Map<string, Permissions>()

export async function getStaffPermissions(staffId: string): Promise<Permissions> {
  if (_cache.has(staffId)) return _cache.get(staffId)!

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { role: true, permissions: true },
  })

  if (!staff) return EMPTY_PERMISSIONS

  const roleRecord = await prisma.rolePermission.findUnique({
    where: { role: staff.role },
    select: { permissions: true },
  })

  const roleDefaults  = (roleRecord?.permissions ?? {}) as Partial<Permissions>
  const staffOverride = (staff.permissions ?? {}) as Partial<Permissions>

  const merged = mergePermissions(roleDefaults, staffOverride)
  _cache.set(staffId, merged)
  return merged
}

/**
 * Convenience: get permissions from a staff email (used in API routes
 * where we have the email from the JWT but not the DB id).
 */
export async function getStaffPermissionsByEmail(email: string): Promise<Permissions & { staffId: string | null; role: string | null }> {
  const staff = await prisma.staff.findUnique({
    where: { email },
    select: { id: true, role: true, permissions: true },
  })

  if (!staff) return { ...EMPTY_PERMISSIONS, staffId: null, role: null }

  const roleRecord = await prisma.rolePermission.findUnique({
    where: { role: staff.role },
    select: { permissions: true },
  })

  const roleDefaults  = (roleRecord?.permissions ?? {}) as Partial<Permissions>
  const staffOverride = (staff.permissions ?? {}) as Partial<Permissions>

  const merged = mergePermissions(roleDefaults, staffOverride)
  _cache.set(staff.id, merged)

  return { ...merged, staffId: staff.id, role: staff.role }
}

/** Clear the in-request cache (useful in tests) */
export function clearPermissionsCache() {
  _cache.clear()
}
