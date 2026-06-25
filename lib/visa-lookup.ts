// ─── Visa requirement lookup ──────────────────────────────────────────────────
// Static lookup table: passport nationality → destination region → visa rules

export type VisaStatus = 'free' | 'on_arrival' | 'evisa' | 'required'

export interface VisaRule {
  status:          VisaStatus
  visaType?:       string
  cost?:           string
  processingTime?: string
  notes:           string
  canWalzHelp?:    boolean
}

// Map destination city/country string → canonical region key
export function destToRegion(destination: string): string {
  const d = destination.toLowerCase()
  if (/london|edinburgh|manchester|birmingham|bristol|\buk\b|britain/.test(d)) return 'uk'
  if (/paris|nice|lyon|\bfrance\b/.test(d))                                     return 'schengen'
  if (/barcelona|madrid|ibiza|spain/.test(d))                                   return 'schengen'
  if (/rome|milan|venice|florence|italy/.test(d))                               return 'schengen'
  if (/amsterdam|netherlands|holland/.test(d))                                  return 'schengen'
  if (/berlin|munich|frankfurt|germany/.test(d))                                return 'schengen'
  if (/lisbon|porto|portugal/.test(d))                                          return 'schengen'
  if (/athens|santorini|mykonos|greece/.test(d))                                return 'schengen'
  if (/istanbul|turkey/.test(d))                                                return 'turkey'
  if (/dubai|abu dhabi|\buae\b/.test(d))                                        return 'uae'
  if (/accra|\bghana\b/.test(d))                                                return 'ghana'
  if (/nairobi|mombasa|\bkenya\b/.test(d))                                     return 'kenya'
  if (/cape town|johannesburg|durban|south africa/.test(d))                    return 'south_africa'
  if (/marrakech|casablanca|morocco/.test(d))                                   return 'morocco'
  if (/new york|miami|los angeles|chicago|\busa\b|america/.test(d))            return 'usa'
  if (/toronto|vancouver|montreal|\bcanada\b/.test(d))                         return 'canada'
  if (/tokyo|osaka|kyoto|japan/.test(d))                                        return 'japan'
  if (/singapore/.test(d))                                                       return 'singapore'
  if (/bali|jakarta|indonesia/.test(d))                                         return 'indonesia'
  if (/lagos|abuja|nigeria/.test(d))                                            return 'nigeria'
  return 'other'
}

// Normalise passport string to lookup key
export function passportToKey(passport: string): string {
  const p = passport.toLowerCase()
  if (p.includes('nigerian'))                   return 'nigerian'
  if (p.includes('ghanaian') || p.includes('ghana')) return 'ghanaian'
  if (p.includes('british') || p.includes('uk'))     return 'british'
  if (p.includes('south african'))              return 'south_african'
  if (p.includes('kenyan'))                     return 'kenyan'
  if (p.includes('american') || p.includes('usa'))   return 'american'
  if (p.includes('canadian'))                   return 'canadian'
  if (p.includes('indian'))                     return 'indian'
  if (p.includes('ethiopian'))                  return 'ethiopian'
  if (p.includes('zimbabwean'))                 return 'zimbabwean'
  return 'other'
}

// ── Lookup table ──────────────────────────────────────────────────────────────

