/**
 * Admin session pool-starvation fix (incident 2026-09-09).
 *
 * Production logs showed prisma.staff.update() (the lastActiveAt touch,
 * fired on EVERY admin API call against the same Staff row) dying on
 * Postgres 57014 statement timeouts while pinning pooled connections,
 * starving all other admin queries into P2024 20-second pool timeouts —
 * including login. These assertions pin the shape of the fix.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('getAdminSession pool behaviour', () => {
  const src = read('lib/admin-auth.ts')

  it('caches the session per lambda (60s) so API bursts skip the DB', () => {
    expect(src).toContain('SESSION_CACHE_MS = 60 * 1000')
    expect(src).toContain('sessionCache.get(cacheKey)')
    // Both session shapes are cached
    expect(src.match(/sessionCache\.set\(/g)?.length).toBe(2)
    // A missing/invalid token or inactive staff is never cached
    expect(src).not.toMatch(/sessionCache\.set\([^)]*null/)
    expect(src).toContain('export function invalidateAdminSessionCache')
  })

  it('lastActiveAt touch is throttled per lambda and is one conditional UPDATE — no pre-read', () => {
    expect(src).toContain('LAST_ACTIVE_THROTTLE_MS = 2 * 60 * 1000')
    expect(src).toContain('lastActiveTouchAt.get(staff.id)')
    expect(src).toContain('UPDATE "Staff" SET "lastActiveAt" = NOW()')
    expect(src).toContain(`"lastActiveAt" < NOW() - interval '2 minutes'`)
    // The old read-then-update pattern is gone
    expect(src).not.toMatch(/select:\s*\{\s*lastActiveAt:\s*true\s*\}/)
    expect(src).not.toMatch(/data:\s*\{\s*lastActiveAt:\s*new Date\(\)\s*\}/)
  })

  it('login runs its three audit writes in parallel, not as sequential awaits', () => {
    const login = read('app/api/admin/auth/login/route.ts')
    expect(login).toContain('await Promise.allSettled([')
    expect(login).toContain('lastLoginAt: new Date()')
    expect(login).toContain('staffLoginLog.create')
    expect(login).toContain("action:    'Staff Login'")
  })

  it('staff edits invalidate the session cache immediately on this instance', () => {
    expect(read('app/api/admin/staff/[id]/route.ts')).toContain('invalidateAdminSessionCache(staff.email)')
    expect(read('app/api/admin/staff/[id]/permissions/route.ts')).toContain('invalidateAdminSessionCache(staff.email)')
  })
})
