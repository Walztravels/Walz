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
  conditional?: string            // show when this key is true
  conditionalFalse?: string       // show when this key is explicitly false
  section: 'personal' | 'family' | 'travel' | 'education' | 'background' | 'country'
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
      // ── Header / Application level (IMM 5257) ────────────────────────────
      { key: 'uciNumber', label: 'UCI Number (from a previous IRCC application, if any)', type: 'text', placeholder: '8 or 10-digit number — leave blank if this is your first IRCC application', section: 'personal' },
      { key: 'serviceLanguage', label: 'Preferred language of service', type: 'select', options: ['English', 'French'], required: true, section: 'personal' },
      // ── Personal (IMM 5257 Page 1) ────────────────────────────────────────
      { key: 'otherNamesUsed', label: 'Other names used (maiden name, alias, etc.)', type: 'text', placeholder: 'Leave blank if none', section: 'personal' },
      { key: 'countryOfBirth', label: 'Country of birth', type: 'text', placeholder: 'e.g. Nigeria', required: true, section: 'personal' },
      // Section 7 — Current country/territory of residence
      { key: 'currentResidenceStatus', label: 'Your status in your current country of residence', type: 'select', options: ['Citizen', 'Permanent Resident', 'Student', 'Worker (work permit)', 'Visitor', 'Refugee / Protected Person', 'Other'], required: true, section: 'personal' },
      { key: 'currentResidenceFrom', label: 'Date you established your current residence (YYYY-MM-DD)', type: 'text', placeholder: 'e.g. 2018-03-01', required: true, section: 'personal' },
      // Section 8 — Previous countries of residence (past 5 years)
      { key: 'livedElsewherePast5Yrs', label: 'In the past 5 years, have you lived in any country (other than your country of citizenship or current residence) for more than 6 months?', type: 'boolean', section: 'personal' },
      { key: 'previousResidencesDetails', label: 'Previous countries/territories of residence — last 5 years', type: 'textarea', placeholder: 'For each: Country | Status (e.g. Student, Worker) | From YYYY-MM-DD | To YYYY-MM-DD\n\nExample:\nUnited Kingdom | Student | 2018-09-01 | 2022-06-30\nGhana | Worker | 2016-04-01 | 2018-08-31', conditional: 'livedElsewherePast5Yrs', section: 'personal' },
      // Section 9 — Country/territory where applying
      { key: 'applyingFromCurrentCountry', label: 'Are you applying from your current country/territory of residence?', type: 'boolean', section: 'personal' },
      { key: 'applyingFromCountryDetails', label: 'Country/territory you are applying from (if different from current residence)', type: 'text', placeholder: 'Country name where you are physically submitting this application', conditionalFalse: 'applyingFromCurrentCountry', section: 'personal' },
      { key: 'dualCitizenship', label: 'Are you a citizen of any other country besides your current nationality?', type: 'boolean', section: 'personal' },
      { key: 'dualCitizenshipCountry', label: 'Other citizenship country', type: 'text', placeholder: 'e.g. United Kingdom', conditional: 'dualCitizenship', section: 'personal' },
      // Marital status details
      { key: 'spouseFamilyName', label: "Current spouse / common-law partner's family name", type: 'text', placeholder: 'Family name as on passport — leave blank if single/divorced/widowed', section: 'personal' },
      { key: 'spouseGivenNames', label: "Current spouse / common-law partner's given name(s)", type: 'text', placeholder: 'All given names', section: 'personal' },
      { key: 'dateOfUnion', label: 'Date of marriage / start of common-law relationship (YYYY-MM-DD)', type: 'text', placeholder: 'YYYY-MM-DD — leave blank if not applicable', section: 'personal' },
      { key: 'previousMarriages', label: 'Have you previously been married or in a common-law relationship (before any current relationship)?', type: 'boolean', section: 'personal' },
      { key: 'previousMarriageDetails', label: 'Previous marriage / partnership details', type: 'textarea', placeholder: 'For each: Full name | DOB | Type of relationship (married/common-law) | From YYYY-MM-DD | To YYYY-MM-DD\n\nExample:\nJane Smith | 1985-04-10 | Married | 2010-05-22 | 2015-03-01', conditional: 'previousMarriages', section: 'personal' },
      // Languages (IMM 5257 Languages section)
      { key: 'nativeLanguage', label: 'Native language / mother tongue', type: 'text', placeholder: 'e.g. Yoruba, Igbo, Hausa', required: true, section: 'personal' },
      { key: 'languagesSpoken', label: 'Ability to communicate in English and/or French', type: 'select', options: ['English only', 'French only', 'Both English and French', 'Neither English nor French'], required: true, section: 'personal' },
      { key: 'languageMostAtEase', label: 'Language you are most at ease in', type: 'text', placeholder: 'e.g. Yoruba, English, French', required: true, section: 'personal' },
      { key: 'proficiencyTestTaken', label: 'Have you taken an English or French proficiency test (IELTS, CELPIP, TEF, DALF, etc.)?', type: 'boolean', section: 'personal' },
      { key: 'proficiencyTestDetails', label: 'Proficiency test — test name, score, and date taken', type: 'text', placeholder: 'e.g. IELTS — overall 7.0 — taken June 2023', conditional: 'proficiencyTestTaken', section: 'personal' },
      // National Identity Document (IMM 5257 National Identity Document section)
      { key: 'hasNationalId', label: 'Do you have a national identity document (other than your passport)?', type: 'boolean', section: 'personal' },
      { key: 'nationalIdNumber', label: 'National ID — document number', type: 'text', placeholder: 'Document number', conditional: 'hasNationalId', section: 'personal' },
      { key: 'nationalIdCountry', label: 'National ID — country or territory of issue', type: 'text', placeholder: 'e.g. Nigeria', conditional: 'hasNationalId', section: 'personal' },
      { key: 'nationalIdIssueDate', label: 'National ID — issue date (YYYY-MM-DD)', type: 'text', placeholder: 'YYYY-MM-DD', conditional: 'hasNationalId', section: 'personal' },
      { key: 'nationalIdExpiry', label: 'National ID — expiry date (YYYY-MM-DD)', type: 'text', placeholder: 'YYYY-MM-DD', conditional: 'hasNationalId', section: 'personal' },
      // US PR Card
      { key: 'usGreenCard', label: 'Are you a lawful Permanent Resident of the United States with a valid green card?', type: 'boolean', section: 'personal' },
      { key: 'usGreenCardNumber', label: 'US green card number', type: 'text', placeholder: 'e.g. A123456789', conditional: 'usGreenCard', section: 'personal' },
      { key: 'usGreenCardExpiry', label: 'US green card expiry date (YYYY-MM-DD)', type: 'text', placeholder: 'YYYY-MM-DD', conditional: 'usGreenCard', section: 'personal' },
      // ── Family Information (IMM 5707) ─────────────────────────────────────
      // Father
      { key: 'fatherFamilyName', label: "Father's family name (surname)", type: 'text', placeholder: 'As on birth certificate', required: true, section: 'family' },
      { key: 'fatherGivenNames', label: "Father's given name(s)", type: 'text', placeholder: 'All given names', required: true, section: 'family' },
      { key: 'fatherDob', label: "Father's date of birth", type: 'text', placeholder: 'YYYY-MM-DD', required: true, section: 'family' },
      { key: 'fatherCountryOfBirth', label: "Father's country of birth", type: 'text', placeholder: 'e.g. Nigeria', required: true, section: 'family' },
      { key: 'fatherCitizenship', label: "Father's current citizenship / nationality", type: 'text', placeholder: 'e.g. Nigerian', required: true, section: 'family' },
      { key: 'fatherCountryOfResidence', label: "Father's current country of residence", type: 'text', placeholder: 'e.g. Nigeria', required: true, section: 'family' },
      { key: 'fatherDeceased', label: 'Has your father passed away?', type: 'boolean', section: 'family' },
      { key: 'fatherYearOfDeath', label: "Father's year of death", type: 'text', placeholder: 'YYYY', conditional: 'fatherDeceased', section: 'family' },
      // Mother
      { key: 'motherFamilyName', label: "Mother's family name (surname)", type: 'text', placeholder: 'As on birth certificate', required: true, section: 'family' },
      { key: 'motherGivenNames', label: "Mother's given name(s)", type: 'text', placeholder: 'All given names', required: true, section: 'family' },
      { key: 'motherDob', label: "Mother's date of birth", type: 'text', placeholder: 'YYYY-MM-DD', required: true, section: 'family' },
      { key: 'motherCountryOfBirth', label: "Mother's country of birth", type: 'text', placeholder: 'e.g. Nigeria', required: true, section: 'family' },
      { key: 'motherCitizenship', label: "Mother's current citizenship / nationality", type: 'text', placeholder: 'e.g. Nigerian', required: true, section: 'family' },
      { key: 'motherCountryOfResidence', label: "Mother's current country of residence", type: 'text', placeholder: 'e.g. Nigeria', required: true, section: 'family' },
      { key: 'motherDeceased', label: 'Has your mother passed away?', type: 'boolean', section: 'family' },
      { key: 'motherYearOfDeath', label: "Mother's year of death", type: 'text', placeholder: 'YYYY', conditional: 'motherDeceased', section: 'family' },
      // Siblings
      { key: 'siblingsDetails', label: 'Siblings — list all brothers and sisters (write "None" if you have none)', type: 'textarea', required: true, placeholder: 'For each sibling provide: Full name | Date of birth (YYYY-MM-DD) | Country of birth | Citizenship | Country of residence\n\nExample:\n1. John Smith | 1990-03-15 | Nigeria | Nigerian | United Kingdom\n2. Mary Smith | 1993-07-22 | Nigeria | Nigerian | Nigeria', section: 'family' },
      // Children
      { key: 'childrenFamilyDetails', label: 'Children — list all (include all ages; write "None" if you have no children)', type: 'textarea', required: true, placeholder: 'For each child provide: Full name | Date of birth (YYYY-MM-DD) | Country of birth | Citizenship | Country of residence\n\nExample:\n1. James Doe | 2015-06-10 | Nigeria | Nigerian | Nigeria', section: 'family' },
      // ── Travel (IMM 5257 Page 3) ──────────────────────────────────────────
      { key: 'tripPayor', label: 'Who is paying for your trip to Canada?', type: 'select', required: true, options: ['Self / My own funds', 'Host or contact in Canada', 'Company / Employer', 'Other person'], section: 'travel' },
      { key: 'tripPayorDetails', label: "If not self — payer's name, address in Canada, phone and relationship to you", type: 'textarea', placeholder: 'Full name\nAddress in Canada\nPhone\nRelationship (e.g. aunt, employer)', section: 'travel' },
      { key: 'fundsAvailableCAD', label: 'Funds available for stay in Canada (CAD)', type: 'text', placeholder: 'e.g. CAD 5,000', required: true, section: 'travel' },
      { key: 'firstVisitToCanada', label: 'Is this your first visit to Canada?', type: 'boolean', section: 'travel' },
      { key: 'previousCanadaVisits', label: 'Details of previous visits to Canada (year, duration, purpose)', type: 'textarea', placeholder: 'e.g.\n2019 — 2 weeks, tourism\n2022 — 10 days, family visit', conditionalFalse: 'firstVisitToCanada', section: 'travel' },
      { key: 'travelingAlone', label: 'Are you traveling to Canada alone?', type: 'boolean', section: 'travel' },
      { key: 'travelCompanions', label: 'Who are you traveling with? (name, DOB, relationship)', type: 'textarea', placeholder: 'e.g.\nJohn Smith (husband), 15 Jan 1985\nMary Smith (daughter), 3 Jun 2015', conditionalFalse: 'travelingAlone', section: 'travel' },
      { key: 'contactInCanadaName', label: 'Contact person in Canada — Full name', type: 'text', placeholder: 'Full name', section: 'travel' },
      { key: 'contactInCanadaAddress', label: "Contact's address in Canada", type: 'text', placeholder: 'Full address in Canada', section: 'travel' },
      { key: 'contactInCanadaRelationship', label: 'Your relationship to this contact', type: 'select', options: ['Friend', 'Relative', 'Business contact', 'Employer', 'Travel agent / agency', 'Other'], section: 'travel' },
      // ── Education (IMM 5257 Page 3) ───────────────────────────────────────
      { key: 'educationLevel', label: 'Highest level of education completed', type: 'select', required: true, options: ['None', 'Primary / Elementary', 'Secondary / High School', 'Apprenticeship / Trade Certificate', 'College / CEGEP', "Bachelor's Degree", "Master's Degree", 'Doctorate / PhD', 'Other'], section: 'education' },
      { key: 'fieldOfStudy', label: 'Field of study', type: 'text', placeholder: 'e.g. Business Administration, Medicine, Engineering', section: 'education' },
      { key: 'employmentHistory10yr', label: 'Employment / activity history for past 10 years — no time gaps allowed', type: 'textarea', required: true, placeholder: 'List all activities from most recent (employment, study, self-employment, unemployment). Example:\n\n2022–present: Software Engineer at XYZ Ltd, Lagos, Nigeria (full-time)\n2019–2022: BSc Computer Science, University of Lagos\n2017–2019: Unemployed (career break)', section: 'education' },
      // ── Background (IMM 5257 Page 4) ──────────────────────────────────────
      { key: 'biometricsGiven', label: 'Have you previously given biometrics for Canada?', type: 'boolean', section: 'background' },
      // Q1a — TB
      { key: 'tbContact', label: 'Q1a — Within the past two years, have you or a family member had tuberculosis of the lungs or been in close contact with a person with tuberculosis?', type: 'boolean', section: 'background' },
      // Q1b — Physical/mental disorder
      { key: 'physicalMentalDisorder', label: 'Q1b — Do you have any physical or mental disorder that would require social and/or health services (other than medication) during a stay in Canada?', type: 'boolean', section: 'background' },
      { key: 'tbOrDisorderDetails', label: 'Q1c — If yes to Q1a or Q1b: provide details and family member name if applicable', type: 'textarea', placeholder: 'Describe the condition, relevant dates, and family member name if applicable', section: 'background' },
      // Q2 — Status/immigration history
      { key: 'overstayedStatus', label: 'Q2a — Have you ever remained beyond the validity of your status, attended school without authorization, or worked without authorization in Canada?', type: 'boolean', section: 'background' },
      { key: 'deniedEntryOtherCountry', label: 'Q2b — Have you ever been refused a visa or permit, denied entry, or ordered to leave Canada or any other country?', type: 'boolean', section: 'background' },
      { key: 'previouslyAppliedToCanada', label: 'Q2c — Have you previously applied to enter or remain in Canada?', type: 'boolean', section: 'background' },
      { key: 'backgroundQ2Details', label: 'Q2d — Details for any "Yes" above (provide dates, countries, outcomes)', type: 'textarea', placeholder: 'Example:\n2b) UK visa refused in 2020 — insufficient funds\n2c) Applied for Canadian study permit in 2019 — approved', section: 'background' },
      // Q3 — Criminal offences
      { key: 'criminalOffenceDetails', label: 'Q3b — Criminal offence details (country, charges, conviction, dates)', type: 'textarea', placeholder: 'Describe: offence type, country, charges, conviction/outcome, and date', conditional: 'criminalRecord', section: 'background' },
      // Q4 — Military/police
      { key: 'militaryService', label: 'Q4a — Have you ever served in any military, militia, civil defence unit, security organization, or police force (including non-obligatory national service, reserve, or volunteer units)?', type: 'boolean', section: 'background' },
      { key: 'militaryServiceDetails', label: 'Q4b — Military / police service — organization, role/rank, country, dates of service', type: 'textarea', placeholder: 'Organization name, your role/rank, country, start and end dates', conditional: 'militaryService', section: 'background' },
      // Q5 — Political violence
      { key: 'politicalOrg', label: 'Q5 — Have you ever been a member of or associated with any political party or other group/organization that has engaged in or advocated violence for political or religious objectives, or that has been associated with criminal activity?', type: 'boolean', section: 'background' },
      // Q6 — Ill-treatment of persons
      { key: 'civilIllTreatment', label: 'Q6 — Have you ever witnessed or participated in the ill-treatment of prisoners or civilians, looting, or desecration of religious buildings?', type: 'boolean', section: 'background' },
      { key: 'hasSponsor', label: 'Do you have a financial sponsor or host in Canada?', type: 'boolean', section: 'background' },
      { key: 'sponsorDetails', label: "Sponsor's name, Canadian address and immigration status", type: 'textarea', placeholder: 'Full name, Canadian address, immigration status (citizen / permanent resident / visitor)', conditional: 'hasSponsor', section: 'background' },
      // ── Contact / Residential address (IMM 5257 Contact section) ─────────────
      { key: 'residentialSameAsMailing', label: 'Is your residential address the same as your mailing/home address entered in the Contact step?', type: 'boolean', section: 'country' },
      { key: 'residentialAddress', label: 'Residential address (if different from mailing address above)', type: 'textarea', placeholder: 'Apt/Unit — Street number and name\nCity, Province/State\nCountry, Postal code', conditionalFalse: 'residentialSameAsMailing', section: 'country' },
      // ── Declaration / Signature (IMM 5257 Page 5) ────────────────────────────
      { key: 'irccContactConsent', label: 'Consent: Do you consent to being contacted by IRCC, or an organisation at IRCC\'s request, in the future?', type: 'boolean', section: 'country' },
      { key: 'signatureName', label: 'Declaration — Type your full legal name as your signature', type: 'text', placeholder: 'Type your full legal name exactly as it appears on your passport', required: true, section: 'country' },
      { key: 'signatureDate', label: 'Signature date (YYYY-MM-DD)', type: 'text', placeholder: 'YYYY-MM-DD', required: true, section: 'country' },
      { key: 'immFormEdition', label: 'IMM form edition (for IRCC tracking — do not change)', type: 'text', placeholder: 'IMM 5257 (06-2019) E', section: 'country' },
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
  info_required:          { label: 'Info Required',            color: 'text-orange-700',bg: 'bg-orange-50',   dot: 'bg-orange-500' },
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
