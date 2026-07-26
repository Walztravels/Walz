// Input validation for ComfortPass adapter.
// Uses plain TypeScript guard functions — no external schema library dependency.

import type { CPPassenger, CPBookingRequest } from './types'

export function isValidPassengerType(t: unknown): t is 'adult' | 'child' | 'infant' {
  return t === 'adult' || t === 'child' || t === 'infant'
}

export function validatePassenger(p: unknown): p is CPPassenger {
  if (!p || typeof p !== 'object') return false
  const obj = p as Record<string, unknown>
  return (
    isValidPassengerType(obj.type) &&
    typeof obj.firstName === 'string' && obj.firstName.length > 0 &&
    typeof obj.lastName  === 'string' && obj.lastName.length  > 0
  )
}

// Validate YYYY-MM-DD
export function isValidDate(d: unknown): d is string {
  if (typeof d !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
}

// Validate HH:MM
export function isValidTime(t: unknown): t is string {
  if (typeof t !== 'string') return false
  return /^\d{2}:\d{2}$/.test(t)
}

export interface BookingValidationResult {
  valid:  boolean
  errors: string[]
}

export function validateBookingRequest(payload: unknown): BookingValidationResult {
  const errors: string[] = []
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] }
  }
  const p = payload as Record<string, unknown>

  if (!p.serviceCode || typeof p.serviceCode !== 'string')   errors.push('serviceCode is required')
  if (!p.airportCode || typeof p.airportCode !== 'string')   errors.push('airportCode is required')
  if (!isValidDate(p.date))                                  errors.push('date must be YYYY-MM-DD')
  if (!isValidTime(p.time))                                  errors.push('time must be HH:MM')
  if (!p.flightNumber || typeof p.flightNumber !== 'string') errors.push('flightNumber is required')
  if (!Array.isArray(p.passengers) || p.passengers.length === 0) {
    errors.push('at least one passenger is required')
  } else {
    p.passengers.forEach((pass, i) => {
      if (!validatePassenger(pass)) {
        errors.push(`passengers[${i}]: must have type (adult|child|infant), firstName, lastName`)
      }
    })
  }
  if ((p as unknown as CPBookingRequest).paymentMethod !== 'balance') {
    errors.push('paymentMethod must be "balance"')
  }
  if (!p.reference || typeof p.reference !== 'string') errors.push('reference is required')

  return { valid: errors.length === 0, errors }
}

// Coerce intent fields from Jade into a partial booking request.
// Returns null if critical fields are missing.
export function coerceIntentToBooking(fields: Record<string, unknown>): {
  serviceCode?:  string
  airportCode?:  string
  date?:         string
  time?:         string
  flightNumber?: string
  passengers?:   CPPassenger[]
} {
  // Jade stores passenger data as either a count or a structured array
  let passengers: CPPassenger[] | undefined
  if (Array.isArray(fields.passengers) && fields.passengers.every(validatePassenger)) {
    passengers = fields.passengers as CPPassenger[]
  } else if (typeof fields.passenger_count === 'number') {
    passengers = Array.from({ length: fields.passenger_count }, () => ({
      type:      'adult' as const,
      firstName: 'Guest',
      lastName:  'Traveller',
    }))
  }

  return {
    serviceCode:  typeof fields.service_code  === 'string' ? fields.service_code  : undefined,
    airportCode:  typeof fields.airport_code  === 'string' ? fields.airport_code  : undefined,
    date:         typeof fields.date          === 'string' ? fields.date          : undefined,
    time:         typeof fields.time          === 'string' ? fields.time          : undefined,
    flightNumber: typeof fields.flight_number === 'string' ? fields.flight_number : undefined,
    passengers,
  }
}
