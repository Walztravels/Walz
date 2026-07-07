// ─── Visa Application Configuration ─────────────────────────────────────────
// Country-specific fees, form fields, visa types, and purpose options.
// All fees are Walz service fees (USD). Government fees shown separately.

export interface VisaCountryConfig {
  destinationIso2: string
  name: string
  flag: string
  visaTypes: string[]
  serviceFeeUsd: number
  govtFeeDisplay: string          // human-readable e.g. "GBP £115"
  govtFeeAmount: number
  govtFeeCurrency: string
  processingDaysMin: number
  processingDaysMax: number
  purposeOptions: string[]
  portOfEntryOptions: string[]
  extraFields: VisaExtraField[]
  notes: string                   // shown on payment page
}

export interface VisaExtraField {
  key: string
  label: string
  type: 'text' | 'boolean' | 'textarea' | 'select'
  options?: string[]
  placeholder?: string
  required?: boolean
  conditional?: string            // show when this key is 'true'
  section: 'travel' | 'country'
}

// ── All 29 Schengen Area members ─────────────────────────────────────────────
// All use the same Schengen (FR) application form and requirements.
export const SCHENGEN_MEMBERS: Record<string, { name: string; flag: string }> = {
  AT: { name: 'Austria',         flag: '🇦🇹' },
  BE: { name: 'Belgium',         flag: '🇧🇪' },
  HR: { name: 'Croatia',         flag: '🇭🇷' },
  CZ: { name: 'Czech Republic',  flag: '🇨🇿' },
  DK: { name: 'Denmark',         flag: '🇩🇰' },
  EE: { name: 'Estonia',         flag: '🇪🇪' },
  FI: { name: 'Finland',         flag: '🇫🇮' },
  FR: { name: 'France',          flag: '🇫🇷' },
  DE: { name: 'Germany',         flag: '🇩🇪' },
  GR: { name: 'Greece',          flag: '🇬🇷' },
  HU: { name: 'Hungary',         flag: '🇭🇺' },
  IS: { name: 'Iceland',         flag: '🇮🇸' },
  IT: { name: 'Italy',           flag: '🇮🇹' },
  LV: { name: 'Latvia',          flag: '🇱🇻' },
  LI: { name: 'Liechtenstein',   flag: '🇱🇮' },
  LT: { name: 'Lithuania',       flag: '🇱🇹' },
  LU: { name: 'Luxembourg',      flag: '🇱🇺' },
  MT: { name: 'Malta',           flag: '🇲🇹' },
  NL: { name: 'Netherlands',     flag: '🇳🇱' },
  NO: { name: 'Norway',          flag: '🇳🇴' },
  PL: { name: 'Poland',          flag: '🇵🇱' },
  PT: { name: 'Portugal',        flag: '🇵🇹' },
  RO: { name: 'Romania',         flag: '🇷🇴' },
  SK: { name: 'Slovakia',        flag: '🇸🇰' },
  SI: { name: 'Slovenia',        flag: '🇸🇮' },
  ES: { name: 'Spain',           flag: '🇪🇸' },
  SE: { name: 'Sweden',          flag: '🇸🇪' },
  CH: { name: 'Switzerland',     flag: '🇨🇭' },
}
export const SCHENGEN_ISO2 = new Set(Object.keys(SCHENGEN_MEMBERS))

