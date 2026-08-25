// Viator destination IDs (numeric strings) for common markets.
// These are Viator's own internal IDs — distinct from IATA or HB codes.
// Verified against the Viator Partner API v2 /search/freetext endpoint on 2026-08-25.
// To look up more: POST /search/freetext with searchType DESTINATIONS

export const VIATOR_DEST_MAP: Record<string, string> = {
  // UK & Europe
  'london':          '737',
  'united kingdom':  '737',
  'uk':              '737',
  'england':         '737',
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
  'dubai':           '828',
  'dubai uae':       '828',
  'uae':             '828',
  'abu dhabi':       '1020',

  // Asia Pacific
  'tokyo':           '334',
  'japan':           '334',
  'bangkok':         '343',
  'thailand':        '343',
  'singapore':       '60449',
  'bali':            '98',
  'indonesia':       '98',

  // Americas
  'new york':        '687',
  'usa':             '687',
  'united states':   '687',
  'toronto':         '648',
  'canada':          '648',
  'vancouver':       '649',

  // Africa
  'cape town':       '318',
  'south africa':    '318',
  'johannesburg':    '1357',
  'nairobi':         '5280',
  'kenya':           '5280',
  'zanzibar':        '24350',
  'tanzania':        '24350',
  'dar es salaam':   '24350',
  'serengeti':       '1386',
  'kilimanjaro':     '1387',
  'cairo':           '782',
  'egypt':           '782',
  'marrakech':       '5408',
  'morocco':         '5408',
  'accra':           '5517',
  'ghana':           '5517',
  'lagos':           '24049',
  'nigeria':         '24049',
  'abuja':           '1374',

  // Indian Ocean
  'maldives':        '4672',
  'mauritius':       '4463',
  'seychelles':      '4868',
}

export function resolveViatorDestId(name: string): string | null {
  const lower = name.toLowerCase().trim()
  if (VIATOR_DEST_MAP[lower]) return VIATOR_DEST_MAP[lower]
  for (const [key, id] of Object.entries(VIATOR_DEST_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return id
  }
  return null
}
