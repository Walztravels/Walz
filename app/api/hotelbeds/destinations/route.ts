import { NextRequest, NextResponse } from 'next/server'

// Popular Hotelbeds destination codes for the activities search autocomplete.
// Code = Hotelbeds zone code. This list covers the most searched destinations.
const DESTINATIONS = [
  // Middle East
  { code: 'DXB', name: 'Dubai',                 countryCode: 'AE' },
  { code: 'AUH', name: 'Abu Dhabi',             countryCode: 'AE' },
  { code: 'DOH', name: 'Doha',                  countryCode: 'QA' },
  { code: 'BEY', name: 'Beirut',                countryCode: 'LB' },
  { code: 'AMM', name: 'Amman',                 countryCode: 'JO' },
  { code: 'MCT', name: 'Muscat',                countryCode: 'OM' },
  { code: 'RUH', name: 'Riyadh',                countryCode: 'SA' },
  { code: 'JED', name: 'Jeddah',                countryCode: 'SA' },
  // Europe
  { code: 'LON', name: 'London',                countryCode: 'GB' },
  { code: 'PAR', name: 'Paris',                 countryCode: 'FR' },
  { code: 'BCN', name: 'Barcelona',             countryCode: 'ES' },
  { code: 'MAD', name: 'Madrid',                countryCode: 'ES' },
  { code: 'ROM', name: 'Rome',                  countryCode: 'IT' },
  { code: 'MIL', name: 'Milan',                 countryCode: 'IT' },
  { code: 'VCE', name: 'Venice',                countryCode: 'IT' },
  { code: 'FLR', name: 'Florence',              countryCode: 'IT' },
  { code: 'AMS', name: 'Amsterdam',             countryCode: 'NL' },
  { code: 'IST', name: 'Istanbul',              countryCode: 'TR' },
  { code: 'ATH', name: 'Athens',                countryCode: 'GR' },
  { code: 'PRG', name: 'Prague',                countryCode: 'CZ' },
  { code: 'VIE', name: 'Vienna',                countryCode: 'AT' },
  { code: 'BER', name: 'Berlin',                countryCode: 'DE' },
  { code: 'MUC', name: 'Munich',                countryCode: 'DE' },
  { code: 'DUS', name: 'Düsseldorf',            countryCode: 'DE' },
  { code: 'ZRH', name: 'Zurich',                countryCode: 'CH' },
  { code: 'GVA', name: 'Geneva',                countryCode: 'CH' },
  { code: 'LIS', name: 'Lisbon',                countryCode: 'PT' },
  { code: 'BRU', name: 'Brussels',              countryCode: 'BE' },
  { code: 'CPH', name: 'Copenhagen',            countryCode: 'DK' },
  { code: 'OSL', name: 'Oslo',                  countryCode: 'NO' },
  { code: 'HEL', name: 'Helsinki',              countryCode: 'FI' },
  { code: 'NCE', name: 'Nice',                  countryCode: 'FR' },
  { code: 'MRS', name: 'Marseille',             countryCode: 'FR' },
  // Spanish islands
  { code: 'TFS', name: 'Tenerife',              countryCode: 'ES' },
  { code: 'PMI', name: 'Mallorca',              countryCode: 'ES' },
  { code: 'IBZ', name: 'Ibiza',                 countryCode: 'ES' },
  { code: 'AGP', name: 'Málaga / Costa del Sol', countryCode: 'ES' },
  // Africa
  { code: 'CAI', name: 'Cairo',                 countryCode: 'EG' },
  { code: 'HRG', name: 'Hurghada',              countryCode: 'EG' },
  { code: 'SSH', name: 'Sharm el-Sheikh',       countryCode: 'EG' },
  { code: 'CPT', name: 'Cape Town',             countryCode: 'ZA' },
  { code: 'ZNZ', name: 'Zanzibar',              countryCode: 'TZ' },
  { code: 'NAI', name: 'Nairobi',               countryCode: 'KE' },
  // Asia
  { code: 'BKK', name: 'Bangkok',               countryCode: 'TH' },
  { code: 'SIN', name: 'Singapore',             countryCode: 'SG' },
  { code: 'NRT', name: 'Tokyo',                 countryCode: 'JP' },
  { code: 'ICN', name: 'Seoul',                 countryCode: 'KR' },
  { code: 'HKG', name: 'Hong Kong',             countryCode: 'HK' },
  { code: 'KUL', name: 'Kuala Lumpur',          countryCode: 'MY' },
  { code: 'DEL', name: 'Delhi',                 countryCode: 'IN' },
  { code: 'BOM', name: 'Mumbai',                countryCode: 'IN' },
  { code: 'MNL', name: 'Manila',                countryCode: 'PH' },
  { code: 'MAL', name: 'Maldives',              countryCode: 'MV' },
  // Oceania
  { code: 'SYD', name: 'Sydney',                countryCode: 'AU' },
  { code: 'MLB', name: 'Melbourne',             countryCode: 'AU' },
  // Americas
  { code: 'NYC', name: 'New York',              countryCode: 'US' },
  { code: 'LAX', name: 'Los Angeles',           countryCode: 'US' },
  { code: 'MIA', name: 'Miami',                 countryCode: 'US' },
  { code: 'MCO', name: 'Orlando',               countryCode: 'US' },
  { code: 'CUN', name: 'Cancun',                countryCode: 'MX' },
  { code: 'BOG', name: 'Bogotá',                countryCode: 'CO' },
  { code: 'LIM', name: 'Lima',                  countryCode: 'PE' },
  { code: 'BUE', name: 'Buenos Aires',          countryCode: 'AR' },
  { code: 'SAO', name: 'São Paulo',             countryCode: 'BR' },
  { code: 'RIO', name: 'Rio de Janeiro',        countryCode: 'BR' },
  { code: 'UIO', name: 'Quito',                 countryCode: 'EC' },
  { code: 'SCL', name: 'Santiago',              countryCode: 'CL' },
  { code: 'TOR', name: 'Toronto',               countryCode: 'CA' },
]

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query')?.trim().toLowerCase()
  if (!query || query.length < 1) return NextResponse.json({ results: [] })

  const results = DESTINATIONS.filter(d =>
    d.name.toLowerCase().includes(query) || d.code.toLowerCase().startsWith(query)
  ).slice(0, 8)

  return NextResponse.json({ results })
}
