import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const AIRLINES: Record<string, { code: string; iata: string }> = {
  GB: { code: 'BA',   iata: 'BAW' },
  US: { code: 'UA',   iata: 'UAL' },
  AE: { code: 'EK',   iata: 'UAE' },
  QA: { code: 'QR',   iata: 'QTR' },
  TR: { code: 'TK',   iata: 'THY' },
  NG: { code: 'W3',   iata: 'AZI' },
  GH: { code: 'GH',   iata: 'GHA' },
  DE: { code: 'LH',   iata: 'DLH' },
  FR: { code: 'AF',   iata: 'AFR' },
  NL: { code: 'KL',   iata: 'KLM' },
  CA: { code: 'AC',   iata: 'ACA' },
  DEFAULT: { code: 'BA', iata: 'BAW' },
}

const AIRPORTS: Record<string, { name: string; terminal: string }> = {
  LOS: { name: 'Murtala Muhammed International', terminal: 'International' },
  LHR: { name: 'London Heathrow',                terminal: 'Terminal 5'   },
  JFK: { name: 'John F. Kennedy International',  terminal: 'Terminal 4'   },
  DXB: { name: 'Dubai International',            terminal: 'Terminal 3'   },
  CDG: { name: 'Charles de Gaulle',              terminal: 'Terminal 2E'  },
  AMS: { name: 'Amsterdam Schiphol',             terminal: 'Schengen'     },
  FRA: { name: 'Frankfurt Airport',              terminal: 'Terminal 1'   },
  ACC: { name: 'Kotoka International',           terminal: 'Terminal 3'   },
  YYZ: { name: 'Toronto Pearson International',  terminal: 'Terminal 1'   },
  IST: { name: 'Istanbul Airport',               terminal: 'International' },
}

function genPNR(): string {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
}

function genBookingRef(prefix = 'HTL'): string {
  return prefix + Math.floor(100000 + Math.random() * 900000)
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 60 * 60 * 1000)
}

