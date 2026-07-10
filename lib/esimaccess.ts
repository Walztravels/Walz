/**
 * eSIM Access Partner API client.
 *
 * Base URL:  https://api.esimaccess.com/api/v1/open
 * Auth:      HMAC-SHA256 per-request signature (RT-AccessCode + RT-Timestamp + RT-RequestID + RT-Signature)
 * Responses: { success: boolean, errorCode: string, errorMsg: string | null, obj: T }
 *
 * Key gotchas:
 *  - ALL endpoints are POST, including reads
 *  - /esim/order returns only orderNo; ICCID/QR require a follow-up /esim/query poll
 *  - No smdpAddress field in API — SM-DP+ address is encoded inside qrCodeUrl image
 *  - Prices are integer ×10,000 USD (88000 = $8.80)
 *  - orderNo = "B" + esimTranNo; write ops (topup/cancel) require esimTranNo (no "B")
 */

import { createHmac, randomUUID } from 'crypto'
import { parsePackage }           from '@/lib/esim-pricing'
import type {
  NormalizedOrderResult,
  NormalizedInstallInstructions,
  ProviderPackage,
}                                 from '@/lib/esim/provider'
import { getResend }              from '@/lib/resend'

const ESIM_ACCESS_BASE = 'https://api.esimaccess.com/api/v1'

// ── Authentication ─────────────────────────────────────────────────────────────

function buildHeaders(bodyStr: string): Record<string, string> {
  const accessCode = process.env.ESIM_ACCESS_CODE ?? ''
  // secretKey is the HMAC signing key; fall back to accessCode if not set
  const signingKey = process.env.ESIM_SECRET_KEY ?? accessCode
  const timestamp  = String(Date.now())
  const requestId  = randomUUID()
  const signStr    = timestamp + requestId + accessCode + bodyStr
  const signature  = createHmac('sha256', signingKey)
    .update(signStr)
    .digest('hex')
    .toLowerCase()
  return {
    'Content-Type':  'application/json',
    'RT-AccessCode': accessCode,
    'RT-Timestamp':  timestamp,
    'RT-RequestID':  requestId,
    'RT-Signature':  signature,
  }
}

async function accessPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; errorCode: string; errorMsg: string | null; obj: T }> {
  const bodyStr = JSON.stringify(body)
  const res = await fetch(`${ESIM_ACCESS_BASE}${path}`, {
    method:  'POST',
    headers: buildHeaders(bodyStr),
    body:    bodyStr,
    cache:   'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`eSIM Access ${path}: HTTP ${res.status} — ${text}`)
  }
  return res.json()
}

// ── Error code classification ──────────────────────────────────────────────────

function classifyAccessError(errorCode: string, errorMsg: string | null): NormalizedOrderResult {
  const msg = errorMsg ?? ''
  switch (errorCode) {
    case '401001':
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Our backup eSIM provider is temporarily unavailable.',
        alertStaff:  true,
        alertMsg:    `eSIM Access auth failure (401001): ${msg} — verify ESIM_ACCESS_CODE and ESIM_SECRET_KEY`,
      }
    case '400001':
    case '000105':
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Your order could not be processed via our backup provider.',
        alertStaff:  true,
        alertMsg:    `eSIM Access config error (${errorCode}): ${msg}`,
      }
    case '200007':
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Our backup eSIM provider has insufficient credit. Our team will fulfil your order manually.',
        alertStaff:  true,
        alertMsg:    `eSIM Access balance insufficient (200007) — top up at console.esimaccess.com`,
      }
    case '200002':
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Your order could not be processed via our backup provider.',
        alertStaff:  true,
        alertMsg:    `eSIM Access state error (200002): ${msg}`,
      }
    case '310402':
      // Duplicate transactionId — idempotent; original order stands
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Your order is already being processed.',
        alertStaff:  false,
      }
    case '101013':
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Our backup eSIM provider is temporarily busy. Your order is being reviewed.',
        needsRetry:  true,
      }
    default:
      return {
        ok:          false,
        errorCode,
        errorMsg:    msg,
        customerMsg: 'Your order could not be processed via our backup provider.',
        alertStaff:  true,
        alertMsg:    `eSIM Access error ${errorCode}: ${msg}`,
      }
  }
}

// ── Package catalog ───────────────────────────────────────────────────────────

/**
 * Fetch all eSIM Access packages.
 * Each package's `price` field is an integer ×10,000 USD; parsePackage() divides by 10,000.
 */
