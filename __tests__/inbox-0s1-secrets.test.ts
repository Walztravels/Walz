/**
 * INBOX-0S.1 — Secrets & Chatwoot config consolidation.
 *
 * The compromised literal token must never reappear in the tree, no file
 * may reintroduce a hardcoded token fallback, and every surface must fail
 * closed (controlled 503 / skip-with-log) when no token is configured.
 */

import fs from 'fs'
import path from 'path'

import {
  adminChatwootOrNull, botChatwootOrNull, botAgentTokenOrNull,
} from '@/lib/chatwoot/config'

const ROOT = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// The exposed credential, split so this test file itself never contains it.
const LEAKED = ['1rnd6Rp9', 'GNVKtbJ8', '238Vg2S1'].join('')

const SOURCE_DIRS = ['app', 'lib', 'components', 'prisma', 'scripts', '__tests__']
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|jsx|mjs|sql|json|md)$/.test(e.name)) out.push(full)
  }
  return out
}

describe('leaked credential is gone', () => {
  it('the exposed Chatwoot token appears nowhere in the source tree', () => {
    const offenders: string[] = []
    for (const dir of SOURCE_DIRS) {
      const abs = path.join(ROOT, dir)
      if (!fs.existsSync(abs)) continue
      for (const f of walk(abs)) {
        if (fs.readFileSync(f, 'utf8').includes(LEAKED)) offenders.push(path.relative(ROOT, f))
      }
    }
    expect(offenders).toEqual([])
  })

  it('no Chatwoot token env read carries a literal fallback anywhere', () => {
    // A hardcoded fallback looks like: process.env.CHATWOOT_*TOKEN* ?? 'literal'
    const fallbackPattern = /process\.env\.CHATWOOT_\w*TOKEN\w*\s*(\?\?|\|\|)\s*['"`][A-Za-z0-9]{8,}['"`]/
    const offenders: string[] = []
    for (const dir of ['app', 'lib', 'components']) {
      for (const f of walk(path.join(ROOT, dir))) {
        if (fallbackPattern.test(fs.readFileSync(f, 'utf8'))) offenders.push(path.relative(ROOT, f))
      }
    }
    expect(offenders).toEqual([])
  })

  it('no non-null assertion on CHATWOOT_ADMIN_TOKEN remains in inbox proxy routes', () => {
    for (const f of walk(path.join(ROOT, 'app/api/admin'))) {
      expect(fs.readFileSync(f, 'utf8')).not.toContain('CHATWOOT_ADMIN_TOKEN!')
    }
  })
})

describe('lib/chatwoot/config — fail-closed behavior', () => {
  const ENV_KEYS = [
    'CHATWOOT_ADMIN_TOKEN', 'CHATWOOT_API_TOKEN', 'CHATWOOT_BOT_TOKEN',
    'CHATWOOT_BASE_URL', 'CHATWOOT_BOT_BASE_URL', 'CHATWOOT_ACCOUNT_ID',
  ]
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] } })
  afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

  it('returns null on both surfaces when no token env is set — never a default token', () => {
    expect(adminChatwootOrNull()).toBeNull()
    expect(botChatwootOrNull()).toBeNull()
    expect(botAgentTokenOrNull()).toBeNull()
  })

  it('whitespace-only tokens count as unset', () => {
    process.env.CHATWOOT_API_TOKEN = '   '
    process.env.CHATWOOT_ADMIN_TOKEN = ''
    expect(adminChatwootOrNull()).toBeNull()
    expect(botChatwootOrNull()).toBeNull()
  })

  it('surfaces prefer their own token but cross-fall-back so one env keeps both alive', () => {
    process.env.CHATWOOT_ADMIN_TOKEN = 'admin-tok'
    process.env.CHATWOOT_API_TOKEN   = 'bot-tok'
    expect(adminChatwootOrNull()?.token).toBe('admin-tok')
    expect(botChatwootOrNull()?.token).toBe('bot-tok')
    delete process.env.CHATWOOT_API_TOKEN
    expect(botChatwootOrNull()?.token).toBe('admin-tok')     // cross-fallback
    delete process.env.CHATWOOT_ADMIN_TOKEN
    process.env.CHATWOOT_API_TOKEN = 'bot-tok'
    expect(adminChatwootOrNull()?.token).toBe('bot-tok')     // cross-fallback
  })

  it('host defaults are preserved per surface; env overrides are respected', () => {
    process.env.CHATWOOT_API_TOKEN = 't'
    expect(adminChatwootOrNull()?.base).toBe('https://chatwoot-production-d486.up.railway.app')
    expect(botChatwootOrNull()?.base).toBe('https://chat.walztravels.com')
    process.env.CHATWOOT_BASE_URL = 'https://example.test'
    expect(adminChatwootOrNull()?.base).toBe('https://example.test')
    expect(botChatwootOrNull()?.base).toBe('https://example.test')
    process.env.CHATWOOT_BOT_BASE_URL = 'https://bot.example.test'
    expect(botChatwootOrNull()?.base).toBe('https://bot.example.test')
    expect(adminChatwootOrNull()?.base).toBe('https://example.test')  // bot override never leaks into admin
  })

  it('dedicated bot-agent token wins; account id defaults to 1', () => {
    process.env.CHATWOOT_API_TOKEN = 'agent'
    expect(botAgentTokenOrNull()).toBe('agent')
    process.env.CHATWOOT_BOT_TOKEN = 'bot-only'
    expect(botAgentTokenOrNull()).toBe('bot-only')
    expect(botChatwootOrNull()?.accountId).toBe('1')
    process.env.CHATWOOT_ACCOUNT_ID = '7'
    expect(botChatwootOrNull()?.accountId).toBe('7')
  })
})