const RULES: Record<string, Record<string, VisaRule>> = {
  nigerian: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival — no pre-approval needed' },
    ghana:        { status: 'free',                                                               notes: 'ECOWAS — no visa needed' },
    kenya:        { status: 'on_arrival', visaType: 'eVisa', cost: '$52',   processingTime: '1–3 days', notes: 'Apply at evisa.go.ke before travel' },
    south_africa: { status: 'required',   visaType: 'SA Visitor Visa',      cost: 'R1,050',     processingTime: '4–6 weeks',  notes: 'Visit nearest SA High Commission', canWalzHelp: true },
    morocco:      { status: 'required',   cost: '~£25',                     processingTime: '2–4 weeks', notes: 'Apply at Moroccan Embassy', canWalzHelp: true },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview at US Embassy', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'required',   cost: '~£20',                     processingTime: '3–5 days',  notes: 'Apply at Japan Embassy/Consulate', canWalzHelp: true },
    singapore:    { status: 'required',   cost: 'SGD $30',                  processingTime: '3–7 days',  notes: 'Apply via ICA e-services', canWalzHelp: true },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free on arrival' },
    nigeria:      { status: 'free',                                                               notes: 'Home country — no visa needed' },
    other:        { status: 'required',                                                           notes: 'Check requirements with your local embassy' },
  },
  ghanaian: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival' },
    ghana:        { status: 'free',                                                               notes: 'Home country' },
    kenya:        { status: 'free',                                                               notes: 'Visa-free for Ghanaian passport holders' },
    south_africa: { status: 'free',                                                               notes: '30 days visa-free' },
    nigeria:      { status: 'free',                                                               notes: 'ECOWAS — no visa needed' },
    morocco:      { status: 'required',   cost: '~£25',                     processingTime: '2–4 weeks', notes: 'Apply at Moroccan Embassy', canWalzHelp: true },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview at US Embassy', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'required',   cost: '~£20',                     processingTime: '3–5 days',  notes: 'Apply at Japan Embassy', canWalzHelp: true },
    singapore:    { status: 'required',   cost: 'SGD $30',                  processingTime: '3–7 days',  notes: 'Apply via ICA e-services', canWalzHelp: true },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'required',                                                           notes: 'Check requirements with your local embassy' },
  },
  british: {
    uk:           { status: 'free',                                                               notes: 'Home country — no visa needed' },
    schengen:     { status: 'free',                                                               notes: '90 days in any 180-day period (post-Brexit)' },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival — extendable' },
    ghana:        { status: 'on_arrival',                                                         notes: 'Visa on arrival or eVisa available' },
    kenya:        { status: 'evisa',      cost: '$50',                      processingTime: '1–3 days', notes: 'Apply online at etakenya.go.ke' },
    south_africa: { status: 'free',                                                               notes: '90 days visa-free' },
    nigeria:      { status: 'on_arrival', cost: '$100',                                          notes: 'Visa on arrival at Lagos/Abuja airports' },
    morocco:      { status: 'free',                                                               notes: '90 days visa-free' },
    turkey:       { status: 'free',                                                               notes: '90 days visa-free' },
    usa:          { status: 'evisa',      visaType: 'ESTA',                 cost: '$21',         notes: 'Apply at esta.cbp.dhs.gov (allow 72h)' },
    canada:       { status: 'evisa',      visaType: 'eTA',                  cost: 'CAD $7',      notes: 'Apply online before travel' },
    japan:        { status: 'free',                                                               notes: '90 days visa-free' },
    singapore:    { status: 'free',                                                               notes: '30 days visa-free' },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'free',                                                               notes: 'British passport — check specific entry requirements' },
  },
  south_african: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival' },
    ghana:        { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Ghanaian Embassy', canWalzHelp: true },
    kenya:        { status: 'free',                                                               notes: 'Visa-free under reciprocal agreements' },
    south_africa: { status: 'free',                                                               notes: 'Home country' },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian High Commission', canWalzHelp: true },
    morocco:      { status: 'free',                                                               notes: '90 days visa-free' },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'free',                                                               notes: '90 days visa-free' },
    singapore:    { status: 'free',                                                               notes: '30 days visa-free' },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'required',                                                           notes: 'Check requirements with local embassy' },
  },
  kenyan: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival' },
    ghana:        { status: 'on_arrival',                                                         notes: 'Visa on arrival available' },
    kenya:        { status: 'free',                                                               notes: 'Home country' },
    south_africa: { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at SA High Commission', canWalzHelp: true },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian High Commission', canWalzHelp: true },
    morocco:      { status: 'required',                                      processingTime: '2–4 weeks', notes: 'Apply at Moroccan Embassy', canWalzHelp: true },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview at US Embassy', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'required',   cost: '~£20',                     processingTime: '3–5 days',  notes: 'Apply at Japan Embassy', canWalzHelp: true },
    singapore:    { status: 'required',                                      processingTime: '3–7 days',  notes: 'Apply via ICA e-services', canWalzHelp: true },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'required',                                                           notes: 'Check requirements with local embassy' },
  },
  american: {
    uk:           { status: 'free',                                                               notes: '6 months visa-free' },
    schengen:     { status: 'free',                                                               notes: '90 days in any 180-day period' },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival' },
    ghana:        { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Ghanaian Embassy', canWalzHelp: true },
    kenya:        { status: 'evisa',      cost: '$50',                      processingTime: '1–3 days', notes: 'Apply at etakenya.go.ke' },
    south_africa: { status: 'free',                                                               notes: '30 days visa-free' },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian Embassy', canWalzHelp: true },
    morocco:      { status: 'free',                                                               notes: '90 days visa-free' },
    turkey:       { status: 'free',                                                               notes: '90 days visa-free' },
    usa:          { status: 'free',                                                               notes: 'Home country' },
    canada:       { status: 'free',                                                               notes: 'Visa-free for US citizens' },
    japan:        { status: 'free',                                                               notes: '90 days visa-free' },
    singapore:    { status: 'free',                                                               notes: '30 days visa-free' },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'free',                                                               notes: 'US passport — generally strong travel access' },
  },
  canadian: {
    uk:           { status: 'free',                                                               notes: '6 months visa-free' },
    schengen:     { status: 'free',                                                               notes: '90 days in any 180-day period' },
    uae:          { status: 'free',                                                               notes: '30 days visa-free' },
    ghana:        { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Ghanaian Embassy', canWalzHelp: true },
    kenya:        { status: 'evisa',      cost: '$50',                      processingTime: '1–3 days', notes: 'Apply at etakenya.go.ke' },
    south_africa: { status: 'free',                                                               notes: '30 days visa-free' },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian High Commission', canWalzHelp: true },
    morocco:      { status: 'free',                                                               notes: '90 days visa-free' },
    turkey:       { status: 'free',                                                               notes: '90 days visa-free' },
    usa:          { status: 'free',                                                               notes: 'Visa-free for Canadian citizens' },
    canada:       { status: 'free',                                                               notes: 'Home country' },
    japan:        { status: 'free',                                                               notes: '90 days visa-free' },
    singapore:    { status: 'free',                                                               notes: '30 days visa-free' },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'free',                                                               notes: 'Canadian passport — generally strong travel access' },
  },
  indian: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'on_arrival',                                                         notes: 'eVisa or visa on arrival for Indian passport holders' },
    ghana:        { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Ghanaian Embassy', canWalzHelp: true },
    kenya:        { status: 'evisa',      cost: '$50',                      processingTime: '1–3 days', notes: 'Apply at etakenya.go.ke' },
    south_africa: { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at SA High Commission', canWalzHelp: true },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian High Commission', canWalzHelp: true },
    morocco:      { status: 'required',                                      processingTime: '2–4 weeks', notes: 'Apply at Moroccan Embassy', canWalzHelp: true },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'required',   cost: '~£20',                     processingTime: '3–5 days',  notes: 'Apply at Japan Embassy', canWalzHelp: true },
    singapore:    { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival for Indian passport holders' },
    indonesia:    { status: 'on_arrival', cost: '$35',                                           notes: '30 days visa on arrival' },
    other:        { status: 'required',                                                           notes: 'Check requirements with local embassy' },
  },
  ethiopian: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'on_arrival', cost: 'Free',                                          notes: '30 days on arrival' },
    ghana:        { status: 'on_arrival',                                                         notes: 'Visa on arrival available' },
    kenya:        { status: 'free',                                                               notes: 'Visa-free (East African community)' },
    south_africa: { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at SA High Commission', canWalzHelp: true },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian High Commission', canWalzHelp: true },
    morocco:      { status: 'required',                                      processingTime: '2–4 weeks', notes: 'Apply at Moroccan Embassy', canWalzHelp: true },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'required',   cost: '~£20',                     processingTime: '3–5 days',  notes: 'Apply at Japan Embassy', canWalzHelp: true },
    singapore:    { status: 'required',                                      processingTime: '3–7 days',  notes: 'Apply via ICA e-services', canWalzHelp: true },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'required',                                                           notes: 'Check requirements with local embassy' },
  },
  zimbabwean: {
    uk:           { status: 'required',   visaType: 'UK Standard Visitor', cost: '£115',       processingTime: '3–8 weeks',  notes: 'Apply via UK Visas & Immigration', canWalzHelp: true },
    schengen:     { status: 'required',   visaType: 'Schengen C Visa',      cost: '€90',        processingTime: '4–6 weeks',  notes: 'Book VFS appointment in advance', canWalzHelp: true },
    uae:          { status: 'required',                                      processingTime: '1–2 weeks', notes: 'Visa required — apply online via UAE ICP', canWalzHelp: true },
    ghana:        { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Ghanaian Embassy', canWalzHelp: true },
    kenya:        { status: 'on_arrival',                                                         notes: 'Visa on arrival available' },
    south_africa: { status: 'free',                                                               notes: '90 days visa-free (SADC)' },
    nigeria:      { status: 'required',                                      processingTime: '2–3 weeks', notes: 'Apply at Nigerian High Commission', canWalzHelp: true },
    morocco:      { status: 'required',                                      processingTime: '2–4 weeks', notes: 'Apply at Moroccan Embassy', canWalzHelp: true },
    turkey:       { status: 'evisa',      cost: '$60',                      processingTime: '1 day',     notes: 'Apply at evisa.gov.tr' },
    usa:          { status: 'required',   visaType: 'B1/B2 Tourist Visa',  cost: '$185',       processingTime: '4–12 weeks', notes: 'Book DS-160 + interview', canWalzHelp: true },
    canada:       { status: 'required',   visaType: 'Visitor Visa',         cost: 'CAD $100',   processingTime: '4–8 weeks',  notes: 'Apply online via IRCC', canWalzHelp: true },
    japan:        { status: 'required',   cost: '~£20',                     processingTime: '3–5 days',  notes: 'Apply at Japan Embassy', canWalzHelp: true },
    singapore:    { status: 'required',                                      processingTime: '3–7 days',  notes: 'Apply via ICA e-services', canWalzHelp: true },
    indonesia:    { status: 'free',                                                               notes: '30 days visa-free' },
    other:        { status: 'required',                                                           notes: 'Check requirements with local embassy' },
  },
}

