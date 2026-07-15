/**
 * Paga Collect API integration
 *
 * Environment variables required:
 *   PAGA_PUBLIC_KEY      — your Paga merchant public key
 *   PAGA_SECRET_KEY      — your Paga merchant secret key
 *   PAGA_HMAC_KEY        — your Paga HMAC key (for persistent accounts + webhook)
 *   PAGA_COLLECT_URL     — Collect API base URL, defaults to https://collect.paga.com
 *   PAGA_CHECKOUT_URL    — hosted checkout base URL, defaults to https://checkout.paga.com
 *
 * SECURITY: Do not use in production until credentials have been confirmed rotated
 * after any prior exposure in chat / logs.
 */

import crypto from 'crypto'

// ── Config ───────────────────────────────────────────────────────────────────

function cfg() {
  const publicKey = process.env.PAGA_PUBLIC_KEY
  const secretKey = process.env.PAGA_SECRET_KEY
  const hmacKey   = process.env.PAGA_HMAC_KEY
  const baseUrl     = process.env.PAGA_COLLECT_URL  ?? 'https://collect.paga.com'
  const checkoutUrl = process.env.PAGA_CHECKOUT_URL ?? 'https://checkout.paga.com'
  if (!publicKey || !secretKey)
    throw new Error('PAGA_PUBLIC_KEY and PAGA_SECRET_KEY env vars are required')
  return { publicKey, secretKey, hmacKey: hmacKey ?? '', baseUrl, checkoutUrl }
}

// ── Hash helpers ──────────────────────────────────────────────────────────────

function sha512(...parts: string[]) {
  return crypto.createHash('sha512').update(parts.join('')).digest('hex')
}

function hmacSha512(data: string, key: string) {
  return crypto.createHmac('sha512', key).update(data).digest('hex')
}

/**
 * Authorization header: Basic base64(publicKey:secretKey)
 *
 * Paga Basic Auth uses the RAW secret key as the password — no hashing.
 * SHA-512 is only for the `hash` field in the request body, not for auth.
 */
