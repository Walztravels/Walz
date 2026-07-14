export type Provider =
  | 'stripe_eu'
  | 'stripe_non_eu'
  | 'flutterwave'
  | 'virtual_account'
  | 'paga_checkout'
  | 'paga_dynamic'
  | 'paga_persistent'
  | 'paga_direct_debit'

export interface FeeBreakdown {
  baseAmount:  number
  feePercent:  number
  feeFixed:    number
  feeTotal:    number
  totalCharge: number
  currency:    string
  description: string
  capNgn?:     number | null  // non-null when a Naira cap applies
}

export function calculateFee(
  baseAmount: number,
  currency:   string,
  provider:   Provider
): FeeBreakdown {
  let feePercent = 0
  let feeFixed   = 0
  let description = ''
  let capNgn: number | null = null

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

    // ── Paga (NGN only) ──────────────────────────────────────────────────────
    case 'paga_checkout':
      feePercent  = 1.4
      feeFixed    = 0
      capNgn      = 2000
      description = 'Paga Checkout fee (1.4%, max ₦2,000)'
      break

    case 'paga_dynamic':
      feePercent  = 0.75
      feeFixed    = 0
      capNgn      = 1000
      description = 'Paga Dynamic Bank Account fee (0.75%, max ₦1,000)'
      break

    case 'paga_persistent':
      feePercent  = 0.75
      feeFixed    = 0
      capNgn      = 500
      description = 'Paga Persistent Bank Account fee (0.75%, max ₦500)'
      break

    case 'paga_direct_debit':
      feePercent  = 0.1
      feeFixed    = 50      // kobo treated as NGN here — ₦50 flat
      capNgn      = null    // uncapped
      description = 'Paga Direct Debit fee (0.1% + ₦50, no cap)'
      break
  }

  let feeTotal = Math.ceil((baseAmount * feePercent / 100 + feeFixed) * 100) / 100

  // Apply NGN cap for Paga methods
  if (capNgn !== null && currency === 'NGN') {
    feeTotal = Math.min(feeTotal, capNgn)
  }

  const totalCharge = Math.ceil((baseAmount + feeTotal) * 100) / 100

  return { baseAmount, feePercent, feeFixed, feeTotal, totalCharge, currency, description, capNgn }
}

export function formatFeeLabel(fee: FeeBreakdown, sym: string): string {
  const pct   = fee.feePercent > 0 ? `${fee.feePercent}%` : ''
  const fixed = fee.feeFixed   > 0 ? `+ ${sym}${fee.feeFixed.toFixed(2)}` : ''
  const cap   = fee.capNgn != null ? ` (max ₦${fee.capNgn.toLocaleString()})` : ''
  return [pct, fixed].filter(Boolean).join(' ') + cap
}