export async function fetchAllEsimAccessPackages(locationCode?: string): Promise<ProviderPackage[]> {
  try {
    const body = locationCode ? { locationCode: locationCode.toUpperCase() } : {}
    const res = await accessPost<unknown>('/open/package/list', body)

    console.log('[esimaccess] package list raw response:', JSON.stringify({
      success:   res.success,
      errorCode: res.errorCode,
      errorMsg:  res.errorMsg,
      objType:   Array.isArray(res.obj) ? `array(${(res.obj as unknown[]).length})` : typeof res.obj,
      objSample: Array.isArray(res.obj) ? (res.obj as unknown[]).slice(0, 1) : res.obj,
    }))

    if (!res.success && res.errorCode !== '0') {
      console.error('[esimaccess] package list error:', res.errorCode, res.errorMsg)
      return []
    }

    // Support both top-level array and nested { packageList: [...] } shapes
    let rawArray: unknown[]
    if (Array.isArray(res.obj)) {
      rawArray = res.obj as unknown[]
    } else if (res.obj && typeof res.obj === 'object') {
      const nested = res.obj as Record<string, unknown>
      rawArray = Array.isArray(nested.packageList) ? nested.packageList as unknown[]
               : Array.isArray(nested.packages)    ? nested.packages as unknown[]
               : Array.isArray(nested.data)        ? nested.data as unknown[]
               : []
    } else {
      rawArray = []
    }

    const rawList = rawArray as Record<string, unknown>[]
    const packages: ProviderPackage[] = []

    for (const rec of rawList) {
      // Try locationNetworkList first, then top-level location/locationCode
      const locationList = Array.isArray(rec.locationNetworkList) ? rec.locationNetworkList : []
      const firstLoc     = locationList[0] as Record<string, unknown> | undefined
      const pkgLocCode   = String(
        firstLoc?.locationCode ?? firstLoc?.location
        ?? rec.locationCode ?? rec.location ?? rec.countryCode ?? '',
      ).toUpperCase()

      const finalLocCode = pkgLocCode.length === 2 ? pkgLocCode : (locationCode?.toUpperCase() ?? '')
      if (!finalLocCode || finalLocCode.length !== 2) continue

      const parsed = parsePackage(rec, finalLocCode)
      if (!parsed) continue

      packages.push({
        provider:     'esimaccess',
        packageCode:  parsed.packageCode,
        name:         parsed.name,
        locationCode: parsed.locationCode,
        locationName: parsed.locationName,
        durationDays: parsed.durationDays,
        dataAmountMb: parsed.dataAmount,
        dataLabel:    parsed.dataLabel,
        dataUnit:     parsed.dataUnit,
        wholesaleUsd: parsed.wholesaleUsd,
        isUnlimited:  parsed.dataUnit === 'Unlimited',
        voice:        null,
        text:         null,
        speed:        parsed.speed,
      })
    }

    console.log(`[esimaccess] parsed ${packages.length} packages for ${locationCode ?? 'all'}`)
    return packages
  } catch (err) {
    console.error('[esimaccess] fetchAllEsimAccessPackages failed:', err)
    return []
  }
}

// ── ICCID polling after order placement ───────────────────────────────────────

interface EsimAccessEsimItem {
  iccid?:      string
  qrCodeUrl?:  string
  ac?:         string
  esimTranNo?: string
  smdpStatus?: string
  esimStatus?: string
}

/**
 * Poll /open/esim/query until ICCID is populated or retries are exhausted.
 * eSIM Access provisions asynchronously — typically 3–10 seconds after ordering.
 */
async function pollForIccid(
  orderNo: string,
  maxAttempts = 5,
  delayMs = 3000,
): Promise<{ iccid: string; qrCodeUrl: string; ac: string } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    try {
      const res = await accessPost<{ esimList?: EsimAccessEsimItem[] }>(
        '/open/esim/query',
        { orderNo },
      )
      if (res.success || res.errorCode === '0') {
        const first = res.obj?.esimList?.[0]
        if (first?.iccid) {
          return {
            iccid:    first.iccid,
            qrCodeUrl: first.qrCodeUrl ?? '',
            ac:       first.ac ?? '',
          }
        }
      }
    } catch (e) {
      console.warn(`[esimaccess] query attempt ${attempt + 1}/${maxAttempts} failed:`, e)
    }
  }
  return null
}

// ── Order submission ──────────────────────────────────────────────────────────

interface EsimAccessOrderObj {
  orderNo:       string
  transactionId: string
}

/**
 * Submit an eSIM order to eSIM Access, then poll for the ICCID.
 *
 * /esim/order returns only orderNo. We then call /esim/query up to 5 times
 * (3s apart) to retrieve the ICCID and QR code URL.
 *
 * Note: eSIM Access does not expose smdpAddress as a text field.
 * The SM-DP+ address is encoded inside the qrCodeUrl PNG image.
 */