const FALLBACK: VisaRule = {
  status: 'required',
  notes:  'Visa requirements unavailable — contact your local embassy or Walz Travels',
  canWalzHelp: true,
}

export function getVisaRule(passportNationality: string, destination: string): VisaRule {
  const pKey   = passportToKey(passportNationality)
  const region = destToRegion(destination)
  return RULES[pKey]?.[region] ?? RULES[pKey]?.['other'] ?? FALLBACK
}

export interface VisaMemberResult {
  memberName:          string
  passport:            string
  flyingFrom:          string
  destination:         string
  rule:                VisaRule
  missingNationality?: boolean
}

export function buildVisaMatrix(
  members: Array<{ name: string; passportNationality?: string | null; flyingFrom?: string | null }>,
  destination: string,
): VisaMemberResult[] {
  return members.map(m => {
    if (!m.passportNationality) {
      return {
        memberName:         m.name,
        passport:           '',
        flyingFrom:         m.flyingFrom ?? 'Unknown',
        destination,
        rule:               { status: 'required' as VisaStatus, notes: 'Nationality not provided', canWalzHelp: false },
        missingNationality: true,
      }
    }
    return {
      memberName:  m.name,
      passport:    m.passportNationality,
      flyingFrom:  m.flyingFrom ?? 'Unknown',
      destination,
      rule:        getVisaRule(m.passportNationality, destination),
    }
  })
}
