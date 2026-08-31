// lib/portal/jade-context.ts — Release 6.4: Safe traveller context for Jade (Release 6.5 readiness)
// NEVER include: passport number, passport scan, full DOB, payment details, document contents
// Release 6.5 will wire this into authenticated Jade sessions.

import { getPassportExpiryStatus, type PassportExpiryStatus } from './traveller-dto'
import { getTravellerProfileCompleteness } from './traveller-completeness'

export interface JadeTravellerContext {
  displayName: string
  ageBand: 'adult' | 'child' | 'infant' | null
  nationality: string | null
  passportStatus: PassportExpiryStatus | null
  profileCompleteness: number
}

function getAgeBand(dateOfBirth: Date | string | null): 'adult' | 'child' | 'infant' | null {
  if (!dateOfBirth) return null
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth
  if (isNaN(dob.getTime())) return null
  const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (ageYears < 2) return 'infant'
  if (ageYears < 12) return 'child'
  return 'adult'
}

export function buildJadeTravellerContext(opts: {
  firstName: string
  lastName: string
  dateOfBirth: Date | string | null
  nationality: string | null
  gender: string | null
  phone: string | null
  email: string | null
  passportExpiryDate: Date | string | null
  passportMeta: { maskedNumber: string | null } | null
}): JadeTravellerContext {
  const completeness = getTravellerProfileCompleteness({
    firstName: opts.firstName,
    lastName: opts.lastName,
    dateOfBirth: opts.dateOfBirth,
    nationality: opts.nationality,
    gender: opts.gender,
    phone: opts.phone,
    email: opts.email,
    passportMeta: opts.passportMeta ? {
      maskedNumber: opts.passportMeta.maskedNumber,
      expiryDate: opts.passportExpiryDate
        ? (typeof opts.passportExpiryDate === 'string' ? opts.passportExpiryDate : opts.passportExpiryDate.toISOString())
        : null,
    } : null,
  })

  const passportStatus = opts.passportMeta?.maskedNumber
    ? getPassportExpiryStatus(opts.passportExpiryDate)
    : null

  return {
    displayName: `${opts.firstName} ${opts.lastName}`.trim(),
    ageBand: getAgeBand(opts.dateOfBirth),
    nationality: opts.nationality ?? null,
    passportStatus,
    profileCompleteness: completeness.percent,
  }
}

// Primary traveller context from PassportVault — safe for Jade
export function buildPrimaryJadeContext(opts: {
  userName: string | null
  vault: {
    givenNames: string | null
    surname: string | null
    dateOfBirth: Date | null
    nationality: string | null
    sex: string | null
    passportNumber: string | null
    expiryDate: Date | null
    phone: string | null
    homeAddress: string | null
  } | null
  userPhone: string | null
}): JadeTravellerContext {
  const firstName = opts.vault?.givenNames ?? opts.userName?.split(' ')[0] ?? 'Customer'
  const lastName = opts.vault?.surname ?? opts.userName?.split(' ').slice(1).join(' ') ?? ''

  const passportMeta = opts.vault?.passportNumber
    ? { maskedNumber: '••••••' + opts.vault.passportNumber.slice(-4) }
    : null

  const passportStatus = passportMeta
    ? getPassportExpiryStatus(opts.vault?.expiryDate ?? null)
    : null

  const completeness = {
    percent: 0,
  }

  // Simple percent for primary vault context
  let score = 0
  if (opts.vault?.givenNames) score += 14
  if (opts.vault?.surname) score += 14
  if (opts.vault?.dateOfBirth) score += 14
  if (opts.vault?.nationality) score += 14
  if (opts.vault?.sex) score += 14
  if (opts.userPhone || opts.vault?.phone) score += 10
  if (opts.vault?.passportNumber) score += 20
  completeness.percent = score

  return {
    displayName: `${firstName}${lastName ? ' ' + lastName : ''}`.trim(),
    ageBand: getAgeBand(opts.vault?.dateOfBirth ?? null),
    nationality: opts.vault?.nationality ?? null,
    passportStatus,
    profileCompleteness: completeness.percent,
  }
}
