/**
 * RBAC Configuration Integrity — role catalogue + assignment-time guard.
 *
 * Before this change, four independent, drifting copies of the 13-role
 * list existed, and the Staff creation/update API could save a role with
 * no `RolePermission` row at all — which silently resolves to
 * EMPTY_PERMISSIONS at login (lib/admin-auth.ts's getAdminSession()). That
 * exact gap took `coordinator` and `sales_rep` out of the Inbox in
 * production. These tests pin:
 *   1. the single role catalogue is internally consistent
 *   2. the Staff API refuses to assign a role with no RolePermission row
 *   3. the Staff API allows a role that already has one
 *   4. super_admin is exempt from the check (it never needs a row)
 */

import {
  ROLE_CATALOG, ROLE_CATALOG_MAP, ASSIGNABLE_STAFF_ROLES, ALL_ROLE_VALUES,
  NON_SUPER_ADMIN_ROLE_VALUES, SUPER_ADMIN_ROLE, requireConfiguredRole,
} from '@/lib/rbac/roles'

// ── 1. Catalogue consistency ──────────────────────────────────────────────────

describe('role catalogue', () => {
  it('has exactly 13 roles, one of which is super_admin', () => {
    expect(ROLE_CATALOG).toHaveLength(13)
    expect(ALL_ROLE_VALUES).toHaveLength(13)
    expect(ALL_ROLE_VALUES).toContain('super_admin')
  })

  it('every non-super_admin role has a non-empty label, description and fullDescription', () => {
    expect(ASSIGNABLE_STAFF_ROLES.length).toBe(12)
    for (const role of ASSIGNABLE_STAFF_ROLES) {
      expect(role.isSuperAdmin).toBe(false)
      expect(role.label.length).toBeGreaterThan(0)
      expect(role.description.length).toBeGreaterThan(0)
      expect(role.fullDescription.length).toBeGreaterThan(0)
      expect(role.managerDescription.length).toBeGreaterThan(0)
      expect(role.badgeClass).toMatch(/^bg-\S+ text-\S+$/)
      expect(role.dotClass).toMatch(/^bg-\S+$/)
      expect(role.solidClass).toMatch(/^bg-\S+$/)
      expect(role.hexColor).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('super_admin is flagged specially and present exactly once', () => {
    expect(SUPER_ADMIN_ROLE.isSuperAdmin).toBe(true)
    expect(ROLE_CATALOG.filter(r => r.isSuperAdmin)).toHaveLength(1)
    expect(NON_SUPER_ADMIN_ROLE_VALUES).not.toContain('super_admin')
  })

  it('every catalogue value is unique and every lookup round-trips', () => {
    const values = ROLE_CATALOG.map(r => r.value)
    expect(new Set(values).size).toBe(values.length)
    for (const v of values) {
      expect(ROLE_CATALOG_MAP[v]?.value).toBe(v)
    }
  })

  it('includes the two roles the business owner manually corrected in production, untouched by this catalogue', () => {
    // This catalogue only carries display metadata (label/description/color) —
    // it must never carry or imply permission values for coordinator/sales_rep.
    for (const v of ['coordinator', 'sales_rep']) {
      const entry = ROLE_CATALOG_MAP[v]
      expect(entry).toBeDefined()
      expect(entry).not.toHaveProperty('permissions')
    }
  })
})

// ── 2-4. requireConfiguredRole() — the pure guard function ────────────────────

describe('requireConfiguredRole', () => {
  it('super_admin is always exempt — never queries the lookup', async () => {
    const lookup = jest.fn()
    const result = await requireConfiguredRole(lookup, 'super_admin')
    expect(result).toEqual({ ok: true })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('rejects a role with no RolePermission row', async () => {
    const lookup = jest.fn().mockResolvedValue(null)
    const result = await requireConfiguredRole(lookup, 'visa_officer')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("'visa_officer'")
      expect(result.error).toContain('Settings → Roles')
    }
    expect(lookup).toHaveBeenCalledWith('visa_officer')
  })

  it('allows a role that has a RolePermission row', async () => {
    const lookup = jest.fn().mockResolvedValue({ role: 'sales_rep' })
    const result = await requireConfiguredRole(lookup, 'sales_rep')
    expect(result).toEqual({ ok: true })
  })
})

// ── 2-4 again, at the route level — the real server-side enforcement ──────────

let session: { email: string; staffRole: string } | null = {
  email: 'owner@walztravels.com', staffRole: 'super_admin',
}
jest.mock('@/lib/admin-auth', () => ({
  getAdminSession: jest.fn(async () => session),
  invalidateAdminSessionCache: jest.fn(),
}))

const mockRolePermissionFindUnique = jest.fn()
const mockStaffFindUnique = jest.fn()
const mockStaffCreate = jest.fn()
const mockStaffUpdate = jest.fn()
const mockActivityLogCreate = jest.fn().mockResolvedValue({})

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    rolePermission: { findUnique: (...a: unknown[]) => mockRolePermissionFindUnique(...a) },
    staff: {
      findUnique: (...a: unknown[]) => mockStaffFindUnique(...a),
      create:     (...a: unknown[]) => mockStaffCreate(...a),
      update:     (...a: unknown[]) => mockStaffUpdate(...a),
    },
    activityLog: { create: (...a: unknown[]) => mockActivityLogCreate(...a) },
  },
}))

