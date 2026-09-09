import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { mergePermissions } from '@/lib/permissions'

const COOKIE_NAME = 'admin_token'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_ADMIN_SECRET
  if (!secret) {
    throw new Error(
      '[FATAL] JWT_ADMIN_SECRET environment variable is not set. ' +
      'Set it in your .env file or Vercel environment variables.'
    )
  }
  return new TextEncoder().encode(secret)
}

/** Minimal payload stored in the JWT (kept small for cookie size) */
interface JwtClaims {
  email:     string
  role:      'admin'    // kept for backward compat
  staffRole: string
  staffId?:  string
}

/** Full session object returned by getAdminSession() — includes DB fields */
export interface AdminSession {
  // ── Identity ───────────────────────────────────────────────────────────────
  id:               string
  email:            string
  name:             string
  roleTitle:        string          // free-text job title e.g. "Senior Travel Consultant"
  sendingEmail:     string          // outbound From address (sendingEmail ?? 'bookings@walztravels.com')
  signatureTagline: string | null   // optional override for sub-name line in signature
  // ── RBAC ──────────────────────────────────────────────────────────────────
  role:        string   // actual RBAC role: super_admin | visa_officer | …
  staffRole:   string   // alias for role — backward compat for existing routes
  permissions: Record<string, boolean>
  // ── Location ──────────────────────────────────────────────────────────────
  branch:      string
  department:  string
  // ── Status ────────────────────────────────────────────────────────────────
  isActive:    boolean
  // ── Legacy ────────────────────────────────────────────────────────────────
  staffId?:    string
}

/** @deprecated — use AdminSession */
export type AdminPayload = AdminSession

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS ?? 'contact@walztravels.com')
  .split(',')
  .map(e => e.trim().toLowerCase())

export async function signAdminToken(
  email:     string,
  staffRole: string = 'sales_rep',
  staffId?:  string,
): Promise<string> {
  return new SignJWT({ email, role: 'admin', staffRole, staffId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getSecret())
}

export async function verifyAdminToken(token: string): Promise<JwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as JwtClaims
  } catch {
    return null
  }
}

// ── Per-lambda session cache ──────────────────────────────────────────────────
// Every admin API call used to run staff.findUnique + rolePermission.findUnique
// (plus the lastActiveAt touch below) — 3-4 pool checkouts per request, and an
// admin page fires several requests in parallel against a 3-connection pool.
// A short per-instance cache collapses that to one DB load per staff per 60s
// per warm lambda. Tradeoff (accepted): deactivating a staff member or editing
// role permissions takes up to 60s to reach already-warm instances; the JWT
// itself still expires on its own schedule and a missing/invalid token is
// never cached.
const SESSION_CACHE_MS = 60 * 1000
const sessionCache = new Map<string, { session: AdminSession; expiresAt: number }>()

const LAST_ACTIVE_THROTTLE_MS = 2 * 60 * 1000
const lastActiveTouchAt = new Map<string, number>()

/** Test/ops helper + immediate local invalidation after staff edits. */
export function invalidateAdminSessionCache(email?: string): void {
  if (email) sessionCache.delete(email.toLowerCase())
  else sessionCache.clear()
}

/**
 * Server component / API route helper.
 * Reads the cookie → verifies JWT → fetches Staff from DB → returns full session.
 * Returns null for missing/expired tokens or deactivated staff.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return null

  const decoded = await verifyAdminToken(token)
  if (!decoded?.email) return null

  // ── Per-lambda cache hit: skip the DB entirely ─────────────────────────────
  const cacheKey = decoded.email.toLowerCase()
  const cached = sessionCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.session
  }

  // ── Fetch staff record from DB ─────────────────────────────────────────────
  const staff = await prisma.staff.findUnique({
    where:  { email: decoded.email },
    select: {
      id:               true,
      email:            true,
      name:             true,
      roleTitle:        true,
      sendingEmail:     true,
      signatureTagline: true,
      role:             true,
      permissions:      true,
      branch:           true,
      department:       true,
      isActive:         true,
    },
  })

  // ── Touch lastActiveAt — throttled to one write per 2 minutes ─────────────
  // This used to read-then-update on EVERY admin API call. A dashboard fires
  // many calls in parallel, all targeting the SAME Staff row, so concurrent
  // lambdas formed a row-lock convoy: updates sat waiting until Postgres
  // killed them (57014 statement timeout), each pinning one of the 3 pooled
  // connections the whole time — starving every other query into P2024
  // 20-second pool timeouts (incident 2026-09-09, admin login + dashboard).
  //
  // Now: (a) a per-lambda in-memory throttle means each warm instance
  // attempts at most one write per staff per 2 minutes, and (b) the write is
  // a single conditional UPDATE (no pre-read) that matches zero rows when
  // another instance already touched the row — cheap either way. Still
  // fire-and-forget and swallowed on error (pre-migration column missing).
  if (staff?.isActive) {
    const now = Date.now()
    const lastAttempt = lastActiveTouchAt.get(staff.id) ?? 0
    if (now - lastAttempt > LAST_ACTIVE_THROTTLE_MS) {
      lastActiveTouchAt.set(staff.id, now)
      void prisma.$executeRaw`
        UPDATE "Staff" SET "lastActiveAt" = NOW()
        WHERE id = ${staff.id}
          AND ("lastActiveAt" IS NULL OR "lastActiveAt" < NOW() - interval '2 minutes')
      `.catch(() => { /* column not yet migrated — silently skip */ })
    }
  }

  // ── Fallback: env-var super admin with no Staff record yet ─────────────────
  if (!staff) {
    if (!ALLOWED_EMAILS.includes(decoded.email.toLowerCase())) return null

    const envSession: AdminSession = {
      id:               'env-admin',
      email:            decoded.email,
      name:             decoded.email.split('@')[0],
      roleTitle:        'Administrator',
      sendingEmail:     'bookings@walztravels.com',
      signatureTagline: null,
      role:             'super_admin',
      staffRole:   'super_admin',
      permissions: {},
      branch:      'nigeria',
      department:  'general',
      isActive:    true,
      staffId:     decoded.staffId,
    }
    sessionCache.set(cacheKey, { session: envSession, expiresAt: Date.now() + SESSION_CACHE_MS })
    return envSession
  }

  if (!staff.isActive) return null

  // Merge role defaults + per-staff overrides so session.permissions always reflects
  // the full effective permission set (role change in RoleManager → instant effect).
  const roleRecord = await prisma.rolePermission.findUnique({
    where:  { role: staff.role },
    select: { permissions: true },
  })
  const roleDefaults   = (roleRecord?.permissions ?? {}) as Record<string, boolean>
  const staffOverrides = (staff.permissions       ?? {}) as Record<string, boolean>
  const mergedPerms    = mergePermissions(roleDefaults, staffOverrides)

  const session: AdminSession = {
    id:               staff.id,
    email:            staff.email,
    name:             staff.name,
    roleTitle:        staff.roleTitle        ?? 'Travel Consultant',
    sendingEmail:     staff.sendingEmail     ?? 'bookings@walztravels.com',
    signatureTagline: staff.signatureTagline ?? null,
    role:             staff.role,
    staffRole:   staff.role,
    permissions: mergedPerms,
    branch:      staff.branch     ?? 'nigeria',
    department:  staff.department ?? 'general',
    isActive:    staff.isActive,
    staffId:     staff.id,
  }
  sessionCache.set(cacheKey, { session, expiresAt: Date.now() + SESSION_CACHE_MS })
  return session
}

export { COOKIE_NAME }
