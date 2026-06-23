export function generateVisaReference(): string {
  const year   = new Date().getFullYear().toString().slice(-2)
  const random = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `WLZ${year}-${random}`
}
