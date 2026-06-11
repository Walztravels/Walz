'use client'

import { useCurrency } from '@/lib/context/CurrencyContext'

interface PriceProps {
  amount:       number
  from?:        string  // currency the amount is priced in (default USD)
  size?:        'sm' | 'md' | 'lg'
  showOriginal?: boolean
  className?:   string
}

const sizeClass = {
  lg: 'text-3xl',
  md: 'text-xl',
  sm: 'text-base',
}

export function Price({
  amount,
  from = 'USD',
  size = 'md',
  showOriginal = false,
  className = '',
}: PriceProps) {
  const { convert, format, selectedCurrency, loading } = useCurrency()

  if (loading) {
    return (
      <span className={`font-bold text-[#C9A84C] ${sizeClass[size]} ${className} animate-pulse`}>
        —
      </span>
    )
  }

  const converted  = convert(amount, from)
  const formatted  = format(converted)

  return (
    <span className={`font-bold text-[#C9A84C] ${sizeClass[size]} ${className}`}>
      {formatted}
      {showOriginal && selectedCurrency !== from && (
        <span className="text-gray-400 text-sm font-normal ml-2">
          (${amount} USD)
        </span>
      )}
    </span>
  )
}
