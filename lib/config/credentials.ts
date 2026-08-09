// Canadian immigration representative credentials.
// Under IRPA s.91, advising on or representing a Canadian immigration matter
// for a fee is an offence unless the representative is an RCIC, a Canadian
// lawyer, or a Quebec notary.
//
// While enabled === false, every Canadian immigration page must:
//  - present content as general information, not advice
//  - carry the IRPA disclaimer
//  - remove CTAs offering paid assessment, eligibility review, or
//    application handling for PR, Express Entry, PNP, study or work permits
//
// Visitor visa (TRV) services are travel documentation and are unaffected.

export const CANADA_IMMIGRATION_REPRESENTATIVE = {
  enabled:            false,
  representativeName: '',      // OWNER INPUT REQUIRED — full name of RCIC/lawyer
  licenceNumber:      '',      // OWNER INPUT REQUIRED — CICC registration number
  regulator:          'CICC',  // Canadian Immigration Consultants' College
  verificationUrl:    '',      // OWNER INPUT REQUIRED — CICC public register link
}

export const IRPA_DISCLAIMER =
  'Walz Travels provides general immigration information and document-support ' +
  'services. We are not authorised to provide Canadian immigration advice or ' +
  'representation. Where regulated advice or representation is required, it must ' +
  'be provided by a licensed Canadian immigration professional (RCIC, lawyer, or ' +
  'Quebec notary).'
