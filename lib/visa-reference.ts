export function generateVisaReference(): string {
  // Web Crypto — works in Node 18+ and browsers without the polyfill.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(5)
  globalThis.crypto.getRandomValues(bytes)
  const year  = new Date().getFullYear().toString().slice(-2)
  let random  = ''
  for (let i = 0; i < 5; i++) random += chars[bytes[i] % chars.length]
  return `WLZ${year}-${random}`
}
