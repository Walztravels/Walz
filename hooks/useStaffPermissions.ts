'use client'

/**
 * useStaffPermissions — React hook for client-side RBAC.
 *
 * Fetches the current admin's merged permissions from /api/admin/me.
 * Components use `can(key)` to conditionally render buttons/sections.
 *
 * Usage:
 *   const { can, role, loading } = useStaffPermissions()
 *   {can('staff_create') && <Button>Add Staff</Button>}
 */

import { useState, useEffect, useCallback } from 'react'
import type { PermissionKey, Permissions } from '@/lib/permissions'
import { EMPTY_PERMISSIONS } from '@/lib/permissions'

export interface StaffProfile {
  id:        string
  name:      string
  email:     string
  role:      string
  roleTitle: string
  roleLabel: string
  roleColor: string
  roleBadge: string
  permissions: Permissions
}

interface UseStaffPermissionsReturn {
  profile:    StaffProfile | null
  role:       string | null
  roleLabel:  string | null
  roleBadge:  string | null
  permissions: Permissions
  can:        (key: PermissionKey) => boolean
  canAll:     (keys: PermissionKey[]) => boolean
  canAny:     (keys: PermissionKey[]) => boolean
  loading:    boolean
  error:      string | null
  refresh:    () => void
}

let _cachedProfile: StaffProfile | null = null
const _listeners: Array<() => void> = []

function notifyListeners() {
  _listeners.forEach((fn) => fn())
}

export function useStaffPermissions(): UseStaffPermissionsReturn {
  const [profile, setProfile] = useState<StaffProfile | null>(_cachedProfile)
  const [loading, setLoading] = useState(!_cachedProfile)
  const [error,   setError]   = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    // Show cached data immediately (no loading flash on re-mount).
    // Only show the spinner on the very first load.
    if (!_cachedProfile) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/me', { credentials: 'include' })
      if (!res.ok) {
        setError('Could not load permissions')
        setProfile(null)
        _cachedProfile = null
        return
      }
      const data: StaffProfile & { permissions: Permissions } = await res.json()
      _cachedProfile = data
      setProfile(data)
      notifyListeners()
    } catch {
      setError('Network error loading permissions')
    } finally {
      setLoading(false)
    }
  }, [])

  // Subscribe to cache updates from other hook instances on this page
  useEffect(() => {
    const handler = () => { if (_cachedProfile) setProfile(_cachedProfile) }
    _listeners.push(handler)
    return () => {
      const idx = _listeners.indexOf(handler)
      if (idx !== -1) _listeners.splice(idx, 1)
    }
  }, [])

  // Always re-fetch on mount so role changes take effect on next page navigation
  // without requiring a full browser reload.
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const perms = profile?.permissions ?? EMPTY_PERMISSIONS
  const isSuperAdmin = profile?.role === 'super_admin'

  return {
    profile,
    role:       profile?.role      ?? null,
    roleLabel:  profile?.roleLabel ?? null,
    roleBadge:  profile?.roleBadge ?? null,
    permissions: perms,
    can:    (key)  => isSuperAdmin || perms[key] === true,
    canAll: (keys) => isSuperAdmin || keys.every((k) => perms[k] === true),
    canAny: (keys) => isSuperAdmin || keys.some((k)  => perms[k] === true),
    loading,
    error,
    refresh: fetchProfile,
  }
}
