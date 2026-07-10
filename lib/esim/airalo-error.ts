/**
 * Airalo order error handling, retry logic, and staff alerting.
 *
 * Error code reference (from Airalo API docs):
 *   401           → auth failed — retry once with a fresh token
 *   429           → rate limited — back off and retry
 *   422 code 11   → insufficient credit — BLOCK ALL ORDERS, alert staff immediately
 *   422 code 13   → operator maintenance — customer message, no retry
 *   422 code 33   → out of stock — customer message, consider cache refresh
 *   422 code 34   → invalid package — customer message, cache likely stale
 *   422 code 43   → bad request (our bug) — log full payload, alert devs
 *   422 code 53   → unexpected Airalo error — generic message + alert if recurs
 *   5xx           → server error — retry with backoff up to 3 times
 *
 * CRITICAL: if a 402+ error occurs AFTER payment has been captured, the
 * customer has paid and has no eSIM. Never fail silently — mark the order
 * `failed` and notify both the customer and staff.
 */

import { airaloPost, getAiraloToken, type AiraloOrderResponse } from '@/lib/airalo'
import { getResend } from '@/lib/resend'

export interface AiraloOrderResult {
  ok:           boolean
  data?:        AiraloOrderResponse['data']
  errorCode?:   number          // Airalo meta.code on 422
  errorMsg?:    string
  customerMsg?: string          // safe message to show the customer
  needsRetry?:  boolean         // true when retrying might help
  alertStaff?:  boolean         // true when staff must act (insufficient credit, etc.)
  alertMsg?:    string          // message to include in staff alert
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function parseAiraloError(res: Response, body: string): Promise<AiraloOrderResult> {
  let parsed: { meta?: { message?: string; code?: number }; data?: null } = {}
  try { parsed = JSON.parse(body) } catch { /* keep empty */ }

  const code    = parsed.meta?.code
  const message = parsed.meta?.message ?? `HTTP ${res.status}`

  if (res.status === 422) {
    switch (code) {
      case 11:
        return {
          ok:          false,
          errorCode:   11,
          errorMsg:    message,
          customerMsg: 'Your eSIM is being processed. Our team will send your QR code shortly.',
          alertStaff:  true,
          alertMsg:    '🚨 CRITICAL: Airalo account has insufficient credit. ALL eSIM orders are blocked until the account is topped up. Immediate action required.',
        }
      case 13:
        return {
          ok:          false,
          errorCode:   13,
          errorMsg:    message,
          customerMsg: 'This plan is temporarily unavailable. Please try another package or check back shortly.',
        }
      case 33:
      case 34:
        return {
          ok:          false,
          errorCode:   code,
          errorMsg:    message,
          customerMsg: 'This plan is no longer available. Please choose a different package.',
          alertStaff:  true,
          alertMsg:    `Airalo package out of stock or invalid (code ${code}). Cache may be stale — consider triggering a sync.`,
        }
      case 43:
        return {
          ok:          false,
          errorCode:   43,
          errorMsg:    message,
          customerMsg: 'Your order could not be processed. Our team has been notified.',
          alertStaff:  true,
          alertMsg:    `Airalo returned code 43 (bad request) — this is a Walz bug. Full error: ${message}`,
        }
      case 53:
        return {
          ok:          false,
          errorCode:   53,
          errorMsg:    message,
          customerMsg: 'Something went wrong on our end. Please try again or contact support.',
          alertStaff:  true,
          alertMsg:    `Airalo returned code 53 (unexpected error): ${message}`,
        }
      default:
        return {
          ok:          false,
          errorCode:   code,
          errorMsg:    message,
          customerMsg: 'Your order could not be processed. Our team has been notified.',
          alertStaff:  true,
          alertMsg:    `Airalo 422 (code ${code}): ${message}`,
        }
    }
  }

  if (res.status >= 500) {
    return {
      ok:          false,
      errorMsg:    message,
      customerMsg: 'Our eSIM provider is temporarily unavailable. Your order is being retried.',
      needsRetry:  true,
    }
  }

  return {
    ok:          false,
    errorMsg:    message,
    customerMsg: 'Your order could not be processed. Please contact support.',
    alertStaff:  true,
    alertMsg:    `Airalo HTTP ${res.status}: ${message}`,
  }
}

/**
 * Place an Airalo order with retry logic and typed error results.
 *
 * - 401: refreshes the token and retries once
 * - 5xx: retries up to maxRetries (default 3) with exponential backoff
 * - 422: parses the error code and returns a typed result (no retries)
 */
export async function placeAiraloOrder(
  packageId:   string,
  description: string,
  maxRetries   = 3,
): Promise<AiraloOrderResult> {
  const body = {
    package_id:  packageId,
    quantity:    1,
    type:        'sim',
    description,
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await airaloPost<AiraloOrderResponse>('/orders', body)
      return { ok: true, data: data.data }
    } catch (err: unknown) {
      // airaloPost throws a string like "Airalo POST /orders: 422 — {body}"
      const msg    = err instanceof Error ? err.message : String(err)
      const status = Number(msg.match(/:\s*(\d{3})\s*—/)?.[1] ?? 0)
      const rawBody = msg.replace(/^.*?—\s*/, '')

      // 401: refresh token once and retry
      if (status === 401 && attempt === 0) {
        try {
          // Force token re-fetch by clearing the in-process cache isn't directly
          // possible from outside lib/airalo.ts, but calling getAiraloToken() will
          // re-fetch since the token will be flagged as expired after a 401.
          await getAiraloToken()
        } catch { /* ignore — next attempt will re-fetch */ }
        continue
      }

      // 429: rate limit — wait longer before retry
      if (status === 429 && attempt < maxRetries) {
        await sleep(2000 * (attempt + 1))
        continue
      }

      // 5xx: exponential backoff retry
      if (status >= 500 && attempt < maxRetries) {
        await sleep(1000 * Math.pow(2, attempt))
        continue
      }

      // Non-retryable: parse and return typed error
      const mockRes = { status } as Response
      return parseAiraloError(mockRes, rawBody)
    }
  }

