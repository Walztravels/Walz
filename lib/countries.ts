export interface Country {
  iso2: string
  name: string
  flag: string
  region: string
}

export const ALL_COUNTRIES: Country[] = [
  // Africa
  { iso2: 'NG', name: 'Nigeria',              flag: '🇳🇬', region: 'Africa' },
  { iso2: 'GH', name: 'Ghana',               flag: '🇬🇭', region: 'Africa' },
  { iso2: 'ZA', name: 'South Africa',         flag: '🇿🇦', region: 'Africa' },
  { iso2: 'KE', name: 'Kenya',               flag: '🇰🇪', region: 'Africa' },
  { iso2: 'EG', name: 'Egypt',               flag: '🇪🇬', region: 'Africa' },
  { iso2: 'ET', name: 'Ethiopia',             flag: '🇪🇹', region: 'Africa' },
  { iso2: 'TZ', name: 'Tanzania',             flag: '🇹🇿', region: 'Africa' },
  { iso2: 'UG', name: 'Uganda',              flag: '🇺🇬', region: 'Africa' },
  { iso2: 'MA', name: 'Morocco',             flag: '🇲🇦', region: 'Africa' },
  { iso2: 'SN', name: 'Senegal',             flag: '🇸🇳', region: 'Africa' },
  { iso2: 'RW', name: 'Rwanda',              flag: '🇷🇼', region: 'Africa' },
  { iso2: 'CI', name: 'Côte d\'Ivoire',      flag: '🇨🇮', region: 'Africa' },
  { iso2: 'CM', name: 'Cameroon',            flag: '🇨🇲', region: 'Africa' },
  { iso2: 'TN', name: 'Tunisia',             flag: '🇹🇳', region: 'Africa' },
  { iso2: 'SC', name: 'Seychelles',          flag: '🇸🇨', region: 'Africa' },
  { iso2: 'MU', name: 'Mauritius',           flag: '🇲🇺', region: 'Africa' },
  { iso2: 'BW', name: 'Botswana',            flag: '🇧🇼', region: 'Africa' },
  { iso2: 'NA', name: 'Namibia',             flag: '🇳🇦', region: 'Africa' },
  { iso2: 'ZM', name: 'Zambia',              flag: '🇿🇲', region: 'Africa' },
  { iso2: 'ZW', name: 'Zimbabwe',            flag: '🇿🇼', region: 'Africa' },
  // Americas
  { iso2: 'US', name: 'United States',        flag: '🇺🇸', region: 'Americas' },
  { iso2: 'CA', name: 'Canada',              flag: '🇨🇦', region: 'Americas' },
  { iso2: 'BR', name: 'Brazil',              flag: '🇧🇷', region: 'Americas' },
  { iso2: 'MX', name: 'Mexico',              flag: '🇲🇽', region: 'Americas' },
  { iso2: 'JM', name: 'Jamaica',             flag: '🇯🇲', region: 'Americas' },
  { iso2: 'BB', name: 'Barbados',            flag: '🇧🇧', region: 'Americas' },
  { iso2: 'TT', name: 'Trinidad & Tobago',   flag: '🇹🇹', region: 'Americas' },
  { iso2: 'AR', name: 'Argentina',           flag: '🇦🇷', region: 'Americas' },
  { iso2: 'CO', name: 'Colombia',            flag: '🇨🇴', region: 'Americas' },
  // Asia
  { iso2: 'AE', name: 'United Arab Emirates',flag: '🇦🇪', region: 'Middle East' },
  { iso2: 'SA', name: 'Saudi Arabia',        flag: '🇸🇦', region: 'Middle East' },
  { iso2: 'QA', name: 'Qatar',               flag: '🇶🇦', region: 'Middle East' },
  { iso2: 'KW', name: 'Kuwait',              flag: '🇰🇼', region: 'Middle East' },
  { iso2: 'BH', name: 'Bahrain',             flag: '🇧🇭', region: 'Middle East' },
  { iso2: 'OM', name: 'Oman',               flag: '🇴🇲', region: 'Middle East' },
  { iso2: 'IN', name: 'India',               flag: '🇮🇳', region: 'Asia' },
  { iso2: 'CN', name: 'China',               flag: '🇨🇳', region: 'Asia' },
  { iso2: 'JP', name: 'Japan',               flag: '🇯🇵', region: 'Asia' },
  { iso2: 'SG', name: 'Singapore',           flag: '🇸🇬', region: 'Asia' },
  { iso2: 'MY', name: 'Malaysia',            flag: '🇲🇾', region: 'Asia' },
  { iso2: 'TH', name: 'Thailand',            flag: '🇹🇭', region: 'Asia' },
  { iso2: 'ID', name: 'Indonesia',           flag: '🇮🇩', region: 'Asia' },
  { iso2: 'PH', name: 'Philippines',         flag: '🇵🇭', region: 'Asia' },
  { iso2: 'VN', name: 'Vietnam',             flag: '🇻🇳', region: 'Asia' },
  { iso2: 'KR', name: 'South Korea',         flag: '🇰🇷', region: 'Asia' },
  { iso2: 'MV', name: 'Maldives',            flag: '🇲🇻', region: 'Asia' },
  { iso2: 'NP', name: 'Nepal',               flag: '🇳🇵', region: 'Asia' },
  { iso2: 'LK', name: 'Sri Lanka',           flag: '🇱🇰', region: 'Asia' },
  { iso2: 'PK', name: 'Pakistan',            flag: '🇵🇰', region: 'Asia' },
  // Europe
  { iso2: 'GB', name: 'United Kingdom',      flag: '🇬🇧', region: 'Europe' },
  { iso2: 'FR', name: 'France',              flag: '🇫🇷', region: 'Europe' },
  { iso2: 'DE', name: 'Germany',             flag: '🇩🇪', region: 'Europe' },
  { iso2: 'IT', name: 'Italy',               flag: '🇮🇹', region: 'Europe' },
  { iso2: 'ES', name: 'Spain',               flag: '🇪🇸', region: 'Europe' },
  { iso2: 'NL', name: 'Netherlands',         flag: '🇳🇱', region: 'Europe' },
  { iso2: 'PT', name: 'Portugal',            flag: '🇵🇹', region: 'Europe' },
  { iso2: 'TR', name: 'Turkey',              flag: '🇹🇷', region: 'Europe' },
  { iso2: 'GR', name: 'Greece',              flag: '🇬🇷', region: 'Europe' },
  { iso2: 'SE', name: 'Sweden',              flag: '🇸🇪', region: 'Europe' },
  { iso2: 'NO', name: 'Norway',              flag: '🇳🇴', region: 'Europe' },
  { iso2: 'CH', name: 'Switzerland',         flag: '🇨🇭', region: 'Europe' },
  { iso2: 'AT', name: 'Austria',             flag: '🇦🇹', region: 'Europe' },
  { iso2: 'BE', name: 'Belgium',             flag: '🇧🇪', region: 'Europe' },
  { iso2: 'PL', name: 'Poland',              flag: '🇵🇱', region: 'Europe' },
  { iso2: 'CZ', name: 'Czech Republic',      flag: '🇨🇿', region: 'Europe' },
  { iso2: 'HU', name: 'Hungary',             flag: '🇭🇺', region: 'Europe' },
  { iso2: 'RO', name: 'Romania',             flag: '🇷🇴', region: 'Europe' },
  { iso2: 'UA', name: 'Ukraine',             flag: '🇺🇦', region: 'Europe' },
  { iso2: 'IE', name: 'Ireland',             flag: '🇮🇪', region: 'Europe' },
  { iso2: 'DK', name: 'Denmark',             flag: '🇩🇰', region: 'Europe' },
  { iso2: 'FI', name: 'Finland',             flag: '🇫🇮', region: 'Europe' },
  { iso2: 'CY', name: 'Cyprus',              flag: '🇨🇾', region: 'Europe' },
  { iso2: 'MT', name: 'Malta',               flag: '🇲🇹', region: 'Europe' },
  { iso2: 'SK', name: 'Slovakia',            flag: '🇸🇰', region: 'Europe' },
  { iso2: 'SI', name: 'Slovenia',            flag: '🇸🇮', region: 'Europe' },
  { iso2: 'HR', name: 'Croatia',             flag: '🇭🇷', region: 'Europe' },
  { iso2: 'EE', name: 'Estonia',             flag: '🇪🇪', region: 'Europe' },
  { iso2: 'LV', name: 'Latvia',              flag: '🇱🇻', region: 'Europe' },
  { iso2: 'LT', name: 'Lithuania',           flag: '🇱🇹', region: 'Europe' },
  { iso2: 'LU', name: 'Luxembourg',          flag: '🇱🇺', region: 'Europe' },
  { iso2: 'IS', name: 'Iceland',             flag: '🇮🇸', region: 'Europe' },
  { iso2: 'LI', name: 'Liechtenstein',       flag: '🇱🇮', region: 'Europe' },
  // Oceania
  { iso2: 'AU', name: 'Australia',           flag: '🇦🇺', region: 'Oceania' },
  { iso2: 'NZ', name: 'New Zealand',         flag: '🇳🇿', region: 'Oceania' },
  { iso2: 'FJ', name: 'Fiji',               flag: '🇫🇯', region: 'Oceania' },
]

