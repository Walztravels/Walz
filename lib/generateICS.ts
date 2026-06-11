import type { FlightLeg } from '@/types/flight-ticket'

/**
 * Generates an iCalendar (.ics) string for all flight legs.
 * Each leg becomes a VEVENT with 3-hour and 24-hour alarms.
 */
export function generateFlightICS(
  outbound: FlightLeg[],
  inbound: FlightLeg[],
  passengerName: string,
  reference: string,
  pnr: string,
): string {
  const allLegs = [
    ...outbound.map(l => ({ ...l, direction: 'Outbound' as const })),
    ...inbound.map(l  => ({ ...l, direction: 'Inbound'  as const })),
  ]

  const events = allLegs.map(leg => {
    const uid = `${reference}-${leg.flightNumber}-${leg.departureDate}@walztravels.com`

    // Format: YYYYMMDDTHHMMSS (local, no TZ suffix → floating)
    const dtStart = leg.departureDate.replace(/-/g, '') + 'T' + leg.departureTime.replace(':', '') + '00'
    const dtEnd   = leg.arrivalDate.replace(/-/g, '')   + 'T' + leg.arrivalTime.replace(':', '')   + '00'

    const summary     = `✈️ ${leg.direction} ${leg.flightNumber} ${leg.departureCode} → ${leg.arrivalCode}`
    const description = [
      'Walz Travels Booking',
      `Reference: ${reference}`,
      `PNR: ${pnr}`,
      `Passenger: ${passengerName}`,
      '',
      `Flight: ${leg.flightNumber}`,
      `Airline: ${leg.airline}`,
      `From: ${leg.departureAirport}\\, ${leg.departureCity}`,
      `To: ${leg.arrivalAirport}\\, ${leg.arrivalCity}`,
      `Duration: ${leg.duration}`,
      `Class: ${leg.cabinClass}`,
      `Baggage: ${leg.baggage}`,
      leg.seat ? `Seat: ${leg.seat}` : '',
      '',
      'Support: https://wa.me/447398753797',
      'Portal: https://www.walztravels.com/portal',
    ].filter(l => l !== null).join('\\n')

    const location = `${leg.departureAirport}\\, ${leg.departureCity}\\, ${leg.departureCountry}`

    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'URL:https://www.walztravels.com/portal',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT180M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Flight in 3 hours — ${leg.flightNumber}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT1440M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Flight tomorrow — ${leg.flightNumber}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Walz Travels//FlightBooking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Walz Travels Flights',
    'X-WR-TIMEZONE:UTC',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}
