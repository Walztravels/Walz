/**
 * Walz central FX engine — the ONE authoritative server-side FX service.
 *
 * Customer-facing NGN conversion: Monierate parallel → Walz manual → fail
 * closed, plus a single configurable USD adjustment per conversion total.
 * Non-NGN conversion keeps the existing standard provider.
 *
 * Feature-flagged: WALZ_NGN_FX_ENGINE_ENABLED=true activates the NGN engine
 * at its integration points; when unset/false, existing production behavior
 * is preserved everywhere.
 */
export * from './types'
export { getFxSettings, invalidateFxSettingsCache, manualNgnRate, NGN_BASE_CURRENCIES, FX_DEFAULTS, FX_SETTINGS_ID } from './settings'
export type { FxSettings, FxRateMode } from './settings'
export { getNgnRate, adjustmentInBase } from './policy'
export { createNgnQuote, loadFxLock, markFxLockUsed } from './quote'
export type { CreateNgnQuoteInput, LoadedLock } from './quote'
export { getStandardRate } from './providers/standard'
export { getMonierateNgnRate, isStaleMonierateRate, MONIERATE_MAX_SOURCE_AGE_MS } from './providers/monierate'
export { clearRateCache, rateCacheKey } from './cache'

export function isNgnFxEngineEnabled(): boolean {
  return process.env.WALZ_NGN_FX_ENGINE_ENABLED === 'true'
}

/** Customer-facing label — never "CBN rate", "official rate" or "bank rate". */
export const WALZ_NGN_RATE_LABEL = 'Walz NGN rate'
