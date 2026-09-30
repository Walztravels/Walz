// lib/business/validation.ts — Walz Business (Release 2.1 remediation, B6)
//
// Shared, REAL server-side length validation for free-text fields
// introduced in this release. Every check here REJECTS an over-length
// value with a clear 400 error — it never silently truncates (a prior
// pattern in this release's own brand-settings/organization-type routes,
// now fixed). Bounds are deliberately generous: they must never break a
// legitimate international name, address, or business name.
//
// This module intentionally does NOT touch any pre-existing R1 field's
// validation (e.g. TravelRequest.title/notes) — this remediation's stated
// scope is the fields introduced or exposed by R2.1 itself.

export interface LengthCheckResult {
  ok: boolean
  error?: string
}

/**
 * Validates `value.length` is within [min, max]. `fieldLabel` is used only
 * in the returned error message. Does not trim — callers trim first so the
 * length check reflects what will actually be stored.
 */
export function checkLength(value: string, fieldLabel: string, max: number, min = 0): LengthCheckResult {
  if (value.length < min) {
    return { ok: false, error: min === 1 ? `${fieldLabel} is required` : `${fieldLabel} must be at least ${min} characters` }
  }
  if (value.length > max) {
    return { ok: false, error: `${fieldLabel} must be at most ${max} characters` }
  }
  return { ok: true }
}

// Generous, internationalization-safe bounds. Never "arbitrarily tiny" —
// long compound/multi-part names, long business names, and long URLs are
// all legitimate.
export const FIELD_LIMITS = {
  PERSON_NAME: 150, // firstName / lastName — some cultures' full names are long
  EMAIL: 254, // RFC 5321 practical maximum
  PHONE: 32,
  DISPLAY_NAME: 200, // trading/display/sender names
  URL: 2048, // logoUrl — browsers commonly support up to ~2000
  COLOR: 32, // "#RRGGBB", "rgba(0,0,0,0.5)", or a named CSS color
  VISA_TYPE: 50,
  REASON: 4000, // admin transition reasons (organization-type, etc.)
} as const

const ISO2_PATTERN = /^[A-Z]{2}$/

/** Strict ISO-3166-1 alpha-2 validation — never silently truncates a
 * 3-letter code down to 2 (which would silently change the destination). */
export function isValidIso2(value: string): boolean {
  return ISO2_PATTERN.test(value)
}
