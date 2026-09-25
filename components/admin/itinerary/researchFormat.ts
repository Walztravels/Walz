export function fmtTime(iso: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) } catch { return iso }
}
export function fmtDate(iso: string) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) } catch { return iso }
}
export function fmtPrice(amount: number, currency: string, decimals = 0) {
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', NGN: '₦' }
  return `${sym[currency] ?? currency + ' '}${amount.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}
