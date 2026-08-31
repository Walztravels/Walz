// lib/portal/traveller-completeness.ts — Release 6.4: Deterministic traveller profile completeness
// Pure function — no LLM, no async, no side effects.
// Completeness does NOT imply visa eligibility, booking eligibility, or immigration approval.

export interface CompletenessResult {
  percent: number
  missing: string[]
  sections: {
    personal: boolean
    contact: boolean
    passport: boolean
  }
}

interface TravellerFields {
  firstName: string
  lastName: string
  dateOfBirth: string | Date | null
  nationality: string | null
  gender: string | null
  phone: string | null
  email: string | null
  passportMeta: { expiryDate: string | null; maskedNumber: string | null } | null
}

export function getTravellerProfileCompleteness(t: TravellerFields): CompletenessResult {
  const missing: string[] = []

  // Personal (required for travel)
  if (!t.firstName?.trim()) missing.push('First name')
  if (!t.lastName?.trim()) missing.push('Last name')
  if (!t.dateOfBirth) missing.push('Date of birth')
  if (!t.nationality) missing.push('Nationality')
  if (!t.gender) missing.push('Gender')

  // Contact (recommended)
  const hasContact = !!(t.phone || t.email)

  // Passport (important)
  const hasPassport = !!(t.passportMeta?.maskedNumber)
  if (!hasPassport) missing.push('Passport details')

  const requiredCount = 5 // firstName, lastName, DOB, nationality, gender
  const filledRequired = requiredCount - Math.min(
    missing.filter(m => ['First name', 'Last name', 'Date of birth', 'Nationality', 'Gender'].includes(m)).length,
    requiredCount,
  )

  // Weight: required fields = 70%, contact = 10%, passport = 20%
  const score =
    (filledRequired / requiredCount) * 70 +
    (hasContact ? 10 : 0) +
    (hasPassport ? 20 : 0)

  return {
    percent: Math.round(score),
    missing,
    sections: {
      personal: missing.filter(m => ['First name', 'Last name', 'Date of birth', 'Nationality', 'Gender'].includes(m)).length === 0,
      contact: hasContact,
      passport: hasPassport,
    },
  }
}

// Primary traveller completeness from PassportVault
interface PrimaryVaultFields {
  givenNames: string | null
  surname: string | null
  dateOfBirth: Date | null
  nationality: string | null
  sex: string | null
  passportNumber: string | null
  expiryDate: Date | null
  phone: string | null
  homeAddress: string | null
}

interface PrimaryUserFields {
  phone: string | null
}

export function getPrimaryTravellerCompleteness(
  vault: PrimaryVaultFields | null,
  user: PrimaryUserFields,
): CompletenessResult {
  if (!vault) {
    return {
      percent: 0,
      missing: ['First name', 'Last name', 'Date of birth', 'Nationality', 'Gender', 'Passport details'],
      sections: { personal: false, contact: false, passport: false },
    }
  }

  const missing: string[] = []
  if (!vault.givenNames?.trim()) missing.push('First name')
  if (!vault.surname?.trim()) missing.push('Last name')
  if (!vault.dateOfBirth) missing.push('Date of birth')
  if (!vault.nationality) missing.push('Nationality')
  if (!vault.sex) missing.push('Gender')

  const hasContact = !!(user.phone || vault.phone || vault.homeAddress)
  const hasPassport = !!(vault.passportNumber)
  if (!hasPassport) missing.push('Passport details')

  const requiredCount = 5
  const filledRequired = requiredCount - Math.min(
    missing.filter(m => ['First name', 'Last name', 'Date of birth', 'Nationality', 'Gender'].includes(m)).length,
    requiredCount,
  )

  const score =
    (filledRequired / requiredCount) * 70 +
    (hasContact ? 10 : 0) +
    (hasPassport ? 20 : 0)

  return {
    percent: Math.round(score),
    missing,
    sections: {
      personal: missing.filter(m => ['First name', 'Last name', 'Date of birth', 'Nationality', 'Gender'].includes(m)).length === 0,
      contact: hasContact,
      passport: hasPassport,
    },
  }
}
