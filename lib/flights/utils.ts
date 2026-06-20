export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatPrice(amount: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style:                 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return iso }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return iso }
}

const IATA_CITY: Record<string, string> = {
  LHR: 'London',       LGW: 'London',        YYZ: 'Toronto',
  YUL: 'Montreal',     YVR: 'Vancouver',      DXB: 'Dubai',
  AUH: 'Abu Dhabi',    LOS: 'Lagos',          ABV: 'Abuja',
  ACC: 'Accra',        JFK: 'New York',       EWR: 'New York',
  ORD: 'Chicago',      LAX: 'Los Angeles',    CDG: 'Paris',
  AMS: 'Amsterdam',    FRA: 'Frankfurt',      IST: 'Istanbul',
  DOH: 'Doha',         NBO: 'Nairobi',        JNB: 'Johannesburg',
  CMN: 'Casablanca',   ADD: 'Addis Ababa',    SIN: 'Singapore',
  HKG: 'Hong Kong',
}

export function iataToCity(iata: string): string {
  return IATA_CITY[iata] ?? iata
}
