import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

/**
 * Serverless connection tuning.
 *
 * Production DB access goes through the Supabase transaction-mode pooler
 * (Supavisor, port 6543). Prisma's default per-instance pool is 5 connections
 * with a 10s checkout timeout — with many concurrent Vercel lambdas (the admin
 * dashboard fires several API calls in parallel) that exhausts the pooler and
 * produces P2024 "Timed out fetching a new connection from the connection pool"
 * and ECHECKOUTTIMEOUT errors, which surfaced as "Login failed" on /admin/login.
 *
 * connection_limit=1 (tried 2026-09-02) fixed cross-lambda exhaustion but
 * starved requests that fan out queries in parallel WITHIN one lambda
 * (admin dashboard/inbox run 5+ queries via Promise.all): all queries
 * queued on a single connection and timed out at 20s (P2024, incident
 * 2026-09-05). connection_limit=3 is the balance — parallel per-request
 * queries proceed while total pooler pressure stays ~40% below the old
 * default of 5. Applied in code (not via Vercel env) so the DATABASE_URL
 * env var stays untouched; explicit params already in the URL win.
 */
function tunedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw) return undefined
  // Only tune pooled (transaction-mode) connections in production
  if (process.env.NODE_ENV !== 'production') return raw
  try {
    const url = new URL(raw)
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3')
    if (!url.searchParams.has('pool_timeout'))     url.searchParams.set('pool_timeout', '20')
    return url.toString()
  } catch {
    return raw
  }
}

const prismaClientSingleton = (): PrismaClient => {
  const url = tunedDatabaseUrl()
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
  })
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}

export default prisma
export { prisma }