function buildFlightTicketHTML(
  fullName: string,
  passportNumber: string,
  nationality: string,
  originIata: string,
  destinationIso2: string,
  departureDate: Date,
  returnDate: Date | null,
  pnr: string,
): string {
  const airline     = AIRLINES[destinationIso2] ?? AIRLINES.DEFAULT
  const origin      = AIRPORTS[originIata]      ?? { name: originIata, terminal: 'International' }
  const dest        = Object.entries(AIRPORTS).find(([k]) => k !== originIata)?.[1] ?? { name: destinationIso2, terminal: 'International' }
  const destCode    = destinationIso2 === 'GB' ? 'LHR' : destinationIso2 === 'AE' ? 'DXB' : destinationIso2 === 'US' ? 'JFK' : destinationIso2 === 'CA' ? 'YYZ' : destinationIso2 === 'DE' ? 'FRA' : destinationIso2 === 'NL' ? 'AMS' : destinationIso2 === 'FR' ? 'CDG' : destinationIso2 === 'TR' ? 'IST' : 'LHR'
  const destAirport = AIRPORTS[destCode] ?? { name: destinationIso2, terminal: 'International' }
  const flight1     = `${airline.code}${Math.floor(100 + Math.random() * 899)}`
  const dep1        = departureDate
  const arr1        = addHours(dep1, 6 + Math.random() * 3)
  const seat1       = `${Math.floor(10 + Math.random() * 30)}${['A','B','C','D','E','F'][Math.floor(Math.random()*6)]}`
  const gate1       = `${['A','B','C','D','E'][Math.floor(Math.random()*5)]}${Math.floor(1 + Math.random() * 30)}`
  const flight2     = returnDate ? `${airline.code}${Math.floor(100 + Math.random() * 899)}` : null
  const dep2        = returnDate
  const arr2        = returnDate ? addHours(returnDate, 6 + Math.random() * 3) : null
  const seat2       = `${Math.floor(10 + Math.random() * 30)}${['A','B','C','D','E','F'][Math.floor(Math.random()*6)]}`
  const gate2       = `${['A','B','C','D','E'][Math.floor(Math.random()*5)]}${Math.floor(1 + Math.random() * 30)}`

  const segmentHTML = (
    flightNo: string, fromCode: string, fromName: string, fromTerm: string,
    toCode: string, toName: string, toTerm: string,
    depDate: Date, arrDate: Date, seat: string, gate: string, label: string
  ) => `
<div style="background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.1);margin:0 0 20px;overflow:hidden;font-family:'Helvetica Neue',Arial,sans-serif;position:relative;">
  <div style="background:linear-gradient(135deg,#003580,#0052cc);padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="color:#fff;">
      <div style="font-size:11px;opacity:0.8;letter-spacing:1px;text-transform:uppercase;">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px;">Flight ${flightNo}</div>
    </div>
    <div style="text-align:right;color:#fff;">
      <div style="font-size:11px;opacity:0.8;">PNR / BOOKING REF</div>
      <div style="font-size:20px;font-weight:700;letter-spacing:3px;">${pnr}</div>
    </div>
  </div>
  <div style="padding:20px 24px;background:#f8faff;">
    <div style="display:flex;align-items:center;gap:0;">
      <div style="flex:1;text-align:left;">
        <div style="font-size:42px;font-weight:700;color:#003580;line-height:1;">${fromCode}</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">${fromName}</div>
        <div style="font-size:11px;color:#888;">${fromTerm}</div>
        <div style="font-size:20px;font-weight:600;color:#111;margin-top:8px;">${formatTime(depDate)}</div>
        <div style="font-size:12px;color:#555;">${formatDate(depDate)}</div>
      </div>
      <div style="flex:0 0 80px;text-align:center;padding:0 8px;">
        <div style="font-size:10px;color:#999;letter-spacing:0.5px;">DIRECT</div>
        <div style="height:2px;background:linear-gradient(to right,#003580,#0052cc);margin:6px 0;position:relative;">
          <div style="position:absolute;right:-4px;top:-5px;font-size:14px;">✈</div>
        </div>
      </div>
      <div style="flex:1;text-align:right;">
        <div style="font-size:42px;font-weight:700;color:#003580;line-height:1;">${toCode}</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">${toName}</div>
        <div style="font-size:11px;color:#888;">${toTerm}</div>
        <div style="font-size:20px;font-weight:600;color:#111;margin-top:8px;">${formatTime(arrDate)}</div>
        <div style="font-size:12px;color:#555;">${formatDate(arrDate)}</div>
      </div>
    </div>
  </div>
  <div style="display:flex;border-top:1px dashed #dde4f0;padding:14px 24px;gap:0;">
    <div style="flex:1;border-right:1px dashed #dde4f0;padding-right:16px;">
      <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Passenger</div>
      <div style="font-size:14px;font-weight:600;color:#111;margin-top:2px;">${fullName.toUpperCase()}</div>
      <div style="font-size:11px;color:#555;margin-top:2px;">Passport: ${passportNumber || 'N/A'} · ${nationality || ''}</div>
    </div>
    <div style="flex:1;padding:0 16px;border-right:1px dashed #dde4f0;">
      <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Seat</div>
      <div style="font-size:22px;font-weight:700;color:#003580;margin-top:2px;">${seat}</div>
      <div style="font-size:11px;color:#555;">Economy Class</div>
    </div>
    <div style="flex:1;padding:0 16px;border-right:1px dashed #dde4f0;">
      <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Gate</div>
      <div style="font-size:22px;font-weight:700;color:#003580;margin-top:2px;">${gate}</div>
      <div style="font-size:11px;color:#555;">Closes 45 min before</div>
    </div>
    <div style="flex:1;padding-left:16px;">
      <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Baggage</div>
      <div style="font-size:14px;font-weight:600;color:#111;margin-top:2px;">1 × 23kg</div>
      <div style="font-size:11px;color:#555;">+ 7kg cabin bag</div>
    </div>
  </div>
  <div style="background:#003580;padding:10px 24px;text-align:center;">
    <div style="font-family:monospace;font-size:13px;letter-spacing:6px;color:#fff;opacity:0.7;">|||||||||||||||||||||||||||||||||||||||||||||||||||||</div>
    <div style="font-size:10px;color:#fff;opacity:0.5;margin-top:2px;">${pnr}-${flightNo}-${seat}</div>
  </div>
</div>`

  const watermark = `<div style="background:#fff3cd;border:2px dashed #e6a817;border-radius:8px;padding:12px 20px;text-align:center;margin-bottom:20px;">
  <div style="font-size:13px;font-weight:700;color:#7d4c00;letter-spacing:2px;">⚠ FOR VISA APPLICATION PURPOSES ONLY — NOT A REAL TICKET ⚠</div>
  <div style="font-size:11px;color:#a06000;margin-top:4px;">This is a dummy flight itinerary generated for visa application support. Not valid for travel.</div>
</div>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Flight Itinerary — ${fullName}</title></head><body style="margin:0;padding:24px;background:#f0f4fb;">
${watermark}
${segmentHTML(flight1, originIata, origin.name, origin.terminal, destCode, destAirport.name, destAirport.terminal, dep1, arr1, seat1, gate1, 'OUTBOUND FLIGHT')}
${dep2 && arr2 && flight2 ? segmentHTML(flight2, destCode, destAirport.name, destAirport.terminal, originIata, origin.name, origin.terminal, dep2, arr2, seat2, gate2, 'RETURN FLIGHT') : ''}
${watermark}
</body></html>`
}

