import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_token'
const SECRET = new TextEncoder().encode(
  process.env.JWT_ADMIN_SECRET ?? 'walz-admin-secret-change-me-in-production'
)

export interface AdminPayload {
  email:      string
  role:       'admin'          // kept for backward-compat
  staffRole:  string           // actual RBAC role: super_admin | general_manager | ...
  staffId?:   string
  iat?:       number
  exp?:       number
}

export async function signAdminToken(
  email:     string,
  staffRole: string  = 'sales_rep',
  staffId?:  string,
): Promise<string> {
  return new SignJWT({ email, role: 'admin', staffRole, staffId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(SECRET)
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as AdminPayload
  } catch {
    return null
  }
}

/** Server component helper — reads from the cookie store */
export async function getAdminSession(): Promise<AdminPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyAdminToken(token)
}

export { COOKIE_NAME }
