/**
 * Regression: the careers inbound webhook must bypass staff-session
 * middleware (it authenticates with its own timing-safe secret). Without
 * the bypass, every Resend delivery 401s at the edge and no careers email
 * ever reaches the Email Hub — the exact production failure observed on
 * 2026-09-08 (three edge-middleware 401 POSTs while the domain was fully
 * verified).
 */
import fs from 'fs'

describe('inbound webhook middleware bypass', () => {
  const src = fs.readFileSync('middleware.ts', 'utf8')
  it('lets both Resend inbound webhooks through to their own secret checks', () => {
    expect(src).toContain("pathname === '/api/admin/suppliers/inbound'")
    expect(src).toContain("pathname === '/api/admin/careers/inbound'")
  })
  it('the careers route still fails closed on its own secret', () => {
    const route = fs.readFileSync('app/api/admin/careers/inbound/route.ts', 'utf8')
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain('RESEND_INBOUND_SECRET')
    expect(route).toContain("{ status: 401 }")
  })
})