// ── Slug → ISO2 (mirrors visa/[country] mapping) ─────────────────────────────
export const SLUG_TO_ISO2: Record<string, string> = {
  uk: 'GB', 'great-britain': 'GB', gb: 'GB',
  canada: 'CA',
  uae: 'AE', 'united-arab-emirates': 'AE',
  // All Schengen slugs resolve to FR (the Schengen form config)
  schengen: 'FR', france: 'FR', germany: 'DE', spain: 'ES', italy: 'IT',
  netherlands: 'NL', portugal: 'PT', belgium: 'BE', austria: 'AT', switzerland: 'CH',
  sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', poland: 'PL',
  'czech-republic': 'CZ', hungary: 'HU', greece: 'GR', romania: 'RO', malta: 'MT',
  croatia: 'HR', estonia: 'EE', latvia: 'LV', liechtenstein: 'LI', lithuania: 'LT',
  luxembourg: 'LU', iceland: 'IS', slovakia: 'SK', slovenia: 'SI',
  usa: 'US', 'united-states': 'US', america: 'US',
  australia: 'AU',
  vietnam: 'VN',
  india: 'IN',
  turkey: 'TR',
  kenya: 'KE',
  egypt: 'EG',
  philippines: 'PH',
  morocco: 'MA',
  'new-zealand': 'NZ',
  'south-africa': 'ZA',
  // Other countries
  nigeria: 'NG', ghana: 'GH', ethiopia: 'ET', tanzania: 'TZ', uganda: 'UG',
  senegal: 'SN', rwanda: 'RW', zambia: 'ZM', zimbabwe: 'ZW', namibia: 'NA',
  botswana: 'BW', 'ivory-coast': 'CI', cameroon: 'CM', tunisia: 'TN',
  'united-kingdom': 'GB', ukraine: 'UA', ireland: 'IE', cyprus: 'CY',
  china: 'CN', japan: 'JP', 'south-korea': 'KR', singapore: 'SG',
  malaysia: 'MY', thailand: 'TH', indonesia: 'ID', pakistan: 'PK',
  'sri-lanka': 'LK', nepal: 'NP',
  brazil: 'BR', argentina: 'AR', mexico: 'MX', colombia: 'CO',
  jamaica: 'JM', barbados: 'BB', trinidad: 'TT',
  'saudi-arabia': 'SA', qatar: 'QA', kuwait: 'KW', bahrain: 'BH', oman: 'OM',
  maldives: 'MV', mauritius: 'MU', seychelles: 'SC',
  fiji: 'FJ',
}

export const ISO2_TO_SLUG: Record<string, string> = {
  GB: 'uk', CA: 'canada', AE: 'uae',
  US: 'usa', AU: 'australia', VN: 'vietnam', IN: 'india',
  TR: 'turkey', KE: 'kenya', EG: 'egypt', PH: 'philippines',
  MA: 'morocco', NZ: 'new-zealand', ZA: 'south-africa',
  NG: 'nigeria', GH: 'ghana', ET: 'ethiopia', TZ: 'tanzania', UG: 'uganda',
  SN: 'senegal', RW: 'rwanda', ZM: 'zambia', ZW: 'zimbabwe', NA: 'namibia',
  BW: 'botswana', CI: 'ivory-coast', CM: 'cameroon', TN: 'tunisia',
  UA: 'ukraine', IE: 'ireland', CY: 'cyprus',
  CN: 'china', JP: 'japan', KR: 'south-korea', SG: 'singapore',
  MY: 'malaysia', TH: 'thailand', ID: 'indonesia', PK: 'pakistan',
  LK: 'sri-lanka', NP: 'nepal',
  BR: 'brazil', AR: 'argentina', MX: 'mexico', CO: 'colombia',
  JM: 'jamaica', BB: 'barbados', TT: 'trinidad',
  SA: 'saudi-arabia', QA: 'qatar', KW: 'kuwait', BH: 'bahrain', OM: 'oman',
  MV: 'maldives', MU: 'mauritius', SC: 'seychelles', FJ: 'fiji',
  // All 29 Schengen countries → same 'schengen' form
  ...Object.fromEntries(Object.keys(SCHENGEN_MEMBERS).map(iso2 => [iso2, 'schengen'])),
}

