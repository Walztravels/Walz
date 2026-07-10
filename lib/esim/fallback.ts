/**
 * eSIM provider fallback orchestration.
 *
 * Airalo is always attempted first. eSIM Access is used only when Airalo
 * produces a supply-side failure AND a pre-synced package mapping exists
 * that confirms an equivalent eSIM Access plan for this exact package.
 *
 * Fallback classification — per spec:
 *  Airalo 422/11  (insufficient credit)   → fallback YES + alert staff
 *  Airalo 422/13  (operator maintenance)  → fallback YES
 *  Airalo 422/33  (out of stock)          → fallback YES
 *  Airalo 422/34  (invalid package)       → fallback YES
 *  Airalo 5xx exhausted                   → fallback YES
 *  Airalo 401     (auth failure)          → fallback NO  — hard stop, alert
 *  Airalo 429 exhausted                   → fallback NO  — hard stop, alert
 *  Unrecognized response shape            → fallback NO  — hard stop, alert
 */

import prisma from '@/lib/db'
import { placeAiraloOrder, alertStaffOfOrderFailure } from './airalo-error'
import { placeEsimAccessOrder }                       from '@/lib/esimaccess'
import type { NormalizedOrderResult, EsimProviderName } from './provider'

// Error codes that indicate a genuine Airalo supply failure and allow fallback.
const AIRALO_FALLBACK_ELIGIBLE_CODES = new Set([11, 13, 33, 34])

/** Returns true when an Airalo failure should trigger a fallback attempt. */
function isFallbackEligible(result: { ok: boolean; errorCode?: number; alertMsg?: string }): boolean {
  if (result.ok) return false
  if (result.errorCode && AIRALO_FALLBACK_ELIGIBLE_CODES.has(result.errorCode)) return true
  // 5xx exhaustion — airalo-error.ts sets needsRetry=false after maxRetries
  // Distinguish from auth (401) failures by absence of known alert codes
  if (!result.errorCode && !result.alertMsg?.includes('401')) return true
  return false
}

/**
 * Look up the pre-synced eSIM Access package ID for a given Airalo package.
 * Returns null if no mapping exists (package not eligible for fallback).
 */
async function getEsimAccessFallbackId(
  airaloPackageId: string,
  locationCode:    string,
): Promise<{ esimAccessPackageId: string; wholesaleUsdAccess: number } | null> {
  const mapping = await prisma.esimPackageMapping.findFirst({
    where: {
      airaloPackageId,
      locationCode:        locationCode.toUpperCase(),
      esimAccessPackageId: { not: null },
      wholesaleUsdAccess:  { not: null },
    },
  })
  if (!mapping?.esimAccessPackageId || mapping.wholesaleUsdAccess == null) return null
  return {
    esimAccessPackageId: mapping.esimAccessPackageId,
    wholesaleUsdAccess:  mapping.wholesaleUsdAccess,
  }
}

export interface FulfillmentInput {
  airaloPackageId: string
  locationCode:    string   // ISO2
  description:     string
  orderRef:        string
  packageCode?:    string   // same as airaloPackageId, for legacy callers
  destination?:    string
  retailUsd?:      number
  customerId?:     string
}

export interface FulfillmentResult extends NormalizedOrderResult {
  provider: EsimProviderName
  fallbackUsed: boolean
}

/**
 * Place an eSIM order with automatic fallback from Airalo to eSIM Access.
 *
 * - Attempts Airalo first (with its internal retry logic)
 * - On eligible failure, checks for a pre-synced eSIM Access package match
 * - Attempts eSIM Access if a match exists
 * - Hard-stops on auth failures and unrecognized error shapes
 * - Never falls back silently — all cross-provider routing is logged
 */
