'use client'

/**
 * Walz Team Hub V1 — resolves the signed-in staff member's own identity
 * (id/name/email) for message-ownership checks (edit/delete own message)
 * and the composer's "sent by me" bookkeeping. Reuses the existing
 * GET /api/admin/me endpoint (already used by useStaffPermissions and the
 * Inbox page for the exact same "who am I" purpose) — `id` there is
 * Staff.id, the same id lib/team/authz.ts's currentStaffId() resolves
 * server-side, so authorId comparisons on the client line up exactly.
 */
import { useEffect, useState } from 'react'
import { teamFetch, isSessionExpiredError } from '../lib/teamFetch'
import type { CurrentStaff } from '../types'

export interface UseCurrentStaffResult {
  staff: CurrentStaff | null
  loading: boolean
  error: string | null
}

export function useCurrentStaff(): UseCurrentStaffResult {
  const [staff, setStaff] = useState<CurrentStaff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await teamFetch('/api/admin/me')
        if (!res.ok) throw new Error('Could not load your profile.')
        const data = (await res.json()) as { id?: string; name?: string; email?: string }
        if (cancelled) return
        if (!data.id || !data.email) throw new Error('Could not load your profile.')
        setStaff({ id: data.id, name: data.name ?? data.email, email: data.email })
      } catch (e) {
        if (cancelled || isSessionExpiredError(e)) return
        setError(e instanceof Error ? e.message : 'Could not load your profile.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return { staff, loading, error }
}
