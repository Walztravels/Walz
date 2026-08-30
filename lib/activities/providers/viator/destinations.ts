// Viator destination IDs (numeric strings) for common markets.
// These are Viator's own internal IDs — distinct from IATA or HB codes.
// All IDs verified against the Viator Partner API v2 /search/freetext endpoint on 2026-08-30.
// To look up more: POST /search/freetext with searchType DESTINATIONS

export const VIATOR_DEST_MAP: Record<string, string> = {
  // UK & Ireland
  'london':          '737',
  'united kingdom':  '737',
  'uk':              '737',
  'england':         '737',
  'edinburgh':       '739',
  'scotland':        '739',
  'dublin':          '503',
  'ireland':         '503',

  // Spain
  'barcelona':       '562',
  'spain':           '562',
  'madrid':          '566',
  'ibiza':           '4217',
  'mallorca':        '955',
  'majorca':         '955',
  'menorca':         '4216',
  'seville':         '556',
  'granada':         '4853',
  'valencia':        '811',

  // France
  'paris':           '479',
  'france':          '479',

  // Italy
  'rome':            '511',
  'italy':           '511',
  'milan':           '512',
  'milan italy':     '512',
  'venice':          '522',
  'florence':        '519',
  'naples':          '22381',
  'sicily':          '205',
  'sardinia':        '24293',
  'amalfi':          '33601',
  'positano':        '33602',
  'capri':           '4223',

  // Greece
  'athens':          '496',
  'greece':          '496',
  'santorini':       '959',
  'mykonos':         '958',
  'crete':           '960',
  'rhodes':          '4272',
  'corfu':           '4279',

  // Germany
  'berlin':          '488',
  'germany':         '488',
  'munich':          '487',

  // Austria
  'vienna':          '454',
  'austria':         '454',

  // Czech Republic
  'prague':          '462',
  'czech republic':  '462',

  // Hungary
  'budapest':        '499',
  'hungary':         '499',

  // Switzerland
  'zurich':          '577',
  'switzerland':     '577',
  'geneva':          '578',

  // Scandinavia
  'copenhagen':      '463',
  'denmark':         '463',
  'stockholm':       '907',
  'sweden':          '907',
  'oslo':            '902',
  'norway':          '902',
  'helsinki':        '803',
  'finland':         '803',

  // Belgium & Netherlands
  'brussels':        '458',
  'belgium':         '458',
  'amsterdam':       '525',
  'netherlands':     '525',

  // Portugal
  'lisbon':          '538',
  'portugal':        '538',
  'porto':           '26879',

  // Turkey
  'istanbul':        '585',
  'turkey':          '585',
  'cappadocia':      '5609',
  'antalya':         '586',
  'bodrum':          '4292',

  // Middle East
  'dubai':           '828',
  'dubai uae':       '828',
  'uae':             '828',
  'abu dhabi':       '4474',

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
  'toronto':         '623',
  'canada':          '623',
  'vancouver':       '616',

  // Africa
  'cape town':       '318',
  'south africa':    '318',
  'johannesburg':    '314',
  'nairobi':         '5280',
  'kenya':           '5280',
  'zanzibar':        '24350',
  'tanzania':        '24350',
  'dar es salaam':   '22688',
  'serengeti':       '27084',
  'kilimanjaro':     '24050',
  'cairo':           '782',
  'egypt':           '782',
  'marrakech':       '5408',
  'morocco':         '5408',
  'accra':           '5517',
  'ghana':           '5517',
  'lagos':           '24049',
  'nigeria':         '24049',
  'abuja':           '50443',

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
