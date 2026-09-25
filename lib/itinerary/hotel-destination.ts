/**
 * City name -> Hotelbeds destination code (client-safe copy of the map used by
 * the legacy research route). travel-search/hotels expects a CODE, not a city.
 */
const CITY_TO_DEST: Record<string, string> = {
  paris: 'PAR', london: 'LON', 'new york': 'NYC', nyc: 'NYC',
  dubai: 'DXB', rome: 'ROM', barcelona: 'BCN', madrid: 'MAD',
  amsterdam: 'AMS', berlin: 'BER', tokyo: 'TYO', singapore: 'SIN',
  sydney: 'SYD', toronto: 'TOR', miami: 'MIA', 'los angeles': 'LAX',
  'san francisco': 'SFO', chicago: 'CHI', bangkok: 'BKK', istanbul: 'IST',
  cairo: 'CAI', 'cape town': 'CPT', johannesburg: 'JNB', nairobi: 'NBI',
  lagos: 'LOS', accra: 'ACC', abidjan: 'ABJ', lisbon: 'LIS',
  vienna: 'VIE', zurich: 'ZRH', stockholm: 'STO', oslo: 'OSL',
  copenhagen: 'CPH', prague: 'PRG', budapest: 'BUD', athens: 'ATH',
  brussels: 'BRU', warsaw: 'WAW', doha: 'DOH', riyadh: 'RUH',
  'abu dhabi': 'AUH', muscat: 'MCT', kuwait: 'KWI', 'kuala lumpur': 'KUL',
  bali: 'DPS', 'hong kong': 'HKG', seoul: 'SEL', beijing: 'BJS',
  shanghai: 'SHA', mumbai: 'BOM', delhi: 'DEL', 'new delhi': 'DEL',
  casablanca: 'CAS', marrakech: 'RAK', 'addis ababa': 'ADD', addis: 'ADD',
  'rio de janeiro': 'RIO', 'sao paulo': 'SAO', 'mexico city': 'MEX',
  'buenos aires': 'BUE', maldives: 'MLE', male: 'MLE', zanzibar: 'ZNZ',
  mauritius: 'MRU', edinburgh: 'EDI', manchester: 'MAN', milan: 'MIL',
  venice: 'VCE', florence: 'FLR', porto: 'OPO', seville: 'SVQ',
  dakar: 'DKR', naples: 'NAP', nice: 'NCE',
  geneva: 'GVA', lyon: 'LYS', frankfurt: 'FRA', munich: 'MUC',
  hamburg: 'HAM', dusseldorf: 'DUS', cologne: 'CGN', 'koh samui': 'USM',
  phuket: 'HKT', 'chiang mai': 'CNX', jakarta: 'CGK',
  manila: 'MNL', 'ho chi minh': 'SGN', hanoi: 'HAN', taipei: 'TPE',
}

const COUNTRY_ALIAS: Record<string, string> = {
  canada: 'toronto', france: 'paris', uk: 'london', england: 'london',
  japan: 'tokyo', thailand: 'bangkok', australia: 'sydney',
  usa: 'new york', 'united states': 'new york', uae: 'dubai',
  germany: 'berlin', spain: 'barcelona', italy: 'rome',
  'south africa': 'cape town', kenya: 'nairobi', ghana: 'accra',
  nigeria: 'lagos', indonesia: 'bali', india: 'delhi',
  china: 'beijing', korea: 'seoul',
}

export function resolveHotelDestCode(destination: string): string {
  const raw = destination.trim()
  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase()
  const lower = raw.toLowerCase()
  const key = COUNTRY_ALIAS[lower] ?? lower
  if (CITY_TO_DEST[key]) return CITY_TO_DEST[key]
  for (const [city, code] of Object.entries(CITY_TO_DEST)) {
    if (key.startsWith(city) || key.includes(city)) return code
  }
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'LON'
}
