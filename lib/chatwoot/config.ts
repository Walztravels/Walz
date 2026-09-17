/**
 * Central Chatwoot configuration (INBOX-0S.1).
 *
 * Single source for base URL, tokens and account id. FAIL CLOSED: there
 * are NO hardcoded token fallbacks anywhere — if the environment lacks a
 * token, callers receive null/throw and must degrade with a controlled
 * error, never with a baked-in credential. Secrets are never logged.
 *
 * Hosts are deliberately preserved exactly as each surface used before
 * this consolidation (admin proxy ⇒ Railway hostname default, bot/webhook
 * surface ⇒ chat.walztravels.com default — both verified to serve the
 * same Chatwoot 4.15.1 instance). Unifying them is an env-only decision
 * (set CHATWOOT_BASE_URL / CHATWOOT_BOT_BASE_URL), not a code default
 * change, so production messaging cannot be interrupted by this release.
 *
 * Env:
 *   CHATWOOT_ADMIN_TOKEN   — admin API token (inbox proxy routes)
 *   CHATWOOT_API_TOKEN     — agent/bot-side API token (webhooks, Jade, router)
 *     (each falls back to the other so one configured token keeps both
 *      surfaces alive; set both for least privilege)
 *   CHATWOOT_BOT_TOKEN     — optional dedicated agent-bot token
 *   CHATWOOT_BASE_URL      — admin/bot base override
 *   CHATWOOT_BOT_BASE_URL  — bot-surface base override (wins over BASE_URL there)
 *   CHATWOOT_ACCOUNT_ID    — default '1'
 */

const ADMIN_DEFAULT_BASE = 'https://chatwoot-production-d486.up.railway.app'
const BOT_DEFAULT_BASE   = 'https://chat.walztravels.com'

export interface ChatwootConfig {
  base: string
  token: string
  accountId: string
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/** Admin-surface config (inbox proxy routes). Null when no token is set —
 *  handlers must return a controlled 503, never call with a bad token. */
export function adminChatwootOrNull(): ChatwootConfig | null {
  const token = clean(process.env.CHATWOOT_ADMIN_TOKEN) ?? clean(process.env.CHATWOOT_API_TOKEN)
  if (!token) return null
  return {
    base:      clean(process.env.CHATWOOT_BASE_URL) ?? ADMIN_DEFAULT_BASE,
    token,
    accountId: clean(process.env.CHATWOOT_ACCOUNT_ID) ?? '1',
  }
}

/** Bot/webhook-surface config. Null when no token is set — webhook
 *  mirroring must continue, Chatwoot REST calls are skipped with a log. */
export function botChatwootOrNull(): ChatwootConfig | null {
  const token = clean(process.env.CHATWOOT_API_TOKEN) ?? clean(process.env.CHATWOOT_ADMIN_TOKEN)
  if (!token) return null
  return {
    base:      clean(process.env.CHATWOOT_BOT_BASE_URL) ?? clean(process.env.CHATWOOT_BASE_URL) ?? BOT_DEFAULT_BASE,
    token,
    accountId: clean(process.env.CHATWOOT_ACCOUNT_ID) ?? '1',
  }
}

/** Dedicated agent-bot token where configured (falls back to the bot token). */
export function botAgentTokenOrNull(): string | null {
  return clean(process.env.CHATWOOT_BOT_TOKEN) ?? (botChatwootOrNull()?.token ?? null)
}

/** One log line (no secrets) for skipped calls when unconfigured. */
export function logChatwootUnconfigured(context: string): void {
  console.error(`[chatwoot] ${context}: no Chatwoot token configured — call skipped (set CHATWOOT_API_TOKEN / CHATWOOT_ADMIN_TOKEN)`)
}
