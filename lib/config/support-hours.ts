// Support hours configuration — single source of truth.
//
// OWNER CONFIRMATION REQUIRED before publishing.
// The site currently asserts four contradictory schedules:
//
//   1. "Mon–Sat 9am–8pm GMT"
//      Source: app/contact/page.tsx (email contact label)
//
//   2. "Mon–Fri 9am–8pm · Sat 10am–6pm · Sun 12pm–5pm GMT"
//      Source: app/contact/page.tsx (full schedule display)
//
//   3. "Mon–Sat 8am–8pm (UK time)"
//      Source: app/visa/[country]/page.tsx (WhatsApp label)
//
//   4. "Mon–Sat" (days only, no hours)
//      Source: app/portal/application/page.tsx (Jade coordinator note)
//
//   5. "Available 24/7" — WhatsApp/Jade AI. This is consistent everywhere
//      and likely accurate. No change needed.
//
// Seyi: please confirm the correct schedule and fill in the hours below.
// Once confirmed, consume SUPPORT_HOURS everywhere instead of hardcoded strings.

export const SUPPORT_HOURS = {
  timezone: 'Europe/London',
  hours: {
    monday:    ['', ''] as [string, string],  // OWNER INPUT — e.g. ['09:00', '20:00']
    tuesday:   ['', ''] as [string, string],
    wednesday: ['', ''] as [string, string],
    thursday:  ['', ''] as [string, string],
    friday:    ['', ''] as [string, string],
    saturday:  ['', ''] as [string, string],
    sunday:    ['', ''] as [string, string],  // '' means closed
  },
  emergencyNote: '24/7 emergency support for travellers in transit',
} as const

/** Returns a human-readable schedule string for a given day, or null if closed. */
export const daySchedule = (day: keyof typeof SUPPORT_HOURS.hours): string | null => {
  const [open, close] = SUPPORT_HOURS.hours[day]
  if (!open || !close) return null
  return `${open}–${close} ${SUPPORT_HOURS.timezone === 'Europe/London' ? 'GMT' : SUPPORT_HOURS.timezone}`
}