// ── Country Configs ───────────────────────────────────────────────────────────
export const VISA_CONFIGS: Record<string, VisaCountryConfig> = {
  GB: {
    destinationIso2: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    visaTypes: ['Standard Visitor (Tourist)', 'Business Visitor', 'Family Visit', 'Student Visitor', 'Transit'],
    serviceFeeUsd: 188,
    govtFeeDisplay: 'GBP £115',
    govtFeeAmount: 115,
    govtFeeCurrency: 'GBP',
    processingDaysMin: 15,
    processingDaysMax: 21,
    purposeOptions: ['Tourism / Holiday', 'Business Meeting', 'Visiting Family or Friends', 'Study (short course)', 'Medical Treatment', 'Transit through UK', 'Other'],
    portOfEntryOptions: ['London Heathrow (LHR)', 'London Gatwick (LGW)', 'London Stansted (STN)', 'Manchester (MAN)', 'Birmingham (BHX)', 'Edinburgh (EDI)', 'Glasgow (GLA)', 'Bristol (BRS)', 'Other'],
    extraFields: [
      { key: 'fundsAvailable', label: 'Funds available for trip (GBP)', type: 'text', placeholder: 'e.g. £3,000', required: true, section: 'country' },
      { key: 'fundingSource', label: 'Who is funding your trip?', type: 'select', options: ['Personal savings', 'Employer / Company', 'Family member in UK', 'Family member in home country', 'Sponsor', 'Other'], required: true, section: 'country' },
      { key: 'familyInUK', label: 'Do you have any immediate family in the UK?', type: 'boolean', required: false, section: 'country' },
      { key: 'familyInUKDetails', label: 'Family member name and relationship', type: 'text', placeholder: 'e.g. John Smith (Brother)', conditional: 'familyInUK', section: 'country' },
    ],
    notes: 'Your application will be submitted to the UK Visas and Immigration (UKVI) through VFS Global. The government fee of GBP £115 is paid separately when your application is ready.',
  },
  CA: {
    destinationIso2: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    visaTypes: ['Visitor Visa (TRV)', 'eTA (Electronic Travel Auth)', 'Super Visa', 'Transit Visa'],
    serviceFeeUsd: 145,
    govtFeeDisplay: 'CAD $100',
    govtFeeAmount: 100,
    govtFeeCurrency: 'CAD',
    processingDaysMin: 10,
    processingDaysMax: 20,
    purposeOptions: ['Tourism / Holiday', 'Visiting Family or Friends', 'Business', 'Transit through Canada', 'Medical Treatment', 'Other'],
    portOfEntryOptions: ['Toronto Pearson (YYZ)', 'Vancouver (YVR)', 'Montreal (YUL)', 'Calgary (YYC)', 'Ottawa (YOW)', 'Edmonton (YEG)', 'Halifax (YHZ)', 'Other'],
    extraFields: [
      { key: 'hasSponsor', label: 'Do you have a sponsor or host in Canada?', type: 'boolean', section: 'country' },
      { key: 'sponsorDetails', label: 'Sponsor name, address and immigration status', type: 'textarea', placeholder: 'Full name, Canadian address, immigration status (citizen / PR / visitor)', conditional: 'hasSponsor', section: 'country' },
      { key: 'biometricsGiven', label: 'Have you previously given biometrics for Canada?', type: 'boolean', section: 'country' },
    ],
    notes: 'The Canadian government fee of CAD $100 is paid separately through IRCC when your application is ready for submission.',
  },
  AE: {
    destinationIso2: 'AE',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    visaTypes: ['Tourist Visa (30 days)', 'Tourist Visa (90 days)', 'Business Visa', 'Transit Visa (48hrs)'],
    serviceFeeUsd: 85,
    govtFeeDisplay: 'AED 100–500',
    govtFeeAmount: 100,
    govtFeeCurrency: 'USD',
    processingDaysMin: 3,
    processingDaysMax: 5,
    purposeOptions: ['Tourism / Holiday', 'Business', 'Visiting Family or Friends', 'Transit', 'Other'],
    portOfEntryOptions: ['Dubai International (DXB)', 'Abu Dhabi (AUH)', 'Sharjah (SHJ)', 'Ras Al Khaimah (RKT)', 'Other'],
    extraFields: [
      { key: 'hotelNameDubai', label: 'Hotel name and area in UAE', type: 'text', placeholder: 'e.g. Atlantis The Palm, Dubai Marina', required: false, section: 'country' },
      { key: 'uaeContact', label: 'Contact person in UAE (if any)', type: 'text', placeholder: 'Name and phone number', required: false, section: 'country' },
    ],
    notes: 'UAE e-visa is processed through the General Directorate of Residency and Foreigners Affairs (GDRFA). Government fees vary by visa type.',
  },
  FR: {
    destinationIso2: 'FR',
    name: 'Schengen Area',
    flag: '🇪🇺',
    visaTypes: ['Short-Stay Visa Type C (up to 90 days)', 'Airport Transit Visa Type A', 'Long-Stay National Visa Type D'],
    serviceFeeUsd: 135,
    govtFeeDisplay: 'EUR €90',
    govtFeeAmount: 90,
    govtFeeCurrency: 'EUR',
    processingDaysMin: 10,
    processingDaysMax: 15,
    purposeOptions: ['Tourism / Holiday', 'Business', 'Visiting Family or Friends', 'Cultural / Sports Event', 'Medical Treatment', 'Transit', 'Study (short course)', 'Other'],
    portOfEntryOptions: ['Paris Charles de Gaulle (CDG)', 'Amsterdam Schiphol (AMS)', 'Frankfurt (FRA)', 'Madrid Barajas (MAD)', 'Rome Fiumicino (FCO)', 'Barcelona (BCN)', 'Milan (MXP)', 'Other'],
    extraFields: [
      { key: 'mainSchengenCountry', label: 'Which Schengen country is your main destination?', type: 'select', options: ['France', 'Germany', 'Netherlands', 'Spain', 'Italy', 'Belgium', 'Austria', 'Portugal', 'Switzerland', 'Greece', 'Czech Republic', 'Poland', 'Sweden', 'Denmark', 'Norway', 'Other'], required: true, section: 'country' },
      { key: 'travelInsurancePolicyNo', label: 'Travel insurance policy number', type: 'text', placeholder: 'Policy number from insurer', required: true, section: 'country' },
      { key: 'insuranceCompany', label: 'Insurance company name', type: 'text', placeholder: 'e.g. Allianz, AXA, Aviva', required: true, section: 'country' },
      { key: 'insuranceCoverageEur', label: 'Insurance coverage amount (minimum EUR 30,000)', type: 'text', placeholder: 'e.g. EUR 30,000', required: true, section: 'country' },
    ],
    notes: 'The Schengen visa fee of EUR €90 is paid separately at the VFS Global application centre. Travel insurance covering the full Schengen area with minimum €30,000 coverage is mandatory.',
  },
  US: {
    destinationIso2: 'US',
    name: 'United States of America',
    flag: '🇺🇸',
    visaTypes: ['B-1/B-2 Tourist / Business Visa', 'Transit Visa (C)', 'Student Visa (F-1) Enquiry', 'Work Visa Enquiry'],
    serviceFeeUsd: 220,
    govtFeeDisplay: 'USD $185',
    govtFeeAmount: 185,
    govtFeeCurrency: 'USD',
    processingDaysMin: 15,
    processingDaysMax: 30,
    purposeOptions: ['Tourism / Holiday', 'Business Meeting / Conference', 'Visiting Family or Friends', 'Medical Treatment', 'Transit through USA', 'Other'],
    portOfEntryOptions: ['New York JFK (JFK)', 'Los Angeles (LAX)', 'Chicago O\'Hare (ORD)', 'Miami (MIA)', 'Houston (IAH)', 'Atlanta (ATL)', 'Dallas (DFW)', 'San Francisco (SFO)', 'Other'],
    extraFields: [
      { key: 'socialTwitter', label: 'Twitter / X handle', type: 'text', placeholder: '@username (if any)', required: false, section: 'country' },
      { key: 'socialInstagram', label: 'Instagram handle', type: 'text', placeholder: '@username (if any)', required: false, section: 'country' },
      { key: 'socialFacebook', label: 'Facebook profile URL', type: 'text', placeholder: 'facebook.com/yourname (if any)', required: false, section: 'country' },
      { key: 'socialLinkedIn', label: 'LinkedIn profile URL', type: 'text', placeholder: 'linkedin.com/in/yourname (if any)', required: false, section: 'country' },
      { key: 'previousUSAVisit', label: 'Have you visited the USA before?', type: 'boolean', required: false, section: 'country' },
      { key: 'previousUSAVisitDetails', label: 'When did you last visit and for how long?', type: 'text', placeholder: 'e.g. June 2022, 2 weeks', conditional: 'previousUSAVisit', section: 'country' },
      { key: 'ds160ConfirmationNo', label: 'DS-160 Confirmation Number', type: 'text', placeholder: 'Provided by Walz after we submit your DS-160', required: false, section: 'country' },
    ],
    notes: 'The US visa application fee of USD $185 is paid separately at the US Embassy/Consulate. We handle your DS-160 form submission and appointment booking. Embassy interviews are required.',
  },
  AU: {
    destinationIso2: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    visaTypes: ['Visitor Visa (subclass 600)', 'eVisitor (subclass 651)', 'ETA (subclass 601)'],
    serviceFeeUsd: 165,
    govtFeeDisplay: 'AUD $145',
    govtFeeAmount: 145,
    govtFeeCurrency: 'AUD',
    processingDaysMin: 20,
    processingDaysMax: 30,
    purposeOptions: ['Tourism / Holiday', 'Visiting Family or Friends', 'Business', 'Medical Treatment', 'Other'],
    portOfEntryOptions: ['Sydney (SYD)', 'Melbourne (MEL)', 'Brisbane (BNE)', 'Perth (PER)', 'Adelaide (ADL)', 'Other'],
    extraFields: [],
    notes: 'The Australian visa fee is paid separately through the Department of Home Affairs. Processing times vary — apply at least 6 weeks before travel.',
  },
}