import { POST as createStaff } from '@/app/api/admin/staff/route'
import { PUT as updateStaff } from '@/app/api/admin/staff/[id]/route'
import type { NextRequest } from 'next/server'

const post = (body: unknown) => createStaff(new Request('http://x/api/admin/staff', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}) as unknown as NextRequest)

const put = (id: string, body: unknown) => updateStaff(
  new Request(`http://x/api/admin/staff/${id}`, {
    method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  }) as unknown as NextRequest,
  { params: { id } },
)

beforeEach(() => {
  session = { email: 'owner@walztravels.com', staffRole: 'super_admin' }
  mockRolePermissionFindUnique.mockReset()
  mockStaffFindUnique.mockReset().mockResolvedValue(null) // "no existing staff with this email" for POST's dedupe check
  mockStaffCreate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'staff_new', name: data.name, email: data.email, roleTitle: data.roleTitle,
    role: data.role, portalAccess: data.portalAccess, isActive: true, createdAt: new Date().toISOString(),
  }))
  mockStaffUpdate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'staff_existing', name: 'Existing Person', email: 'existing@walztravels.com', roleTitle: 'Consultant',
    role: data.role, portalAccess: false, isActive: true, lastLoginAt: null, createdAt: new Date().toISOString(),
  }))
  mockActivityLogCreate.mockClear()
})

describe('POST /api/admin/staff — assignment-time RolePermission guard', () => {
  const newStaffBody = (role: string) => ({
    name: 'New Hire', email: 'new.hire@walztravels.com', roleTitle: 'Consultant',
    role, portalAccess: false, password: 'password123',
  })

  it('rejects creating staff with a role that has no RolePermission row (visa_officer)', async () => {
    mockRolePermissionFindUnique.mockResolvedValue(null)
    const res  = await post(newStaffBody('visa_officer'))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toContain("'visa_officer'")
    expect(data.error).toContain('Settings → Roles')
    expect(mockStaffCreate).not.toHaveBeenCalled()
  })

  it('allows creating staff with a role that already has a RolePermission row (sales_rep)', async () => {
    // Mocked as already-configured — this test does not assume or assert the
    // actual production permission values for sales_rep, only that a row exists.
    mockRolePermissionFindUnique.mockResolvedValue({ role: 'sales_rep' })
    const res  = await post(newStaffBody('sales_rep'))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.staff.role).toBe('sales_rep')
    expect(mockStaffCreate).toHaveBeenCalledTimes(1)
  })

  it('super_admin is exempt from the RolePermission check', async () => {
    const res  = await post(newStaffBody('super_admin'))
    expect(res.status).toBe(201)
    expect(mockRolePermissionFindUnique).not.toHaveBeenCalled()
    expect(mockStaffCreate).toHaveBeenCalledTimes(1)
  })

  it('still rejects a role the catalogue does not recognise at all, before ever touching RolePermission', async () => {
    const res  = await post(newStaffBody('warehouse_manager'))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('Invalid role')
    expect(mockRolePermissionFindUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/staff/[id] — assignment-time RolePermission guard', () => {
  beforeEach(() => {
    mockStaffFindUnique.mockResolvedValue({ id: 'staff_existing', role: 'coordinator' })
  })

  it('rejects re-assigning a staff member to a role with no RolePermission row (visa_officer)', async () => {
    mockRolePermissionFindUnique.mockResolvedValue(null)
    const res  = await put('staff_existing', { role: 'visa_officer' })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toContain("'visa_officer'")
    expect(mockStaffUpdate).not.toHaveBeenCalled()
  })

  it('allows re-assigning a staff member to a role that already has a RolePermission row (sales_rep)', async () => {
    mockRolePermissionFindUnique.mockResolvedValue({ role: 'sales_rep' })
    const res  = await put('staff_existing', { role: 'sales_rep' })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.staff.role).toBe('sales_rep')
    expect(mockStaffUpdate).toHaveBeenCalledTimes(1)
  })

  it('super_admin is exempt from the RolePermission check on update too', async () => {
    const res = await put('staff_existing', { role: 'super_admin' })
    expect(res.status).toBe(200)
    expect(mockRolePermissionFindUnique).not.toHaveBeenCalled()
  })

  it('does not query RolePermission at all when the update omits role', async () => {
    const res = await put('staff_existing', { name: 'Renamed Person' })
    expect(res.status).toBe(200)
    expect(mockRolePermissionFindUnique).not.toHaveBeenCalled()
    expect(mockStaffUpdate).toHaveBeenCalledTimes(1)
  })
})