export async function fulfillEsimOrder(input: FulfillmentInput): Promise<FulfillmentResult> {
  const { airaloPackageId, locationCode, description, orderRef } = input

  // ── Step 1: attempt Airalo ─────────────────────────────────────────────────
  const airaloResult = await placeAiraloOrder(airaloPackageId, description)
  console.log(
    `[esim/fallback] Airalo attempt for ${airaloPackageId}: ok=${airaloResult.ok}`,
    airaloResult.errorCode ? `errorCode=${airaloResult.errorCode}` : '',
  )

  if (airaloResult.ok) {
    return {
      ...airaloResult,
      provider:     'airalo',
      fallbackUsed: false,
    }
  }

  // ── Step 2: classify the failure ───────────────────────────────────────────

  // 401 = auth failure — never fall back, this is a configuration emergency
  if (airaloResult.errorCode === 401 || airaloResult.alertMsg?.includes('401')) {
    console.error('[esim/fallback] Airalo 401 — hard stop, no fallback')
    await alertStaffOfOrderFailure({
      orderRef,
      packageCode:  airaloPackageId,
      destination:  input.destination ?? locationCode,
      retailUsd:    input.retailUsd ?? 0,
      customerId:   input.customerId,
      reason:       'Airalo authentication failed (401). All eSIM orders are blocked.',
      alertMsg:     airaloResult.alertMsg,
    })
    return {
      ...airaloResult,
      provider:            'airalo',
      fallbackUsed:        false,
      isFallbackEligible:  false,
    }
  }

  // Staff alert on code 11 (insufficient credit) regardless of fallback outcome
  if (airaloResult.errorCode === 11) {
    await alertStaffOfOrderFailure({
      orderRef,
      packageCode:  airaloPackageId,
      destination:  input.destination ?? locationCode,
      retailUsd:    input.retailUsd ?? 0,
      customerId:   input.customerId,
      reason:       'Airalo insufficient credit (code 11). Attempting eSIM Access fallback.',
      alertMsg:     airaloResult.alertMsg,
    })
  }

  if (!isFallbackEligible(airaloResult)) {
    console.error('[esim/fallback] Airalo non-eligible failure:', airaloResult.errorCode)
    return {
      ...airaloResult,
      provider:            'airalo',
      fallbackUsed:        false,
      isFallbackEligible:  false,
    }
  }

  // ── Step 3: check for a pre-synced eSIM Access equivalent ──────────────────
  const mapping = await getEsimAccessFallbackId(airaloPackageId, locationCode)
  if (!mapping) {
    console.warn(
      `[esim/fallback] Airalo failed but no eSIM Access mapping for ${airaloPackageId} (${locationCode}) — no fallback available`,
    )
    return {
      ...airaloResult,
      provider:            'airalo',
      fallbackUsed:        false,
      isFallbackEligible:  false,
      customerMsg:
        airaloResult.customerMsg ??
        'This plan is currently unavailable. Please choose a different package.',
    }
  }

  // ── Step 4: attempt eSIM Access fallback ───────────────────────────────────
  console.log(
    `[esim/fallback] Airalo failed (code ${airaloResult.errorCode}), trying eSIM Access package ${mapping.esimAccessPackageId}`,
  )

  const accessResult = await placeEsimAccessOrder(
    mapping.esimAccessPackageId,
    orderRef,
    description,
  )
  console.log(
    `[esim/fallback] eSIM Access attempt: ok=${accessResult.ok}`,
    accessResult.errorCode ? `errorCode=${accessResult.errorCode}` : '',
  )

  if (accessResult.ok) {
    return {
      ...accessResult,
      provider:     'esimaccess',
      fallbackUsed: true,
      wholesalePaid: mapping.wholesaleUsdAccess,
    }
  }

  // Both providers failed — return combined context
  return {
    ok:           false,
    provider:     'esimaccess',
    fallbackUsed: true,
    errorCode:    accessResult.errorCode,
    errorMsg:     `Airalo: ${airaloResult.errorMsg} | eSIM Access: ${accessResult.errorMsg}`,
    customerMsg:
      'We were unable to process your eSIM with either of our providers. ' +
      'Your payment is safe and our team will manually fulfil your order.',
    alertStaff: true,
    alertMsg:
      `Both providers failed for ${airaloPackageId}. ` +
      `Airalo: ${airaloResult.errorMsg}. eSIM Access: ${accessResult.errorMsg}.`,
  }
}
