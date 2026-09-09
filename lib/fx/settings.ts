import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'

/**
 * DB-backed FX configuration (admin-editable, super_admin only).
 * A single row keyed FX_SETTINGS_ID; reads fall back to safe defaults so a
 * missing row (or an unmigrated database) can never crash pricing paths.
 */

export const FX_SETTINGS_ID = 'fx-settings'

export type FxRateMode = 'AUTO_MONIERATE' | 'MANUAL'

/** Currencies Walz commonly prices into NGN. Manual rates exist for each. */
export const NGN_BASE_CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AED'] as const

export interface FxSettings {
  rateMode:      FxRateMode
  /** NGN per 1 unit of base currency, as decimal strings, e.g. { USD: '1397' } */
  manualRates:   Partial<Record<string, string>>
  adjustmentUsd: Prisma.Decimal
  cacheMinutes:  number
  lockMinutes:   number
  isEnabled:     boolean
  updatedBy:     string | null
  updatedAt:     Date | null
}

export const FX_DEFAULTS = {
  rateMode:      'AUTO_MONIERATE' as FxRateMode,
  adjustmentUsd: '5.00',
  cacheMinutes:  10,
  lockMinutes:   15,
} as const

// 60-second settings cache — admin changes propagate within a minute
// without a DB read on every price render.
let cached: { settings: FxSettings; expiresAt: number } | null = null
const SETTINGS_CACHE_MS = 60 * 1000

function defaults(): FxSettings {
  return {
    rateMode:      FX_DEFAULTS.rateMode,
    manualRates:   {},
    adjustmentUsd: new Prisma.Decimal(FX_DEFAULTS.adjustmentUsd),
    cacheMinutes:  FX_DEFAULTS.cacheMinutes,
    lockMinutes:   FX_DEFAULTS.lockMinutes,
    isEnabled:     true,
    updatedBy:     null,
    updatedAt:     null,
  }
}

export async function getFxSettings(): Promise<FxSettings> {
  if (cached && Date.now() < cached.expiresAt) return cached.settings
  try {
    const row = await prisma.fxSettings.findUnique({ where: { id: FX_SETTINGS_ID } })
    const settings: FxSettings = row
      ? {
          rateMode:      row.rateMode === 'MANUAL' ? 'MANUAL' : 'AUTO_MONIERATE',
          manualRates:   (row.manualRates as Partial<Record<string, string>> | null) ?? {},
          adjustmentUsd: row.adjustmentUsd,
          cacheMinutes:  row.cacheMinutes,
          lockMinutes:   row.lockMinutes,
          isEnabled:     row.isEnabled,
          updatedBy:     row.updatedBy,
          updatedAt:     row.updatedAt,
        }
      : defaults()
    cached = { settings, expiresAt: Date.now() + SETTINGS_CACHE_MS }
    return settings
  } catch (e) {
    // Table not migrated yet, or transient DB error — safe defaults.
    console.error('[fx] settings read failed, using defaults:', e instanceof Error ? e.message : e)
    return defaults()
  }
}

/** Manual NGN rate for a base currency, or null when not configured/invalid. */
export function manualNgnRate(settings: FxSettings, base: string): Prisma.Decimal | null {
  const raw = settings.manualRates[base.toUpperCase()]
  if (!raw) return null
  try {
    const d = new Prisma.Decimal(raw)
    return d.gt(0) ? d : null
  } catch {
    return null
  }
}

/** Invalidate after admin writes so changes apply promptly in this lambda. */
export function invalidateFxSettingsCache(): void {
  cached = null
}
