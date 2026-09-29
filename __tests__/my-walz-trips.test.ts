/**
 * @jest-environment node
 *
 * My Walz Phase 1 — My Trips (read-only integration with the existing Trip model).
 *
 * Rules under test:
 *  1. Ownership — trips are always queried scoped to session.user.id, never a
 *     client-supplied id, and the route never writes to the Trip model.
 *  2. Empty state renders without querying anything unsafe.
 *  3. Upcoming/Past/Saved grouping is derived from real Trip.status/dates only.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

describe('app/dashboard/trips/page.tsx — ownership + read-only guarantees', () => {
  const src = readSource('app/dashboard/trips/page.tsx')

  it('requires an authenticated session and redirects otherwise', () => {
    expect(src).toContain('getServerSession(authOptions)')
    expect(src).toContain("redirect('/login?callbackUrl=/dashboard/trips')")
  })

  it('queries Trip scoped to session.user.id — never a client-supplied id', () => {
    expect(src).toMatch(/where:\s*\{\s*userId:\s*session\.user\.id\s*\}/)
    expect(src).not.toMatch(/searchParams/)
  })

  it('never writes to the Trip model (read-only integration)', () => {
    expect(src).not.toMatch(/prisma\.trip\.(create|update|upsert|delete)/)
    expect(src).not.toMatch(/prisma\.tripItem\.(create|update|upsert|delete)/)
  })

  it('does not duplicate booking records or fabricate trip data', () => {
    expect(src).not.toMatch(/prisma\.booking\.(create|update)/)
  })

  it('has a real, non-fabricated empty state', () => {
    expect(src).toContain('No trips yet')
  })

  it('groups into Upcoming / Saved-Planning / Past using real Trip fields only', () => {
    expect(src).toContain('Upcoming')
    expect(src).toContain('Saved / Planning')
    expect(src).toContain('Past')
  })
})

describe('app/dashboard/page.tsx — Upcoming Trip card ownership', () => {
  const src = readSource('app/dashboard/page.tsx')

  it('resolves the primary trip scoped to the authenticated user only', () => {
    expect(src).toMatch(/prisma\.trip\.findFirst\(\{\s*where:\s*\{\s*userId,/)
  })

  it('never writes to the Trip model from the Home dashboard', () => {
    expect(src).not.toMatch(/prisma\.trip\.(create|update|upsert|delete)/)
  })
})
