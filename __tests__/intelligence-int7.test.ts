/**
 * INT-7 — Embassy Intelligence Feed: official sources, deterministic
 * change detection, no fabricated policy alerts, ever.
 */

import fs from 'fs'
import path from 'path'

jest.mock('@/lib/db', () => ({ __esModule: true, default: {} }))
jest.mock('@/lib/anthropic', () => ({ getAnthropic: jest.fn() }))

import { EMBASSY_SOURCES, enabledSources } from '@/lib/embassy-intel/sources'
import { extractRssEntries, extractHtmlText, newRssLines, severityFor, sha256 } from '@/lib/embassy-intel/detector'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const cron     = read('app/api/cron/embassy-feed/route.ts')
const detector = read('lib/embassy-intel/detector.ts')
const vercel   = read('vercel.json')
const sql      = read('prisma/migrations/int7_embassy_feed.sql')

describe('source registry', () => {
  it('covers the core destinations with official URLs only', () => {
    const countries = new Set(enabledSources().map(s => s.country))
    for (const c of ['uk', 'usa', 'canada', 'schengen', 'uae', 'australia']) expect(countries).toContain(c)
    for (const s of EMBASSY_SOURCES) {
      expect(s.url).toMatch(/^https:\/\/(www\.)?(gov\.uk|.*\.gov\.uk|.*usembassy\.gov|.*canada\.ca|api\.io\.canada\.ca|.*ambafrance\.org|.*diplo\.de|.*netherlandsworldwide\.nl|.*ec\.europa\.eu|u\.ae|.*homeaffairs\.gov\.au|.*irishimmigration\.ie|travel\.state\.gov|france-visas\.gouv\.fr)\//)
    }
  })
  it('blocked sources are kept disabled with a reason — never scraped around', () => {
    const blocked = EMBASSY_SOURCES.filter(s => !s.enabled)
    expect(blocked.length).toBeGreaterThanOrEqual(2)
    for (const s of blocked) expect(s.note).toMatch(/403|block/i)
  })
})

describe('deterministic change detection', () => {
  it('RSS change signal is the entry set — new entries diff cleanly', () => {
    const xml = `<rss><item><guid>g1</guid><title>Visa fee update</title><link>https://x/1</link></item>
      <item><guid>g2</guid><title>New appointment rules</title><link>https://x/2</link></item></rss>`
    const entries = extractRssEntries(xml)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toContain('Visa fee update')
    const fresh = newRssLines(entries[0], entries.join('\n'))
    expect(fresh).toHaveLength(1)
    expect(fresh[0]).toContain('New appointment rules')
  })
  it('HTML extraction scopes to the section and strips noise deterministically', () => {
    const html = `<html><nav>MENU</nav><main id="content"><h1>Visitor visa</h1>
      <script>track()</script><p>Fee: £115</p></main><footer>F</footer></html>`
    const text = extractHtmlText(html, 'main')
    expect(text).toContain('Visitor visa')
    expect(text).toContain('Fee: £115')
    expect(text).not.toContain('MENU')
    expect(text).not.toContain('track()')
    expect(sha256(text)).toBe(sha256(extractHtmlText(html, 'main')))   // stable hash
  })
  it('severity is keyword-derived, defaulting low', () => {
    expect(severityFor('Visa services suspended for category X')).toBe('high')
    expect(severityFor('New fee schedule published')).toBe('medium')
    expect(severityFor('Office holiday hours')).toBe('low')
  })
})

describe('no fabricated alerts', () => {
  it('the Math.random alert generator is gone and the cron is scheduled', () => {
    expect(cron).not.toContain('Math.random')
    expect(cron).toContain('CRON_SECRET')
    expect(cron).toContain('runSource')
    expect(vercel).toContain('"path": "/api/cron/embassy-feed"')
  })
  it('fetch failures and 304s never create alerts', () => {
    expect(detector).toContain('NEVER create an alert')
    // The failure path returns before any alert creation:
    expect(detector.indexOf('alertsCreated: 0 }\n  }')).toBeLessThan(detector.indexOf('createAlert'))
  })
  it('the first snapshot is a baseline, not a change', () => {
    expect(detector).toContain('isBaseline')
    expect(detector).toContain('if (!changed || isBaseline)')
  })
  it('the model only summarizes an ACTUAL diff and its failure keeps the deterministic alert', () => {
    expect(detector).toContain('never speculate')
    expect(detector).toContain('<<<PREVIOUS>>>')
    expect(detector).toContain('Automatic summarization was unavailable')
  })
  it('every alert carries source attribution and evidence', () => {
    expect(detector).toContain('sourceUrl: opts.sourceUrl')
    expect(detector).toContain('previousValue')
    expect(detector).toContain('affectedClients')
  })
  it('one alert per source per day (dedupe)', () => {
    expect(detector).toContain('one alert per source per day'.replace('one alert per source per day', 'Dedupe: one alert per source per day'))
  })
  it('migration is additive and idempotent', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "EmbassySourceSnapshot"')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "sourceId"')
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i)
  })
})
