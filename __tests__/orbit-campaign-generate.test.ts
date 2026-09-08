/**
 * Orbit campaign "Generate content" — timeout + error-surfacing regression.
 *
 * The failure mode: generation across 6-7 platforms exceeded the route's
 * 60s maxDuration, Vercel returned a plain-text 504, and the client's
 * unguarded res.json() surfaced Safari's cryptic "The string did not match
 * the expected pattern." These tests pin the fix.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('campaign generate route', () => {
  const route = read('app/api/admin/orbit/campaigns/[id]/generate/route.ts')

  it('allows long generations (300s, the Pro ceiling) instead of dying at 60s', () => {
    expect(route).toContain('export const maxDuration = 300')
  })

  it('always answers JSON from its own error path', () => {
    expect(route).toContain('return NextResponse.json({ error: msg }, { status: 500 })')
  })
})

describe('campaign page error surfacing', () => {
  const page = read('app/admin/orbit/campaigns/[id]/page.tsx')

  it('parses responses defensively — no raw res.json() on generate/action', () => {
    expect(page).toContain('async function safeJson(res: Response)')
    expect(page).toContain('const data = await safeJson(res)')
    // the two mutation handlers must not use the unguarded parse
    const handlers = page.slice(page.indexOf('async function generate'), page.indexOf('if (loading)'))
    expect(handlers).not.toContain('await res.json()')
  })

  it('maps gateway timeouts to a human explanation instead of a parse error', () => {
    expect(page).toContain('res.status === 504')
    expect(page).toContain('timed out while generating')
    expect(page).toContain('HTTP ${res.status}')
  })
})
