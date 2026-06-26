export type Provider = 'stripe_eu' | 'stripe_non_eu' | 'flutterwave' | 'virtual_account'

export interface FeeBreakdown {
  baseAmount:  number
  feePercent:  number
  feeFixed:    number
  feeTotal:    number
  totalCharge: number
  currency:    string
  description: string
}

export function calculateFee(
  baseAmount: number,
  currency:   string,
  provider:   Provider
): FeeBreakdown {
  let feePercent = 0
  let feeFixed   = 0
  let description = ''

  switch (provider) {
    case 'stripe_eu':
      feePercent  = 1.4
      feeFixed    = currency === 'EUR' ? 0.25 : 0.20
      description = 'Stripe EU card processing fee'
      break

    case 'stripe_non_eu':
      feePercent  = 2.9
      feeFixed    = 0.30
      description = 'Stripe international card fee'
      break

    case 'flutterwave':
      feePercent  = 1.4
      feeFixed    = 0
      description = 'Flutterwave processing fee'
      break

    case 'virtual_account':
      // FLW adds this fee automatically on their end.
      // We show the estimate so clients know what to expect,
      // but always use the FLW-returned amount as the source of truth.
      feePercent  = 1.4
      feeFixed    = 0
      description = 'Bank transfer processing fee'
      break
  }

  // Round up to nearest penny/kobo so Walz never absorbs a fraction
  const feeTotal    = Math.ceil((baseAmount * feePercent / 100 + feeFixed) * 100) / 100
  const totalCharge = Math.ceil((baseAmount + feeTotal) * 100) / 100

  return { baseAmount, feePercent, feeFixed, feeTotal, totalCharge, currency, description }
}

export function formatFeeLabel(fee: FeeBreakdown, sym: string): string {
  const pct   = fee.feePercent > 0 ? `${fee.feePercent}%` : ''
  const fixed = fee.feeFixed   > 0 ? `+ ${sym}${fee.feeFixed.toFixed(2)}` : ''
  return [pct, fixed].filter(Boolean).join(' ')
}
