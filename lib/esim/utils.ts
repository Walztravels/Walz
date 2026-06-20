import type { EsimPackage, CountryGroup } from './types'

export const REGIONS: Record<string, string[]> = {
  Europe:         ['GB','FR','DE','IT','ES','NL','CH','SE','NO','PL','PT','GR','AT','BE','DK','FI','IE','CZ','HU','RO','TR','HR','SK','SI','RS','BG','LT','LV','EE','LU','MT','CY','IS','AL','MK','BA','ME','MD'],
  Asia:           ['JP','KR','SG','MY','TH','ID','VN','PH','IN','CN','HK','TW','LK','BD','KH','MM','MO','BT','MN','NP','LA','BN'],
  'Middle East':  ['AE','SA','QA','KW','BH','OM','JO','IL','IQ','LB','YE','IR'],
  Africa:         ['NG','GH','KE','ZA','TZ','ET','MA','EG','UG','SN','CM','CI','RW','TN','DZ','LY','SD','MZ','AO','ZM','ZW','BW','NA','MU'],
  Americas:       ['US','CA','MX','BR','CO','PE','AR','CL','EC','BO','VE','PY','UY','CR','PA','GT','HN','SV','NI','JM','TT','DO','CU'],
  Oceania:        ['AU','NZ','FJ','PG','WS','TO','VU','SB','KI'],
  Global:         [],
}

const COUNTRY_NAMES: Record<string, string> = {
  GB:'United Kingdom', US:'United States', CA:'Canada', AE:'United Arab Emirates',
  FR:'France', DE:'Germany', IT:'Italy', ES:'Spain', NL:'Netherlands', TR:'Turkey',
  TH:'Thailand', JP:'Japan', KR:'South Korea', SG:'Singapore', MY:'Malaysia',
  ID:'Indonesia', AU:'Australia', NZ:'New Zealand', ZA:'South Africa', GH:'Ghana',
  NG:'Nigeria', KE:'Kenya', EG:'Egypt', MA:'Morocco', BR:'Brazil', MX:'Mexico',
  IN:'India', CN:'China', HK:'Hong Kong', TW:'Taiwan', SA:'Saudi Arabia',
  QA:'Qatar', GR:'Greece', PT:'Portugal', CH:'Switzerland', SE:'Sweden',
  NO:'Norway', PL:'Poland', MV:'Maldives', VN:'Vietnam', PH:'Philippines',
  LK:'Sri Lanka', ET:'Ethiopia', TZ:'Tanzania', CO:'Colombia', KW:'Kuwait',
  BH:'Bahrain', OM:'Oman', JO:'Jordan', AT:'Austria', BE:'Belgium', DK:'Denmark',
  FI:'Finland', IE:'Ireland', CZ:'Czech Republic', HU:'Hungary', RO:'Romania',
  UG:'Uganda', SN:'Senegal', CM:'Cameroon', CI:"Côte d'Ivoire", BD:'Bangladesh',
  KH:'Cambodia', MM:'Myanmar', MO:'Macau', BT:'Bhutan', PE:'Peru', AR:'Argentina',
  CL:'Chile', EC:'Ecuador', BO:'Bolivia', FJ:'Fiji', PG:'Papua New Guinea',
  IL:'Israel', IL2:'Israel', HR:'Croatia', SK:'Slovakia', SI:'Slovenia', RS:'Serbia',
  BG:'Bulgaria', LT:'Lithuania', LV:'Latvia', EE:'Estonia', LU:'Luxembourg',
  MT:'Malta', CY:'Cyprus', IS:'Iceland', AL:'Albania', MK:'North Macedonia',
  BA:'Bosnia and Herzegovina', ME:'Montenegro', MD:'Moldova', MN:'Mongolia',
  NP:'Nepal', LA:'Laos', BN:'Brunei', IQ:'Iraq', LB:'Lebanon', YE:'Yemen',
  IR:'Iran', RW:'Rwanda', TN:'Tunisia', DZ:'Algeria', LY:'Libya', SD:'Sudan',
  MZ:'Mozambique', AO:'Angola', ZM:'Zambia', ZW:'Zimbabwe', BW:'Botswana',
  NA:'Namibia', MU:'Mauritius', VE:'Venezuela', PY:'Paraguay', UY:'Uruguay',
  CR:'Costa Rica', PA:'Panama', GT:'Guatemala', HN:'Honduras', SV:'El Salvador',
  NI:'Nicaragua', JM:'Jamaica', TT:'Trinidad and Tobago', DO:'Dominican Republic',
  CU:'Cuba', WS:'Samoa', TO:'Tonga', VU:'Vanuatu', SB:'Solomon Islands', KI:'Kiribati',
}

export function countryName(iso2: string): string {
  return COUNTRY_NAMES[iso2.toUpperCase()] ?? iso2
}

export function countryFlag(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '🌍'
  const upper  = iso2.toUpperCase()
  const offset = 0x1F1E6 - 0x41
  return [...upper].map(c => String.fromCodePoint(c.charCodeAt(0) + offset)).join('')
}

export function getRegion(iso2: string): string {
  const code = iso2.toUpperCase()
  for (const [region, codes] of Object.entries(REGIONS)) {
    if (codes.includes(code)) return region
  }
  return 'Other'
}

export function formatDuration(days: number): string {
  if (days === 1)  return '1 day'
  if (days === 7)  return '1 week'
  if (days === 14) return '2 weeks'
  if (days === 30) return '30 days'
  return `${days} days`
}

export function formatPrice(usd: number): string {
  if (Number.isInteger(usd)) return `$${usd}`
  return `$${usd.toFixed(2)}`
}

export function groupByCountry(packages: EsimPackage[]): CountryGroup[] {
  const map = new Map<string, CountryGroup>()

  for (const pkg of packages) {
    const code = pkg.locationCode.toUpperCase()
    if (!map.has(code)) {
      map.set(code, {
        code,
        name:     countryName(code),
        flag:     countryFlag(code),
        region:   getRegion(code),
        packages: [],
        minPrice: Infinity,
      })
    }
    const group = map.get(code)!
    group.packages.push(pkg)
    if (pkg.retailUsd < group.minPrice) group.minPrice = pkg.retailUsd
  }

  return Array.from(map.values())
    .map(g => ({ ...g, packages: g.packages.sort((a, b) => a.retailUsd - b.retailUsd) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