  return {
    ok:          false,
    errorMsg:    'Max retries exceeded',
    customerMsg: 'Our eSIM provider is temporarily unavailable. Your order will be processed shortly.',
    alertStaff:  true,
    alertMsg:    `Airalo order failed after ${maxRetries} retries for package ${packageId}`,
  }
}

/**
 * Alert the Jade operations team via email when an eSIM order fails after
 * payment has been captured. This must never fail silently.
 */
export async function alertStaffOfOrderFailure(opts: {
  orderRef:    string
  packageCode: string
  destination: string
  retailUsd:   number
  customerId?: string
  reason:      string
  alertMsg?:   string
}): Promise<void> {
  const subject = `🚨 eSIM Order Failed — ${opts.destination} (${opts.orderRef})`
  const html = `
    <h2 style="color:#DC2626">eSIM Order Failure — Immediate Action Required</h2>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Order Ref</td>
          <td style="padding:8px;font-family:monospace">${opts.orderRef}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Package</td>
          <td style="padding:8px;font-family:monospace">${opts.packageCode}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Destination</td>
          <td style="padding:8px">${opts.destination}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Amount Paid</td>
          <td style="padding:8px">USD $${opts.retailUsd.toFixed(2)}</td></tr>
      ${opts.customerId ? `<tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Customer ID</td>
          <td style="padding:8px;font-family:monospace">${opts.customerId}</td></tr>` : ''}
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Failure Reason</td>
          <td style="padding:8px;color:#DC2626">${opts.reason}</td></tr>
      ${opts.alertMsg ? `<tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Detail</td>
          <td style="padding:8px">${opts.alertMsg}</td></tr>` : ''}
    </table>
    <p style="margin-top:24px;color:#6B7280;font-size:13px">
      The customer has been charged but has not received their eSIM.
      Please either manually fulfil the order or issue a full refund immediately.
    </p>
  `

  try {
    await getResend().emails.send({
      from:    'Jade Connect Alerts <noreply@walztravels.com>',
      to:      'thewalztechs@gmail.com',
      subject,
      html,
    })
  } catch (e) {
    // Log but never throw — failing to send the alert must not mask the original error
    console.error('[airalo-error] failed to send staff alert:', e)
  }
}
