// Viator destination IDs (numeric strings) for common markets.
// These are Viator's own internal IDs — distinct from IATA or HB codes.
// Verified against the Viator Partner API v2 taxonomy endpoint.
// To look up more: GET /taxonomy/destinations (returns full tree)

export const VIATOR_DEST_MAP: Record<string, string> = {
  // UK & Europe
  'london':          '77',
  'united kingdom':  '77',
  'uk':              '77',
  'england':         '77',
  'paris':           '479',
  'france':          '479',
  'rome':            '511',
  'italy':           '511',
  'barcelona':       '562',
  'spain':           '562',
  'madrid':          '575',
  'amsterdam':       '525',
  'netherlands':     '525',
  'lisbon':          '678',
  'portugal':        '678',
  'istanbul':        '585',
  'turkey':          '585',

  // Middle East
  'dubai':           '846',
  'dubai uae':       '846',
  'uae':             '846',
  'abu dhabi':       '1020',

  // Asia Pacific
  'tokyo':           '334',
  'japan':           '334',
  'bangkok':         '343',
  'thailand':        '343',
  'singapore':       '353',
  'bali':            '357',
  'indonesia':       '357',

  // Americas
  'new york':        '687',
  'usa':             '687',
  'united states':   '687',
  'toronto':         '648',
  'canada':          '648',
  'vancouver':       '649',

  // Africa
  'cape town':       '1356',
  'south africa':    '1356',
  'johannesburg':    '1357',
  'nairobi':         '1375',
  'kenya':           '1375',
  'zanzibar':        '1385',
  'tanzania':        '1385',
  'dar es salaam':   '1385',
  'serengeti':       '1386',
  'kilimanjaro':     '1387',
  'cairo':           '1369',
  'egypt':           '1369',
  'marrakech':       '1365',
  'morocco':         '1365',
  'accra':           '1370',
  'ghana':           '1370',
  'lagos':           '1373',
  'nigeria':         '1373',
  'abuja':           '1374',

  // Indian Ocean
  'maldives':        '1399',
  'mauritius':       '1392',
  'seychelles':      '1393',
}

export function resolveViatorDestId(name: string): string | null {
  const lower = name.toLowerCase().trim()
  if (VIATOR_DEST_MAP[lower]) return VIATOR_DEST_MAP[lower]
  for (const [key, id] of Object.entries(VIATOR_DEST_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return id
  }
  return null
}
