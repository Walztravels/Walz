// Maps Hotelbeds destination codes to IANA timezones.
// These are Hotelbeds zone codes (not IATA) used in the /hotels availability request.
// Covers all common Walz Travel destinations.
const DESTINATION_TZ: Record<string, string> = {
  // Middle East
  DXB: 'Asia/Dubai',
  ABD: 'Asia/Dubai',       // Abu Dhabi
  SHJ: 'Asia/Dubai',       // Sharjah
  DOH: 'Asia/Qatar',
  RUH: 'Asia/Riyadh',
  JED: 'Asia/Riyadh',
  AMM: 'Asia/Amman',
  BEY: 'Asia/Beirut',
  // Africa
  LOS: 'Africa/Lagos',
  ABV: 'Africa/Lagos',     // Abuja
  ACC: 'Africa/Accra',
  NBO: 'Africa/Nairobi',
  ADD: 'Africa/Addis_Ababa',
  KGL: 'Africa/Kigali',
  JNB: 'Africa/Johannesburg',
  CPT: 'Africa/Johannesburg',
  DKR: 'Africa/Dakar',
  ABJ: 'Africa/Abidjan',
  CMN: 'Africa/Casablanca',
  CAI: 'Africa/Cairo',
  DAR: 'Africa/Dar_es_Salaam',
  // Europe
  LON: 'Europe/London',
  LHR: 'Europe/London',
  EDI: 'Europe/London',
  BCN: 'Europe/Madrid',
  MAD: 'Europe/Madrid',
  PMI: 'Europe/Madrid',
  PAR: 'Europe/Paris',
  CDG: 'Europe/Paris',
  NCE: 'Europe/Paris',
  ROM: 'Europe/Rome',
  MIL: 'Europe/Rome',
  VCE: 'Europe/Rome',
  BER: 'Europe/Berlin',
  MUC: 'Europe/Berlin',
  IST: 'Europe/Istanbul',
  ATH: 'Europe/Athens',
  AMS: 'Europe/Amsterdam',
  LIS: 'Europe/Lisbon',
  VIE: 'Europe/Vienna',
  ZRH: 'Europe/Zurich',
  DUB: 'Europe/Dublin',
  CPH: 'Europe/Copenhagen',
  STO: 'Europe/Stockholm',
  WAW: 'Europe/Warsaw',
  // Asia
  SIN: 'Asia/Singapore',
  BKK: 'Asia/Bangkok',
  KUL: 'Asia/Kuala_Lumpur',
  HKG: 'Asia/Hong_Kong',
  TYO: 'Asia/Tokyo',
  DEL: 'Asia/Kolkata',
  BOM: 'Asia/Kolkata',
  // Indian Ocean / Tropics
  MLE: 'Indian/Maldives',
  // Americas
  NYC: 'America/New_York',
  MIA: 'America/New_York',
  LAX: 'America/Los_Angeles',
  CHI: 'America/Chicago',
  TOR: 'America/Toronto',
  MEX: 'America/Mexico_City',
  SAO: 'America/Sao_Paulo',
  // Oceania
  SYD: 'Australia/Sydney',
  MEL: 'Australia/Sydney',
}

export function destinationToTimezone(destCode: string): string {
  return DESTINATION_TZ[destCode?.toUpperCase()] ?? 'UTC'
}

// Maps ISO 3166-1 alpha-2 country codes to their primary IANA timezone.
// Used to display Hotelbeds cancellation deadlines in the hotel's local time
// rather than the customer's browser timezone — per HBX Group cert requirement.
const COUNTRY_TZ: Record<string, string> = {
  NG: 'Africa/Lagos',
  GH: 'Africa/Accra',
  GB: 'Europe/London',
  AE: 'Asia/Dubai',
  US: 'America/New_York',
  FR: 'Europe/Paris',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  DE: 'Europe/Berlin',
  TR: 'Europe/Istanbul',
  KE: 'Africa/Nairobi',
  TZ: 'Africa/Dar_es_Salaam',
  ET: 'Africa/Addis_Ababa',
  RW: 'Africa/Kigali',
  ZA: 'Africa/Johannesburg',
  SN: 'Africa/Dakar',
  CI: 'Africa/Abidjan',
  MA: 'Africa/Casablanca',
  EG: 'Africa/Cairo',
  CA: 'America/Toronto',
  QA: 'Asia/Qatar',
  SA: 'Asia/Riyadh',
  JO: 'Asia/Amman',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  MY: 'Asia/Kuala_Lumpur',
  HK: 'Asia/Hong_Kong',
  JP: 'Asia/Tokyo',
  AU: 'Australia/Sydney',
  MV: 'Indian/Maldives',
  IN: 'Asia/Kolkata',
  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo',
  NL: 'Europe/Amsterdam',
  PT: 'Europe/Lisbon',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
  IE: 'Europe/Dublin',
  DK: 'Europe/Copenhagen',
  SE: 'Europe/Stockholm',
  GR: 'Europe/Athens',
  NL2: 'Europe/Amsterdam',
  RU: 'Europe/Moscow',
}

export function countryToTimezone(countryCode: string): string {
  return COUNTRY_TZ[countryCode?.toUpperCase()] ?? 'UTC'
}

export function formatCancellationDeadline(isoDate: string, countryCode: string): string {
  return formatInTimezone(isoDate, countryToTimezone(countryCode))
}

// Use when the IANA timezone string is already known (e.g. stored in the booking).
export function formatInTimezone(isoDate: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoDate))
  } catch {
    return new Date(isoDate).toLocaleDateString('en-GB')
  }
}