export async function placeEsimAccessOrder(
  packageCode:   string,
  transactionId: string,
  _description:  string,
): Promise<NormalizedOrderResult> {
  try {
    // Step 1: Place the order
    const orderRes = await accessPost<EsimAccessOrderObj>('/open/esim/order', {
      transactionId,
      packageInfoList: [{ packageCode, count: 1 }],
    })

    if (!orderRes.success && orderRes.errorCode !== '0') {
      return classifyAccessError(orderRes.errorCode, orderRes.errorMsg)
    }

    const orderNo = orderRes.obj?.orderNo ?? ''
    if (!orderNo) {
      return {
        ok:          false,
        errorMsg:    'eSIM Access /esim/order returned no orderNo',
        customerMsg: 'Our backup provider returned an incomplete response.',
        alertStaff:  true,
        alertMsg:    `eSIM Access /esim/order returned no orderNo for transactionId ${transactionId}`,
      }
    }

    console.log(`[esimaccess] order placed: orderNo=${orderNo}, polling for ICCID…`)

    // Step 2: Poll /esim/query until ICCID is ready
    const provisioned = await pollForIccid(orderNo)

    if (!provisioned) {
      // Order exists but ICCID not yet available — eSIM Access webhook will deliver it
      // Return ok=true so the webhook marks the order as 'pending', not 'failed'
      console.warn(
        `[esimaccess] ICCID not yet provisioned for ${orderNo} after polling; customer will receive QR via webhook`,
      )
      return {
        ok:             true,
        provider:       'esimaccess',
        providerOrderId: orderNo,
      }
    }

    return {
      ok:             true,
      provider:       'esimaccess',
      providerOrderId: orderNo,
      iccid:          provisioned.iccid     || undefined,
      qrCodeUrl:      provisioned.qrCodeUrl || undefined,
      activationCode: provisioned.ac        || undefined,
      // No smdpAddress or lpaString — eSIM Access encodes these inside the QR image only
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[esimaccess] placeEsimAccessOrder failed:', msg)
    return {
      ok:          false,
      errorMsg:    msg,
      customerMsg: 'Our backup eSIM provider encountered an error. Your order is being reviewed.',
      alertStaff:  true,
      alertMsg:    `eSIM Access order failed for ${packageCode}: ${msg}`,
    }
  }
}

// ── Install instructions ──────────────────────────────────────────────────────

/**
 * Build normalized install instructions for an eSIM Access order.
 * Since eSIM Access does not return smdpAddress as text, we only have qrCodeUrl.
 * Manual entry is not possible without decoding the QR image.
 */
export function buildEsimAccessInstallInstructions(opts: {
  qrCodeUrl?: string
}): NormalizedInstallInstructions {
  const qrSection = {
    title: 'Install via QR Code',
    qrCodeUrl: opts.qrCodeUrl,
    steps: [
      { stepNumber: 1, text: 'Open Settings on your phone.' },
      { stepNumber: 2, text: 'Go to "Mobile Data" → "Add eSIM" (iPhone) or "Network" → "Add eSIM" (Android).' },
      { stepNumber: 3, text: 'Choose "Scan QR Code" and scan the QR code in this message.' },
      { stepNumber: 4, text: 'Follow the on-screen prompts to complete activation.' },
      { stepNumber: 5, text: 'Activate before you travel, but only switch to this eSIM when you land.' },
    ],
  }

  return {
    provider: 'esimaccess',
    ios:      [qrSection],
    android:  [qrSection],
  }
}

// ── Staff alert helper ─────────────────────────────────────────────────────────

export async function alertStaffOfAccessFailure(opts: {
  orderRef:    string
  packageCode: string
  destination: string
  retailUsd:   number
  customerId?: string
  reason:      string
  alertMsg?:   string
}): Promise<void> {
  const subject = `🚨 eSIM Access Fallback Failed — ${opts.destination} (${opts.orderRef})`
  const html = `
    <h2 style="color:#DC2626">eSIM Access Fallback Failure</h2>
    <p>Both Airalo and eSIM Access failed. Immediate manual fulfillment required.</p>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Order Ref</td>
          <td style="padding:8px;font-family:monospace">${opts.orderRef}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">eSIM Access Package</td>
          <td style="padding:8px;font-family:monospace">${opts.packageCode}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Destination</td>
          <td style="padding:8px">${opts.destination}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Amount Paid</td>
          <td style="padding:8px">USD $${opts.retailUsd.toFixed(2)}</td></tr>
      ${opts.customerId ? `<tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Customer ID</td>
          <td style="padding:8px;font-family:monospace">${opts.customerId}</td></tr>` : ''}
      <tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Reason</td>
          <td style="padding:8px;color:#DC2626">${opts.reason}</td></tr>
      ${opts.alertMsg ? `<tr><td style="padding:8px;font-weight:bold;background:#FEF2F2">Detail</td>
          <td style="padding:8px">${opts.alertMsg}</td></tr>` : ''}
    </table>
  `
  try {
    await getResend().emails.send({
      from:    'Jade Connect Alerts <noreply@walztravels.com>',
      to:      'thewalztechs@gmail.com',
      subject,
      html,
    })
  } catch (e) {
    console.error('[esimaccess] failed to send staff alert:', e)
  }
}