function basicAuth(publicKey: string, secretKey: string) {
  const credentials = `${publicKey}:${secretKey}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PagaMethod = 'checkout' | 'dynamic' | 'persistent' | 'direct_debit'

export interface PagaResponse {
  responseCode:    string | number | undefined
  responseMessage?: string
  message?:        string
  error?:          string | Record<string, unknown>
  [key: string]:   unknown
}

/**
 * Normalise Paga's response across different endpoint shapes.
 *
 * Confirmed from Vercel logs — Paga Collect uses:
 *   { statusCode: "200", message: "..." }  on success
 *   { statusCode: "401", statusMessage: "..." }  on error
 *
 * We map statusCode → responseCode and statusMessage → message
 * so the rest of the code can use a single shape.
 */
function normalisePagaResponse(raw: unknown, endpoint: string): PagaResponse {
  console.log(`[paga] ${endpoint} raw response:`, JSON.stringify(raw))
  if (typeof raw !== 'object' || raw === null) {
    return { responseCode: 'ERR', message: String(raw) }
  }
  const r = raw as Record<string, unknown>
  const inner = (r.response_body ?? r.response ?? r.data ?? r) as Record<string, unknown>

  // Paga Collect uses statusCode/statusMessage; older endpoints use responseCode/message
  const responseCode = (
    r.statusCode ?? r.responseCode ?? r.response_code ??
    inner.statusCode ?? inner.responseCode ?? inner.response_code
  ) as string | number | undefined

  const message = (
    r.statusMessage ?? r.message ?? r.responseMessage ??
    inner.statusMessage ?? inner.message ?? inner.responseMessage ??
    r.error
  ) as string | undefined

  return { ...r, responseCode, message }
}

export interface PagaDynamicAccountResult {
  accountNumber: string
  bankName:      string
  accountName:   string
  expiresAt?:    string | null
}

export interface PagaPersistentAccountResult {
  accountReference:  string
  accountNumber:     string
  bankName:          string
  accountName:       string
  financialIdentificationNumber?: string
}

export interface PagaVerifyResult {
  responseCode:       string | number
  isPaid:             boolean
  amount?:            number
  currency?:          string
  paymentReference?:  string
  message?:           string
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function isPagaSuccess(res: PagaResponse) {
  const code = String(res.responseCode ?? '')
  // Paga Collect uses statusCode "200"; older business endpoints use "0" or "00"
  return code === '200' || code === '0' || code === '00'
}

/**
 * Fast-fail on Paga authentication errors.
 * Throws immediately with an actionable message so callers do NOT retry.
 *
 * Credential mapping:
 *   PAGA_PUBLIC_KEY  → Basic Auth username (UUID from Paga portal Developer Tools → API Key)
 *   PAGA_SECRET_KEY  → Basic Auth password = sha512(PAGA_SECRET_KEY)
 *                      Must match the live "API Secret Key" from the same portal page.
 */
function assertAuthOk(httpStatus: number, data: PagaResponse, context: string): void {
  const msg = String(data.message ?? '')
  const lc  = msg.toLowerCase()
  const isAuthErr =
    httpStatus === 401 ||
    httpStatus === 403 ||
    lc.includes('incorrect password') ||
    lc.includes('locked') ||
    lc.includes('invalid credential')

  if (!isAuthErr) return

  const isLocked = lc.includes('lock')
  console.error(`[paga] ${context} auth failure (HTTP ${httpStatus}): ${msg}`)

  throw new Error(
    isLocked
      ? `Paga API credential locked (too many failed attempts). ` +
        `Reset API keys at business.paga.com → Developer Tools → API Key.`
      : `Paga authentication failed (HTTP ${httpStatus}): ${msg}. ` +
        `In Vercel: PAGA_PUBLIC_KEY must be your live API public key UUID; ` +
        `PAGA_SECRET_KEY must be your live API secret key (from Paga portal → Developer Tools → API Key).`
  )
}

// ── Fee calculation ───────────────────────────────────────────────────────────

/**
 * Compute Paga processing fee in NGN for a given method and base amount.
 *
 * Paga fee schedule (NGN):
 *   checkout    : 1.4% capped at ₦2,000
 *   dynamic     : 0.75% capped at ₦1,000
 *   persistent  : 0.75% capped at ₦500
 *   direct_debit: 0.1% + ₦50 (no cap)
 */
export function computePagaFeeNgn(method: PagaMethod, amountNgn: number): number {
  switch (method) {
    case 'checkout':
      return Math.min(Math.ceil(amountNgn * 0.014), 2000)
    case 'dynamic':
      return Math.min(Math.ceil(amountNgn * 0.0075), 1000)
    case 'persistent':
      return Math.min(Math.ceil(amountNgn * 0.0075), 500)
    case 'direct_debit':
      return Math.ceil(amountNgn * 0.001) + 50
  }
}

/**
 * Return the cheapest Paga method for a given NGN amount, with fee amounts.
 *
 * Crossover points (approx):
 *   persistent beats dynamic  above ₦66,667  (₦500 cap hit; dynamic still rising)
 *   persistent hits its cap   at ₦66,667
 *   dynamic hits its cap      at ₦133,333
 *   direct_debit beats dynamic above ~₦450k  (0.75% > 0.1% + ₦50 crossover)
 *   direct_debit beats persist above ~₦450k  as well (₦500 flat wins longer)
 */
export function cheapestPagaMethod(amountNgn: number): {
  method: PagaMethod
  feeNgn: number
  allFees: Record<PagaMethod, number>
  recommendation: string
} {
  const methods: PagaMethod[] = ['checkout', 'dynamic', 'persistent', 'direct_debit']
  const allFees = Object.fromEntries(
    methods.map(m => [m, computePagaFeeNgn(m, amountNgn)])
  ) as Record<PagaMethod, number>

  let best: PagaMethod = 'checkout'
  for (const m of methods) {
    if (allFees[m] < allFees[best]) best = m
  }

  const labels: Record<PagaMethod, string> = {
    checkout:    'Paga Checkout (redirect)',
    dynamic:     'Dynamic Bank Account (one-time)',
    persistent:  'Persistent Bank Account (reusable)',
    direct_debit:'Direct Debit',
  }
  const recommendation =
    `Cheapest for ₦${amountNgn.toLocaleString()}: ${labels[best]} — ₦${allFees[best]} fee`

  return { method: best, feeNgn: allFees[best], allFees, recommendation }
}

// ── 1. Checkout ───────────────────────────────────────────────────────────────

/**
 * Build a Paga Checkout redirect URL (browser-hosted payment page).
 *
 * Live endpoint: https://checkout.paga.com/checkout/params
 * Required:  public_key, amount (decimal e.g. "200.00"), email
 * Optional:  currency, payment_reference, charge_url, callback_url,
 *            phone_number, display_image, funding_sources
 *
 * IMPORTANT: The checkout URL carries NO hash. The SHA-512 hash in the Paga
 * checkout flow is only used to verify the INCOMING webhook callback Paga
 * sends to callback_url — see verifyPagaWebhookHash() below.
 *
 * After payment Paga redirects to charge_url appending:
 *   ?charge_reference=...&status_message=success&status_code=0
 */
export function buildPagaCheckoutUrl(opts: {
  referenceNumber: string   // → payment_reference
  amountNgn:       number   // formatted as decimal string e.g. "200.00"
  email:           string   // required by Paga
  chargeUrl:       string   // → charge_url  (browser redirect after payment)
  callbackUrl?:    string   // → callback_url (server webhook; use /api/paga/webhook)
  phoneNumber?:    string
  currency?:       string
  fundingSources?: string   // comma-separated: "CARD,PAGA,TRANSFER,AGENT,USSD"
}): string {
  const { publicKey, checkoutUrl } = cfg()
  const currency = opts.currency ?? 'NGN'
  // Paga requires amount in decimal form — integer amounts cause hash mismatches on verify
  const amount = opts.amountNgn.toFixed(2)

  const params = new URLSearchParams({
    public_key:        publicKey,
    amount,
    currency,
    email:             opts.email,
    payment_reference: opts.referenceNumber,
    charge_url:        opts.chargeUrl,
    ...(opts.callbackUrl    ? { callback_url:    opts.callbackUrl }    : {}),
    ...(opts.phoneNumber    ? { phone_number:    opts.phoneNumber }    : {}),
    ...(opts.fundingSources ? { funding_sources: opts.fundingSources } : {}),
  })

  return `${checkoutUrl}/checkout/params?${params.toString()}`
}

// ── 2. Verify ─────────────────────────────────────────────────────────────────

/**
 * Verify a Paga Checkout payment.
 *
 * Uses the dedicated checkout endpoint: POST https://checkout.paga.com/checkout/transaction/verify
 * Requires amount + currency because the checkout API validates them against the original charge.
 * Response: { status_code: 0, status_message: "successful", chargeId, amount, currency }
 */
export async function verifyPagaCheckout(opts: {
  paymentReference: string
  amount:           number
  currency?:        string
}): Promise<PagaVerifyResult> {
  const { publicKey, secretKey, checkoutUrl } = cfg()

  // checkout.paga.com verify does not use Basic Auth — publicKey in body is the credential
  const rawRes = await fetch(`${checkoutUrl}/checkout/transaction/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      paymentReference: opts.paymentReference,
      publicKey,
      amount:           opts.amount,
      currency:         opts.currency ?? 'NGN',
    }),
  })

  const raw = await rawRes.json().catch(() => ({})) as Record<string, unknown>
  console.log('[paga] checkout/transaction/verify raw response:', JSON.stringify(raw))

  // Checkout verify uses { status_code: 0/1/2/401, status_message: "successful" }
  const statusCode = raw.status_code ?? raw.statusCode
  const isPaid     = statusCode === 0 || String(statusCode) === '0'

  return {
    responseCode:     String(statusCode ?? ''),
    isPaid,
    amount:           (raw.amount  ?? opts.amount)   as number,
    currency:         (raw.currency ?? opts.currency ?? 'NGN') as string,
    paymentReference: opts.paymentReference,
    message:          raw.status_message as string | undefined,
  }
}

