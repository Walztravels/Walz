/**
 * Server-side helper: fetch merged permissions for a staff member.
 *
 * Merges RolePermission defaults + Staff.permissions overrides.
 * No module-level cache — always reads fresh from DB so that role
 * permission changes take effect on the very next request.
 */

import { prisma } from '@/lib/db'
import {
  mergePermissions,
  EMPTY_PERMISSIONS,
  type Permissions,
} from '@/lib/permissions'

export async function getStaffPermissions(staffId: string): Promise<Permissions> {
  const staff = await prisma.staff.findUnique({
    where:  { id: staffId },
    select: { role: true, permissions: true },
  })

  if (!staff) return EMPTY_PERMISSIONS

  const [roleRecord] = await Promise.all([
    prisma.rolePermission.findUnique({
      where:  { role: staff.role },
      select: { permissions: true },
    }),
  ])

  const roleDefaults  = (roleRecord?.permissions ?? {}) as Partial<Permissions>
  const staffOverride = (staff.permissions       ?? {}) as Partial<Permissions>

  return mergePermissions(roleDefaults, staffOverride)
}

/**
 * Convenience: resolve permissions from email.
 * Used in API routes where the email comes from the JWT claim.
 */
export async function getStaffPermissionsByEmail(
  email: string,
): Promise<Permissions & { staffId: string | null; role: string | null }> {
  const staff = await prisma.staff.findUnique({
    where:  { email },
    select: { id: true, role: true, permissions: true },
  })

  if (!staff) return { ...EMPTY_PERMISSIONS, staffId: null, role: null }

  const roleRecord = await prisma.rolePermission.findUnique({
    where:  { role: staff.role },
    select: { permissions: true },
  })

  const roleDefaults  = (roleRecord?.permissions ?? {}) as Partial<Permissions>
  const staffOverride = (staff.permissions       ?? {}) as Partial<Permissions>

  const merged = mergePermissions(roleDefaults, staffOverride)
  return { ...merged, staffId: staff.id, role: staff.role }
}

/** No-op kept for call-site backward compatibility */
export function clearPermissionsCache() {}
