/**
 * Jade Connect eSIM pricing markups.
 * Wholesale → retail with margin bands, rounded up to nearest .99
 */

export function applyMarkup(wholesaleUsd: number): number {
  let retail: number

  if (wholesaleUsd < 5)        retail = wholesaleUsd * 3.5
  else if (wholesaleUsd < 10)  retail = wholesaleUsd * 2.8
  else if (wholesaleUsd < 20)  retail = wholesaleUsd * 2.2
  else                          retail = wholesaleUsd * 1.8

  // Round up to nearest .99
  return Math.ceil(retail) - 0.01
}

export function calcMargin(wholesale: number, retail: number): number {
  return Math.round((retail - wholesale) * 100) / 100
}

/** Build a human-readable data label from GB value */
export function dataLabel(gb: number | null | undefined): string {
  if (!gb || gb === 0) return 'Unlimited'
  if (gb >= 1)         return `${gb} GB`
  return `${Math.round(gb * 1024)} MB`
}

/** Build auth headers for eSIM Access API */
export function esimHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'RT-AccessCode': process.env.ESIM_ACCESS_CODE ?? '',
    'RT-SecretKey':  process.env.ESIM_SECRET_KEY  ?? '',
  }
}

export const ESIM_BASE = 'https://api.esimaccess.com/api/v1'
