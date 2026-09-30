// lib/business/currency.ts — Walz Business (Release 2)
//
// The closed list of billing currencies an Organization may use. This is
// exactly the set already established in lib/currency.ts's
// CURRENCY_SYMBOLS map (GBP, USD, CAD, EUR, NGN, GHS, AED, ZAR) — no new
// currency is introduced here. Kept in a plain lib module so both the
// creation route and the dedicated currency-change route (and the admin UI)
// share one source of truth.
//
// R2 RULES
//   - Creation REQUIRES an explicit currency from this list — there is no
//     silent 'GBP' fallback for any organization created after R2.
//   - An EXISTING organization's currency only ever changes through
//     app/api/admin/business/organizations/[id]/currency/route.ts
//     (b2b.manage + mandatory reason + before/after audit). No other route
//     writes Organization.defaultCurrency.

import { getCurrencySymbol } from '@/lib/currency'

export const SUPPORTED_ORG_CURRENCIES = ['GBP', 'USD', 'CAD', 'EUR', 'NGN', 'GHS', 'AED', 'ZAR'] as const
export type OrgCurrency = (typeof SUPPORTED_ORG_CURRENCIES)[number]

export function isSupportedOrgCurrency(value: unknown): value is OrgCurrency {
  return typeof value === 'string' && (SUPPORTED_ORG_CURRENCIES as readonly string[]).includes(value)
}

/** Normalizes a raw client value (trim + uppercase) and validates it. */
export function parseOrgCurrency(value: unknown): OrgCurrency | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return isSupportedOrgCurrency(normalized) ? normalized : null
}

export function orgCurrencyLabel(code: string): string {
  return `${code} (${getCurrencySymbol(code).trim()})`
}