/**
 * Verify a Paga Collect transaction (dynamic or persistent bank account).
 *
 * Uses the Collect API: POST https://collect.paga.com/verifyTransaction
 */
export async function verifyPagaTransaction(referenceNumber: string): Promise<PagaVerifyResult> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()

  // Hash formula per Paga docs: SHA-512(referenceNumber + hashkey)
  const hash = sha512(referenceNumber, hmacKey)
  const auth = basicAuth(publicKey, secretKey)

  const rawRes = await fetch(`${baseUrl}/verifyTransaction`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body:    JSON.stringify({ referenceNumber, hash }),
  })

  const data = normalisePagaResponse(await rawRes.json().catch(() => ({})), 'verifyTransaction')
  assertAuthOk(rawRes.status, data, 'verifyTransaction')
  const isPaid = isPagaSuccess(data)

  return {
    responseCode:     data.responseCode ?? '',
    isPaid,
    amount:           data.totalAmount as number | undefined,
    currency:         (data.currency as string | undefined) ?? 'NGN',
    paymentReference: data.paymentReference as string | undefined,
    message:          data.message,
  }
}

// ── 3. Webhook Hash Verification ─────────────────────────────────────────────

/**
 * Verify a Paga webhook notification using the HMAC key.
 * Call this inside your webhook handler before trusting the payload.
 *
 * Hash formula: SHA-512(amount + timestamp + paymentReference + hmacKey)
 */
