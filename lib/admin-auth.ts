import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

const COOKIE_NAME = 'admin_token'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_ADMIN_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[FATAL] JWT_ADMIN_SECRET environment variable is not set. ' +
        'Set it in Vercel environment variables immediately.'
      )
    }
    console.warn(
      '\x1b[41m\x1b[37m SECURITY WARNING \x1b[0m JWT_ADMIN_SECRET is not set. ' +
      'This is insecure. Set it in your .env file.'
    )
    return new TextEncoder().encode('dev-only-secret-do-not-use-in-production')
  }
  return new TextEncoder().encode(secret)
}

const SECRET = getSecret()

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
  id:          string
  email:       string
  name:        string
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
    .sign(SECRET)
}

export async function verifyAdminToken(token: string): Promise<JwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as JwtClaims
  } catch {
    return null
  }
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

  // ── Fetch staff record from DB ─────────────────────────────────────────────
  const staff = await prisma.staff.findUnique({
    where:  { email: decoded.email },
    select: {
      id:          true,
      email:       true,
      name:        true,
      role:        true,
      permissions: true,
      branch:      true,
      department:  true,
      isActive:    true,
    },
  })

  // ── Fallback: env-var super admin with no Staff record yet ─────────────────
  if (!staff) {
    if (!ALLOWED_EMAILS.includes(decoded.email.toLowerCase())) return null

    return {
      id:          'env-admin',
      email:       decoded.email,
      name:        decoded.email.split('@')[0],
      role:        'super_admin',
      staffRole:   'super_admin',
      permissions: {},
      branch:      'nigeria',
      department:  'general',
      isActive:    true,
      staffId:     decoded.staffId,
    }
  }

  if (!staff.isActive) return null

  return {
    id:          staff.id,
    email:       staff.email,
    name:        staff.name,
    role:        staff.role,
    staffRole:   staff.role,    // backward compat alias
    permissions: (staff.permissions ?? {}) as Record<string, boolean>,
    branch:      staff.branch      ?? 'nigeria',
    department:  staff.department  ?? 'general',
    isActive:    staff.isActive,
    staffId:     staff.id,
  }
}

export { COOKIE_NAME }
