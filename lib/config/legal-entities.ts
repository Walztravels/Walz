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
    legalName:         'The Walz Travels Inc.',  // owner-provided
    corporationNumber: '',  // OWNER INPUT REQUIRED — federal corporation number
    registeredOffice:  '',  // OWNER INPUT REQUIRED — registered office
    province:          'Ontario',
  },
}

// Brand name used in marketing copy — does not imply a specific entity
export const BRAND_NAME = 'Walz Travels'

// ── Corporate / SMS-programme disclosure copy — SINGLE SOURCE ─────────────
// Two legitimate entities operate under one customer-facing brand:
//   Canada          -> The Walz Travels Inc.  (the A2P SMS programme owner)
//   United Kingdom  -> Walz Travels Ltd
// Never imply one entity is the other. Footer, legal pages and SMS consent
// wording all import from here.

export const CANADA_ENTITY_NAME = LEGAL_ENTITIES.canada.legalName
export const UK_ENTITY_NAME = LEGAL_ENTITIES.uk.legalName

/** The entity that sends SMS under the registered A2P 10DLC campaign. */
export const SMS_SENDER_ENTITY_NAME = CANADA_ENTITY_NAME

/** Sender phrase used in every SMS consent disclosure. */
export const SMS_SENDER_PHRASE = `${SMS_SENDER_ENTITY_NAME}, operating as ${BRAND_NAME}`

export const CORPORATE_DISCLOSURE =
  'Walz Travels is an international travel services brand operated through locally registered entities in Canada and the United Kingdom.'

export const SMS_PROGRAM_DISCLOSURE =
  'SMS communications under the Canadian messaging program are provided by ' +
  'The Walz Travels Inc., operating under the Walz Travels brand.'

export const ENTITY_DISPLAY_LINES = {
  canada: `Canada: ${CANADA_ENTITY_NAME}`,
  uk: `United Kingdom: ${UK_ENTITY_NAME}`,
} as const
