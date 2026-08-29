export function generateVisaReference(): string {
  const { randomBytes } = require('crypto') as typeof import('crypto')
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = randomBytes(5)
  const year  = new Date().getFullYear().toString().slice(-2)
  let random  = ''
  for (let i = 0; i < 5; i++) random += chars[bytes[i] % chars.length]
  return `WLZ${year}-${random}`
}
