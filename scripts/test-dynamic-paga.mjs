/**
 * Run: node --env-file=.env.local scripts/test-dynamic-paga.mjs
 *
 * Makes a real paymentRequest call to Paga Collect API using the fixed
 * single SHA-512 hash formula. Uses live credentials from .env.local.
 * A successful call creates a short-lived NUBAN bank account.
 */
import crypto from 'crypto'

const publicKey = process.env.PAGA_PUBLIC_KEY
const secretKey = process.env.PAGA_SECRET_KEY
const hmacKey   = process.env.PAGA_HMAC_KEY
const baseUrl   = process.env.PAGA_COLLECT_URL ?? 'https://collect.paga.com'

if (!publicKey || !secretKey || !hmacKey) {
  console.error('ERROR: PAGA_PUBLIC_KEY, PAGA_SECRET_KEY, PAGA_HMAC_KEY must be set')
  process.exit(1)
}

const ref      = `WALZ-PAGA-DYNAMIC-${Date.now()}-TEST1`
const amount   = 100          // ₦100 minimum
const currency = 'NGN'
const phone    = '08012345678' // test payer phone

// Single SHA-512 per official Paga Collect API Operations docs
const preHashStr = `${ref}${amount}${currency}${phone}`
const hash = crypto.createHash('sha512').update(preHashStr + hmacKey).digest('hex')

console.log('\n── Request ──────────────────────────────────────────────')
console.log('URL:         ', `${baseUrl}/paymentRequest`)
console.log('referenceNumber:', ref)
console.log('amount:      ', amount)
console.log('currency:    ', currency)
console.log('payerPhone:  ', phone)
console.log('hash-prefix: ', preHashStr)
console.log('hash (hex):  ', hash)

const auth = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`

const payload = {
  referenceNumber: ref,
  amount,
  currency,
  payer: { name: 'Test Customer', phoneNumber: phone },
  payee: { name: 'Walz Travels' },
  expiryDateTimeUTC:        null,
  isSuppressMessages:       false,
  payerCollectionFeeShare:  1.0,
  payeeCollectionFeeShare:  0.0,
  isAllowPartialPayments:   false,
  isAllowOverPayments:      false,
  callBackUrl:              null,
  paymentMethods:           ['BANK_TRANSFER', 'REQUEST_MONEY'],
  displayBankDetailToPayer: false,
  hash,
}

const res  = await fetch(`${baseUrl}/paymentRequest`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', Authorization: auth },
  body:    JSON.stringify(payload),
})
const body = await res.json().catch(() => ({}))

console.log('\n── Response ─────────────────────────────────────────────')
console.log('HTTP status:', res.status)
console.log(JSON.stringify(body, null, 2))

const code = String(body.statusCode ?? body.responseCode ?? '')
if (res.status === 200 && (code === '200' || code === '0' || code === '00')) {
  console.log('\n✅  SUCCESS — dynamic bank account created')
  const acct = body.paymentAccount ?? body.data ?? body
  console.log('Account number:', acct.accountNumber ?? '(check raw response)')
  console.log('Bank name:     ', acct.bankName      ?? '(check raw response)')
} else {
  console.log('\n❌  FAILED')
  console.log('Message:', body.statusMessage ?? body.message ?? body.error ?? '(see raw response)')
}