describe('call sites fail closed on the central config', () => {
  const ADMIN_PROXY_ROUTES = [
    'app/api/admin/agents/route.ts',
    'app/api/admin/conversations/route.ts',
    'app/api/admin/conversations/[id]/route.ts',
    'app/api/admin/conversations/[id]/messages/route.ts',
    'app/api/admin/conversations/[id]/reply/route.ts',
    'app/api/admin/conversations/[id]/read/route.ts',
    'app/api/admin/conversations/[id]/resolve/route.ts',
    'app/api/admin/conversations/[id]/assign/route.ts',
    'app/api/admin/whatsapp-chat/route.ts',
  ]
  it('every admin inbox proxy route imports the central config and 503s when unconfigured', () => {
    for (const f of ADMIN_PROXY_ROUTES) {
      const s = read(f)
      expect(s).toContain("from '@/lib/chatwoot/config'")
      expect(s).toContain("{ status: 503 }")
      expect(s).toContain('Messaging service is not configured.')
    }
  })

  it('webhooks stay null-tolerant: mirroring survives, Chatwoot REST calls are guarded', () => {
    const cw = read('app/api/webhooks/chatwoot/route.ts')
    expect(cw).toContain("botChatwootOrNull()?.token ?? ''")
    expect(cw).toContain('logChatwootUnconfigured')
    expect(cw).not.toContain("{ status: 503 }")   // a webhook must not 503 over token absence
    const meta = read('app/api/webhooks/meta/route.ts')
    expect(meta).toContain("botChatwootOrNull()?.token ?? ''")
    expect(meta).toContain("logChatwootUnconfigured('meta-webhook agent check')")
  })

  it('router assignment and jade-memory skip with a log instead of calling with an empty token', () => {
    const router = read('lib/conversation-router.ts')
    expect(router).toContain('dec.chatwootId && CHATWOOT_TOKEN')
    expect(router).toContain("logChatwootUnconfigured('conversation-router assignment')")
    const mem = read('lib/jade-memory.ts')
    expect(mem).toContain("if (!CHATWOOT_TOKEN) { logChatwootUnconfigured('jade-memory'); return null }")
  })

  it('jade widget helpers throw a controlled error rather than calling unauthenticated', () => {
    const widget = read('app/api/jade/chatwoot/route.ts')
    expect(widget).toContain("throw new Error('Chatwoot not configured')")
  })

  it('the ping diagnostic never reveals token characters and skips the live call when unset', () => {
    const ping = read('app/api/jade/ping/route.ts')
    expect(ping).not.toContain('slice(0, 4)')
    expect(ping).not.toContain('tokenFirst4')
    expect(ping).toContain('live check skipped')
  })

  it('the routing-escalation cron returns a controlled 503 instead of running tokenless', () => {
    const cron = read('app/api/cron/routing-escalation/route.ts')
    expect(cron).toContain('botChatwootOrNull()')
    expect(cron).toContain("{ status: 503 }")
  })

  it('config module never logs a token value', () => {
    const cfg = read('lib/chatwoot/config.ts')
    // The one log helper takes only a context string; no token interpolation.
    expect(cfg).not.toMatch(/console\.\w+\([^)]*token[^)]*\$\{/i)
    expect(cfg).toContain('logChatwootUnconfigured(context: string)')
  })
})
