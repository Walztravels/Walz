// Single source of truth for Walz Travels legal entity details.
// All pages, footers, emails, and PDFs that reference company details
// should import from here — never hardcode addresses or company numbers.
//
// Fields marked OWNER INPUT REQUIRED must be filled in by the company
// director before the site asserts registration or uses an address.
// Leave empty ('') to render nothing rather than an incorrect value.

export const LEGAL_ENTITIES = {
  uk: {
    legalName:        'Walz Travels Ltd',
    companyNumber:    '',   // OWNER INPUT REQUIRED — Companies House number
    registeredOffice: '',   // OWNER INPUT REQUIRED — confirmed registered address
    tradingAddress:   '',   // OWNER INPUT REQUIRED — trading/contact address
    jurisdiction:     'England & Wales',
  },
  canada: {
    legalName:         '',  // OWNER INPUT REQUIRED — exact legal name
    corporationNumber: '',  // OWNER INPUT REQUIRED — federal corporation number
    registeredOffice:  '',  // OWNER INPUT REQUIRED — registered office
    province:          'Ontario',
  },
}

// Brand name used in marketing copy — does not imply a specific entity
export const BRAND_NAME = 'Walz Travels'
