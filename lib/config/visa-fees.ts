// UK visa priority service fees — editable by admin without a code deploy.
// Verify against:
//   https://www.gov.uk/faster-decision-visa-settlement
//   https://www.gov.uk/government/publications/visa-regulations-revised-table
//
// lastVerified must be updated every time a fee value is changed.

export const UK_VISA_FEES = {
  priorityService: {
    amount:       500,
    currency:     'GBP',
    turnaround:   '5 working days',
    lastVerified: '2026-08-09',
    source:       'https://www.gov.uk/faster-decision-visa-settlement',
  },
  superPriorityService: {
    amount:       1000,
    currency:     'GBP',
    turnaround:   'Next working day after biometrics',
    lastVerified: '2026-08-09',
    source:       'https://www.gov.uk/faster-decision-visa-settlement',
  },
}

export type UkVisaFeeKey = keyof typeof UK_VISA_FEES
