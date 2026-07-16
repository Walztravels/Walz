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