// ── Populate VISA_CONFIGS for every Schengen country (inherit FR base) ────────
// Each non-FR member gets its own name/flag but shares all form fields/docs.
;(function () {
  const base = VISA_CONFIGS['FR']
  if (!base) return
  for (const [iso2, { name, flag }] of Object.entries(SCHENGEN_MEMBERS)) {
    if (!VISA_CONFIGS[iso2]) {
      VISA_CONFIGS[iso2] = {
        ...base,
        destinationIso2: iso2,
        name,
        flag,
        notes: `${flag} ${name} is a Schengen member. Your Schengen visa application will follow the standard Schengen requirements. ${base.notes}`,
      }
    }
  }
})()

// ── Fallback for unknown countries ───────────────────────────────────────────
export function getVisaConfig(slugOrIso2: string): VisaCountryConfig | null {
  const iso2 = SLUG_TO_ISO2[slugOrIso2.toLowerCase()] ?? slugOrIso2.toUpperCase()
  return VISA_CONFIGS[iso2] ?? null
}

// ── Application status labels / colours ──────────────────────────────────────
export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft:                  { label: 'Draft',                  color: 'text-gray-600',  bg: 'bg-gray-100',    dot: 'bg-gray-400'   },
  received:               { label: 'Application Received',   color: 'text-blue-700',  bg: 'bg-blue-50',     dot: 'bg-blue-500'   },
  documents_pending:      { label: 'Documents Pending',       color: 'text-amber-700', bg: 'bg-amber-50',    dot: 'bg-amber-500'  },
  under_review:           { label: 'Under Review',            color: 'text-purple-700',bg: 'bg-purple-50',   dot: 'bg-purple-500' },
  ready_to_submit:        { label: 'Ready to Submit',         color: 'text-cyan-700',  bg: 'bg-cyan-50',     dot: 'bg-cyan-500'   },
  submitted_to_embassy:   { label: 'Submitted to Embassy',    color: 'text-indigo-700',bg: 'bg-indigo-50',   dot: 'bg-indigo-500' },
  decision_pending:       { label: 'Decision Pending',        color: 'text-orange-700',bg: 'bg-orange-50',   dot: 'bg-orange-500' },
  approved:               { label: 'Approved ✅',              color: 'text-green-700', bg: 'bg-green-50',    dot: 'bg-green-500'  },
  refused:                { label: 'Refused',                 color: 'text-red-700',   bg: 'bg-red-50',      dot: 'bg-red-500'    },
}

export const STATUS_TIMELINE = [
  'received',
  'documents_pending',
  'under_review',
  'ready_to_submit',
  'submitted_to_embassy',
  'decision_pending',
  'approved',
]

// ── Agents ───────────────────────────────────────────────────────────────────
export const VISA_AGENTS = [
  { id: 'glory', name: 'Glory Nwachuku', role: 'Visa Coordinator' },
  { id: 'oluchi', name: 'Oluchi', role: 'Visa Coordinator' },
  { id: 'unassigned', name: 'Unassigned', role: '' },
]

// ── Reference number generator ───────────────────────────────────────────────
export function generateVisaRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WALZ-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}