export function verifyPagaWebhookHash(opts: {
  amount:           string | number
  timestamp:        string
  paymentReference: string
  receivedHash:     string
}): boolean {
  const { hmacKey } = cfg()
  const expected = sha512(
    String(opts.amount),
    opts.timestamp,
    opts.paymentReference,
    hmacKey,
  )
  return expected === opts.receivedHash
}

// ── 4. Dynamic Bank Account (one-time) ───────────────────────────────────────

/**
 * Create a Dynamic Payment Identifier — a one-time bank account tied to
 * a specific transaction. Expires after ~24 hours or once the payment is made.
 *
 * Fee: 0.75% capped at ₦1,000
 */
export async function createDynamicBankAccount(opts: {
  referenceNumber: string
  amountNgn:       number
  customerId?:     string
  customerEmail?:  string
  description?:    string
  currency?:       string
}): Promise<PagaDynamicAccountResult> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()
  const currency   = opts.currency   ?? 'NGN'
  const customerId = opts.customerId ?? opts.customerEmail ?? opts.referenceNumber

  // Hash formula per Paga docs: SHA-512(referenceNumber + amount + currency + customerId + hashKey)
  const hash = sha512(
    opts.referenceNumber,
    String(opts.amountNgn),
    currency,
    customerId,
    hmacKey,
  )
  const auth = basicAuth(publicKey, secretKey)

  const rawRes = await fetch(`${baseUrl}/paymentRequest`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      referenceNumber:  opts.referenceNumber,
      amount:           opts.amountNgn,
      currency,
      paymentMethod:    'BANK_TRANSFER',
      customerId,
      description:      opts.description ?? 'Payment',
      hash,
    }),
  })

  const data = normalisePagaResponse(await rawRes.json().catch(() => ({})), 'paymentRequest')
  assertAuthOk(rawRes.status, data, 'paymentRequest')
  if (!isPagaSuccess(data)) {
    const detail = data.message ?? String(data.responseCode ?? rawRes.status)
    throw new Error(`Paga dynamic account error: ${detail}`)
  }

  // Paga returns the account inside paymentAccount, data, or at the top level
  const acct = (data.paymentAccount ?? data.data ?? data) as Record<string, string>
  return {
    accountNumber: (acct.accountNumber ?? acct.account_number) as string,
    bankName:      (acct.bankName      ?? acct.bank_name)      as string,
    accountName:   (acct.accountName   ?? acct.account_name)   as string,
    expiresAt:     (data.expirationTime ?? acct.expiresAt ?? null) as string | null,
  }
}

// ── 5. Persistent Bank Account ────────────────────────────────────────────────

/**
 * Register a Persistent Payment Account — a reusable bank account permanently
 * assigned to one customer. Best for clients who pay repeatedly.
 *
 * Hash formula: HMAC-SHA-512(referenceNumber + financialIdentificationNumber + accountName + hmacKey)
 * Fee: 0.75% capped at ₦500
 */
