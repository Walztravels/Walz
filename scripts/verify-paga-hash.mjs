/**
 * Run: PAGA_HMAC_KEY=<your_key> node scripts/verify-paga-hash.mjs
 *
 * Verifies that our SHA-512 formula matches the hash Paga computed for the
 * test payload provided by Qudus.
 */
import crypto from 'crypto'

const hmacKey = process.env.PAGA_HMAC_KEY
if (!hmacKey) {
  console.error('ERROR: Set PAGA_HMAC_KEY env var before running')
  process.exit(1)
}

// Test params from Qudus's confirmed sample
const ref      = 'WALZ-PAGA-DYNAMIC-1784307155633-LUJA5'
const amount   = '5000'                // integer string
const currency = 'NGN'
const phone    = '07033387807'

// SHA-512(ref + amount + currency + phone + key)
const preHash = ref + amount + currency + phone + hmacKey
const computed = crypto.createHash('sha512').update(preHash).digest('hex')

const expected = '9a766f8e734fe7367d3e2d9bb3a78192628e9c3d8e47f68a6231f10077a406857160da4f54a1380ff5c83a427d50dc10734235c5d1ff5cc66c817c066556f1ea'

console.log('\nPre-hash string (key hidden):')
console.log(' ', preHash.replace(hmacKey, '<HMAC_KEY>'))
console.log('\nComputed:', computed)
console.log('Expected:', expected)
console.log('\nMatch:', computed === expected ? '✅ YES — key is correct' : '❌ NO — PAGA_HMAC_KEY in Vercel is wrong')
