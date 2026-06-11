export interface Currency {
  code:   string
  name:   string
  symbol: string
  flag:   string
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar',          symbol: '$',   flag: '🇺🇸' },
  { code: 'GBP', name: 'British Pound',      symbol: '£',   flag: '🇬🇧' },
  { code: 'CAD', name: 'Canadian Dollar',    symbol: 'CA$', flag: '🇨🇦' },
  { code: 'EUR', name: 'Euro',               symbol: '€',   flag: '🇪🇺' },
  { code: 'AED', name: 'UAE Dirham',         symbol: 'د.إ', flag: '🇦🇪' },
  { code: 'NGN', name: 'Nigerian Naira',     symbol: '₦',   flag: '🇳🇬' },
  { code: 'GHS', name: 'Ghanaian Cedi',      symbol: 'GH₵', flag: '🇬🇭' },
  { code: 'AUD', name: 'Australian Dollar',  symbol: 'A$',  flag: '🇦🇺' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R',   flag: '🇿🇦' },
  { code: 'KES', name: 'Kenyan Shilling',    symbol: 'KSh', flag: '🇰🇪' },
  { code: 'JPY', name: 'Japanese Yen',       symbol: '¥',   flag: '🇯🇵' },
]

export const CURRENCY_CODES = CURRENCIES.map(c => c.code)

export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find(c => c.code === code)
}
