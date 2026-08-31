// lib/portal/traveller-dto.ts — Release 6.4: Safe customer traveller DTO
// NEVER expose: raw passport number, full DOB in logs, sensitive document contents

import { differenceInMonths } from 'date-fns'

export type PassportExpiryStatus = 'VALID' | 'EXPIRES_SOON' | 'EXPIRED' | 'NOT_PROVIDED'

export interface PassportMetaDTO {
  maskedNumber: string | null
  expiryDate: string | null
  expiryStatus: PassportExpiryStatus
  expiryStatusLabel: string
  nationality: string | null
  passportType: string | null
}

export interface TravellerDTO {
  id: string
  relationship: string
  firstName: string
  middleName: string | null
  lastName: string
  displayName: string
  initials: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  phone: string | null
  email: string | null
  passportMeta: PassportMetaDTO | null
  isDeleted: boolean
  createdAt: string
}

// Safe JadeTravellerContext — no passport number or sensitive documents
export interface JadeTravellerContext {
  displayName: string
  ageBand: 'adult' | 'child' | 'infant' | null
  nationality: string | null
  passportStatus: PassportExpiryStatus | null
  profileCompleteness: number
}

export function getPassportExpiryStatus(expiryDate: Date | string | null): PassportExpiryStatus {
  if (!expiryDate) return 'NOT_PROVIDED'
  const d = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
  if (isNaN(d.getTime())) return 'NOT_PROVIDED'
  const now = new Date()
  if (d < now) return 'EXPIRED'
  if (differenceInMonths(d, now) < 6) return 'EXPIRES_SOON'
  return 'VALID'
}

export function getPassportExpiryStatusLabel(status: PassportExpiryStatus): string {
  switch (status) {
    case 'VALID':        return 'Valid'
    case 'EXPIRES_SOON': return 'Expires soon'
    case 'EXPIRED':      return 'Expired'
    case 'NOT_PROVIDED': return 'Not provided'
  }
}

function maskPassportNumber(num: string | null | undefined): string | null {
  if (!num || num.length < 4) return null
  return '••••••' + num.slice(-4)
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

export function toTravellerDTO(raw: {
  id: string
  relationship: string
  firstName: string
  middleName: string | null
  lastName: string
  dateOfBirth: Date | null
  gender: string | null
  nationality: string | null
  phone: string | null
  email: string | null
  passportMeta: unknown
  isDeleted: boolean
  createdAt: Date
}): TravellerDTO {
  const pm = raw.passportMeta && typeof raw.passportMeta === 'object'
    ? (raw.passportMeta as Record<string, unknown>)
    : null

  let passportMeta: PassportMetaDTO | null = null
  if (pm) {
    const rawNum = typeof pm.rawNumber === 'string' ? pm.rawNumber : null
    const expiryDate = typeof pm.expiryDate === 'string' ? pm.expiryDate : null
    const status = getPassportExpiryStatus(expiryDate)
    passportMeta = {
      maskedNumber: maskPassportNumber(rawNum) ?? (typeof pm.maskedNumber === 'string' ? pm.maskedNumber : null),
      expiryDate,
      expiryStatus: status,
      expiryStatusLabel: getPassportExpiryStatusLabel(status),
      nationality: typeof pm.nationality === 'string' ? pm.nationality : null,
      passportType: typeof pm.passportType === 'string' ? pm.passportType : null,
    }
  }

  return {
    id: raw.id,
    relationship: raw.relationship,
    firstName: raw.firstName,
    middleName: raw.middleName ?? null,
    lastName: raw.lastName,
    displayName: `${raw.firstName} ${raw.lastName}`.trim(),
    initials: getInitials(raw.firstName, raw.lastName),
    dateOfBirth: raw.dateOfBirth ? raw.dateOfBirth.toISOString().split('T')[0] : null,
    gender: raw.gender ?? null,
    nationality: raw.nationality ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    passportMeta,
    isDeleted: raw.isDeleted,
    createdAt: raw.createdAt.toISOString(),
  }
}

// Primary traveller DTO from PassportVault
export function primaryTravellerPassportMeta(vault: {
  passportNumber: string | null
  expiryDate: Date | null
  nationality: string | null
  passportType: string
} | null): PassportMetaDTO | null {
  if (!vault) return null
  const status = getPassportExpiryStatus(vault.expiryDate)
  return {
    maskedNumber: maskPassportNumber(vault.passportNumber),
    expiryDate: vault.expiryDate ? vault.expiryDate.toISOString().split('T')[0] : null,
    expiryStatus: status,
    expiryStatusLabel: getPassportExpiryStatusLabel(status),
    nationality: vault.nationality,
    passportType: vault.passportType,
  }
}