export const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Middle East', 'Oceania']

export function getCountryByIso2(iso2: string): Country | undefined {
  return ALL_COUNTRIES.find(c => c.iso2 === iso2)
}

export function searchCountries(query: string): Country[] {
  const q = query.toLowerCase()
  return ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) || c.iso2.toLowerCase().includes(q)
  )
}

export const ADVISORY_CONFIG = {
  1: { label: 'Normal precautions',   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-500'  },
  2: { label: 'Exercise caution',      color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  3: { label: 'Reconsider travel',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  4: { label: 'Do not travel',         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500'    },
} as const

export const RULE_TYPE_CONFIG = {
  visa_free:       { label: 'Visa Free',        color: 'text-green-700',  bg: 'bg-green-100',  badge: '✅' },
  visa_on_arrival: { label: 'Visa on Arrival',  color: 'text-blue-700',   bg: 'bg-blue-100',   badge: '🛬' },
  eta:             { label: 'eTA Required',     color: 'text-indigo-700', bg: 'bg-indigo-100', badge: '📱' },
  evisa:           { label: 'eVisa Required',   color: 'text-purple-700', bg: 'bg-purple-100', badge: '💻' },
  visa_required:   { label: 'Visa Required',    color: 'text-red-700',    bg: 'bg-red-100',    badge: '🛂' },
} as const