export async function registerPersistentBankAccount(opts: {
  referenceNumber:  string
  accountName:      string
  customerEmail?:   string
  customerPhone?:   string
  financialIdentificationNumber?: string // BVN or NIN (required for NGN persistent)
}): Promise<PagaPersistentAccountResult> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()
  const fin = opts.financialIdentificationNumber ?? ''

  const hashData = `${opts.referenceNumber}${fin}${opts.accountName}`
  const hash = hmacSha512(hashData, hmacKey)
  const auth = basicAuth(publicKey, secretKey)

  const rawRes1 = await fetch(`${baseUrl}/registerPersistentPaymentAccount`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      referenceNumber:               opts.referenceNumber,
      accountName:                   opts.accountName,
      financialIdentificationNumber: fin,
      accountReference:              opts.referenceNumber,
      ...(opts.customerEmail ? { customerEmail: opts.customerEmail } : {}),
      ...(opts.customerPhone ? { customerPhone: opts.customerPhone } : {}),
      hash,
    }),
  })

  const data1 = normalisePagaResponse(await rawRes1.json().catch(() => ({})), 'registerPersistentPaymentAccount')
  assertAuthOk(rawRes1.status, data1, 'registerPersistentPaymentAccount')
  if (!isPagaSuccess(data1)) {
    throw new Error(`Paga persistent account error: ${data1.message ?? String(data1.responseCode ?? rawRes1.status)}`)
  }

  const acct1 = (data1.paymentAccount ?? data1.data ?? data1) as Record<string, string>
  return {
    accountReference:              (data1.accountReference ?? acct1.accountReference ?? opts.referenceNumber) as string,
    accountNumber:                 (data1.accountNumber    ?? acct1.accountNumber    ?? acct1.account_number) as string,
    bankName:                      (data1.bankName         ?? acct1.bankName         ?? acct1.bank_name)      as string,
    accountName:                   (data1.accountName      ?? acct1.accountName      ?? opts.accountName)     as string,
    financialIdentificationNumber: fin,
  }
}

/**
 * Retrieve a previously-created Persistent Payment Account by its account reference.
 */
export async function getPersistentBankAccount(accountReference: string): Promise<PagaPersistentAccountResult> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()
  const hash = hmacSha512(accountReference, hmacKey)
  const auth = basicAuth(publicKey, secretKey)

  const rawRes2 = await fetch(`${baseUrl}/getPersistentPaymentAccount`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ accountReference, hash }),
  })

  const data2 = normalisePagaResponse(await rawRes2.json().catch(() => ({})), 'getPersistentPaymentAccount')
  assertAuthOk(rawRes2.status, data2, 'getPersistentPaymentAccount')
  if (!isPagaSuccess(data2)) {
    throw new Error(`Paga get persistent account error: ${data2.message ?? String(data2.responseCode ?? rawRes2.status)}`)
  }

  const acct2 = (data2.paymentAccount ?? data2.data ?? data2) as Record<string, string>
  return {
    accountReference,
    accountNumber: (data2.accountNumber ?? acct2.accountNumber ?? acct2.account_number) as string,
    bankName:      (data2.bankName      ?? acct2.bankName      ?? acct2.bank_name)      as string,
    accountName:   (data2.accountName   ?? acct2.accountName   ?? acct2.account_name)   as string,
  }
}

/**
 * Delete / deactivate a Persistent Payment Account.
 */
export async function deletePersistentBankAccount(accountReference: string): Promise<void> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()
  const hash = hmacSha512(accountReference, hmacKey)
  const auth = basicAuth(publicKey, secretKey)

  const rawRes3 = await fetch(`${baseUrl}/deletePersistentPaymentAccount`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ accountReference, hash }),
  })

  const data3 = normalisePagaResponse(await rawRes3.json().catch(() => ({})), 'deletePersistentPaymentAccount')
  assertAuthOk(rawRes3.status, data3, 'deletePersistentPaymentAccount')
  if (!isPagaSuccess(data3)) {
    throw new Error(`Paga delete persistent account error: ${data3.message ?? String(data3.responseCode ?? rawRes3.status)}`)
  }
}

// ── 6. Direct Debit ───────────────────────────────────────────────────────────

export interface PagaDirectDebitToken {
  mandateReferenceNumber: string
  customerAccountNumber:  string
  bankName?:              string
}

/**
 * Tokenize a Direct Debit mandate — the customer authorizes future charges.
 * Must happen before `chargeDirectDebit`. Triggers a customer notification / OTP flow.
 *
 * Hash formula (tokenize): SHA-512(referenceNumber + clientAccount + amount + currency + sourceAccountNumber + secretKey)
 * Fee: 0.1% + ₦50 per charge (no cap)
 */