function buildHotelTicketHTML(
  fullName:          string,
  accommodationName: string,
  accommodationAddress: string,
  checkIn:           Date,
  checkOut:          Date,
  bookingRef:        string,
): string {
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
  const roomTypes = ['Standard Double Room', 'Superior Twin Room', 'Deluxe King Room', 'Junior Suite']
  const roomType  = roomTypes[Math.floor(Math.random() * roomTypes.length)]
  const ratePerNight = Math.floor(80 + Math.random() * 120)

  const watermark = `<div style="background:#fff3cd;border:2px dashed #e6a817;border-radius:8px;padding:12px 20px;text-align:center;margin-bottom:20px;">
  <div style="font-size:13px;font-weight:700;color:#7d4c00;letter-spacing:2px;">⚠ FOR VISA APPLICATION PURPOSES ONLY — NOT A REAL BOOKING ⚠</div>
  <div style="font-size:11px;color:#a06000;margin-top:4px;">This is a dummy hotel confirmation generated for visa application support. Not a real reservation.</div>
</div>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Hotel Confirmation — ${fullName}</title></head>
<body style="margin:0;padding:24px;background:#f0f4fb;font-family:'Helvetica Neue',Arial,sans-serif;">
${watermark}
<div style="background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.1);overflow:hidden;max-width:640px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1a3a2a,#2d6a4f);padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">Hotel Booking Confirmation</div>
      <div style="font-size:22px;font-weight:700;color:#fff;margin-top:4px;">${accommodationName || 'Hotel Accommodation'}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:rgba(255,255,255,0.7);">BOOKING REFERENCE</div>
      <div style="font-size:20px;font-weight:700;color:#f0d080;letter-spacing:2px;">${bookingRef}</div>
    </div>
  </div>
  <div style="padding:24px 28px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div style="background:#f8fffe;border:1px solid #c8e6c9;border-radius:8px;padding:14px;">
        <div style="font-size:10px;color:#4caf50;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Check-In</div>
        <div style="font-size:20px;font-weight:700;color:#1a3a2a;margin-top:4px;">${formatDate(checkIn)}</div>
        <div style="font-size:12px;color:#666;margin-top:2px;">From 14:00</div>
      </div>
      <div style="background:#fff8f0;border:1px solid #ffcc80;border-radius:8px;padding:14px;">
        <div style="font-size:10px;color:#ff8f00;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Check-Out</div>
        <div style="font-size:20px;font-weight:700;color:#1a3a2a;margin-top:4px;">${formatDate(checkOut)}</div>
        <div style="font-size:12px;color:#666;margin-top:2px;">Before 12:00</div>
      </div>
    </div>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#666;width:50%;">Guest Name</td><td style="padding:6px 0;font-weight:600;color:#111;">${fullName.toUpperCase()}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Room Type</td><td style="padding:6px 0;font-weight:600;color:#111;">${roomType}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Meal Plan</td><td style="padding:6px 0;font-weight:600;color:#111;">Bed & Breakfast</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Duration</td><td style="padding:6px 0;font-weight:600;color:#111;">${nights} night${nights !== 1 ? 's' : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Rate per night</td><td style="padding:6px 0;font-weight:600;color:#111;">USD ${ratePerNight}</td></tr>
        <tr style="border-top:1px solid #ddd;"><td style="padding:8px 0;font-weight:700;color:#111;">Total Amount</td><td style="padding:8px 0;font-weight:700;color:#2d6a4f;font-size:16px;">USD ${(ratePerNight * nights).toLocaleString()}</td></tr>
      </table>
    </div>
    <div style="font-size:12px;color:#555;margin-bottom:8px;"><strong>Address:</strong> ${accommodationAddress || 'Address on file'}</div>
    <div style="font-size:11px;color:#888;margin-top:16px;padding-top:16px;border-top:1px solid #eee;">
      Status: <span style="color:#2d6a4f;font-weight:700;">CONFIRMED</span> · Payment: <span style="color:#111;font-weight:600;">Pay at property</span>
    </div>
  </div>
  <div style="background:#1a3a2a;padding:12px 28px;text-align:center;">
    <div style="font-family:monospace;font-size:11px;letter-spacing:4px;color:rgba(255,255,255,0.4);">|||||||||||||||||||||||||||||||||||||||||||||</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px;">${bookingRef}</div>
  </div>
</div>
${watermark}
</body></html>`
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { ticketType, applicationId, originIata = 'LOS' } = await req.json() as {
      ticketType:    'flight' | 'hotel'
      applicationId: string
      originIata?:   string
    }

    if (!ticketType || !applicationId) {
      return NextResponse.json({ error: 'ticketType and applicationId required' }, { status: 400 })
    }

    const application = await prisma.visaApplication.findUnique({ where: { id: applicationId } })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const fullName   = [application.firstName, application.middleName, application.lastName].filter(Boolean).join(' ') || 'APPLICANT NAME'
    const passportNo = application.passportNumber ?? ''
    const nationality = application.nationality ?? ''
    const pnr        = genPNR()
    const bookingRef = genBookingRef('HTL')

    const depDate    = application.arrivalDate  ? new Date(application.arrivalDate)  : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const retDate    = application.returnDate   ? new Date(application.returnDate)   : new Date(depDate.getTime() + 14 * 24 * 60 * 60 * 1000)

    let html = ''
    if (ticketType === 'flight') {
      html = buildFlightTicketHTML(fullName, passportNo, nationality, originIata, application.destinationIso2, depDate, retDate, pnr)
    } else {
      html = buildHotelTicketHTML(
        fullName,
        application.accommodationName  ?? 'City Centre Hotel',
        application.accommodationAddress ?? 'Address provided at check-in',
        depDate, retDate, bookingRef
      )
    }

    return NextResponse.json({ html, pnr, bookingRef, ticketType, fullName })
  } catch (e) {
    console.error('[dummy-ticket]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