export async function tokenizeDirectDebit(opts: {
  referenceNumber:  string
  sourceAccountNumber: string
  bankCode:         string
  amountNgn:        number
  customerName:     string
  customerEmail?:   string
  currency?:        string
  startDate?:       string // YYYY-MM-DD
  endDate?:         string // YYYY-MM-DD
}): Promise<PagaDirectDebitToken> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()
  const currency = opts.currency ?? 'NGN'

  // Hash formula per Paga docs: SHA-512(referenceNumber + clientAccount + amount + currency + sourceAccountNumber + hashKey)
  const hash = sha512(
    opts.referenceNumber,
    publicKey,
    String(opts.amountNgn),
    currency,
    opts.sourceAccountNumber,
    hmacKey,
  )
  const auth = basicAuth(publicKey, secretKey)

  const rawRes4 = await fetch(`${baseUrl}/createDebitMandate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      referenceNumber:      opts.referenceNumber,
      clientAccount:        publicKey,
      amount:               opts.amountNgn,
      currency,
      sourceAccountNumber:  opts.sourceAccountNumber,
      bankCode:             opts.bankCode,
      customerName:         opts.customerName,
      ...(opts.customerEmail ? { customerEmail: opts.customerEmail } : {}),
      ...(opts.startDate    ? { startDate: opts.startDate }         : {}),
      ...(opts.endDate      ? { endDate:   opts.endDate }           : {}),
      hash,
    }),
  })

  const data4 = normalisePagaResponse(await rawRes4.json().catch(() => ({})), 'createDebitMandate')
  assertAuthOk(rawRes4.status, data4, 'createDebitMandate')
  if (!isPagaSuccess(data4)) {
    throw new Error(`Paga direct debit tokenize error: ${data4.message ?? String(data4.responseCode ?? rawRes4.status)}`)
  }

  const mandate = (data4.data ?? data4) as Record<string, string>
  return {
    mandateReferenceNumber: (data4.mandateReferenceNumber ?? mandate.mandateReferenceNumber) as string,
    customerAccountNumber:  opts.sourceAccountNumber,
    bankName:               (data4.bankName ?? mandate.bankName) as string | undefined,
  }
}

/**
 * Charge a previously-tokenized Direct Debit mandate.
 *
 * Hash formula (charge): SHA-512(referenceNumber + clientAccount + amount + currency + mandateReferenceNumber + secretKey)
 */
export async function chargeDirectDebit(opts: {
  referenceNumber:        string
  mandateReferenceNumber: string
  amountNgn:              number
  currency?:              string
  description?:           string
}): Promise<{ transactionId: string; message: string }> {
  const { publicKey, secretKey, hmacKey, baseUrl } = cfg()
  const currency = opts.currency ?? 'NGN'

  // Hash formula per Paga docs: SHA-512(referenceNumber + clientAccount + amount + currency + mandateReferenceNumber + hashKey)
  const hash = sha512(
    opts.referenceNumber,
    publicKey,
    String(opts.amountNgn),
    currency,
    opts.mandateReferenceNumber,
    hmacKey,
  )
  const auth = basicAuth(publicKey, secretKey)

  const rawRes5 = await fetch(`${baseUrl}/performDebitMandatePayment`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      referenceNumber:        opts.referenceNumber,
      clientAccount:          publicKey,
      amount:                 opts.amountNgn,
      currency,
      mandateReferenceNumber: opts.mandateReferenceNumber,
      ...(opts.description ? { description: opts.description } : {}),
      hash,
    }),
  })

  const data5 = normalisePagaResponse(await rawRes5.json().catch(() => ({})), 'performDebitMandatePayment')
  assertAuthOk(rawRes5.status, data5, 'performDebitMandatePayment')
  if (!isPagaSuccess(data5)) {
    throw new Error(`Paga direct debit charge error: ${data5.message ?? String(data5.responseCode ?? rawRes5.status)}`)
  }

  return {
    transactionId: (data5.transactionId ?? data5.referenceNumber) as string,
    message:       data5.message ?? 'Success',
  }
}
