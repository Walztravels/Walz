'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plane, Building2, MapPin, Car, Send, Printer,
  CheckCircle, Loader2, X, Plus,
  Clock, RefreshCw, History,
  ChevronDown, ChevronRight, Ticket,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketTab = 'FLIGHT' | 'HOTEL' | 'TOUR' | 'TRANSFER'

interface DBBooking {
  id: string
  bookingReference: string
  pnr: string | null
  type: string
  status: string
  totalAmount: number
  currency: string
  contactEmail: string
  contactPhone: string | null
  flightDetails: {
    outbound?: Array<{
      departureAirport: string; arrivalAirport: string
      departureTime: string; arrivalTime?: string
      airline: string; airlineCode?: string; flightNumber: string
      cabinClass?: string; duration?: number; aircraft?: string; bookingCode?: string
    }>
    inbound?: Array<{
      departureAirport: string; arrivalAirport: string
      departureTime: string; arrivalTime?: string
      airline: string; airlineCode?: string; flightNumber: string
    }>
  } | null
  hotelDetails: {
    name?: string
    address?: { lines?: string[]; city?: string; country?: string }
    stars?: number; roomType?: string; mealPlan?: string
    checkIn?: string; checkOut?: string
    totalPrice?: { amount: number; currency: string }
  } | null
  passengers: Array<{
    firstName: string; lastName: string
    passportNumber?: string; nationality?: string; dateOfBirth?: string
  }> | null
  createdAt: string
  notes: string | null
}

interface SavedTicket {
  id: string; ticketNumber: string; ticketType: string
  clientName: string; clientEmail: string
  sentAt: string | null; createdAt: string
  booking: { bookingReference: string; type: string } | null
}

interface Passenger {
  name: string; seat: string; eTicket: string
  passportNumber: string; nationality: string; dob: string
}

interface FlightSegment {
  airline: string; airlineCode: string; flightNumber: string; aircraft: string
  fromCode: string; fromCity: string; fromAirport: string; fromTerminal: string
  toCode: string; toCity: string; toAirport: string; toTerminal: string
  departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string
  duration: string; cabinClass: string; bookingCode: string
  baggageChecked: string; baggageCarryOn: string; mealService: string
}

interface FlightData {
  isThirdParty: boolean; originalAirline: string
  pnr: string; ticketIssueDate: string
  passengers: Passenger[]; segments: FlightSegment[]
  checkInOpens: string; checkInDeadline: string
  gateClosesMins: number; arriveAirportBy: string; loungeAccess: string
  clientEmail: string; clientPhone: string; notes: string
}

interface HotelData {
  confirmationNumber: string
  guestName: string; guestEmail: string; guestPhone: string
  hotelName: string; hotelAddress: string; hotelCity: string; hotelCountry: string
  hotelPhone: string; hotelWebsite: string; hotelStars: string
  checkInDate: string; checkInTime: string; checkOutDate: string; checkOutTime: string
  roomType: string; roomNumber: string; guests: string; rooms: string; mealPlan: string
  ratePerNight: string; totalCost: string; currency: string
  specialRequests: string; googleMapsUrl: string; notes: string
}

interface TourData {
  confirmationNumber: string
  guestName: string; guestEmail: string; guestPhone: string
  tourName: string; operator: string; destination: string; meetingPoint: string
  tourDate: string; startTime: string; endTime: string; duration: string; guests: string
  guideName: string; guidePhone: string
  inclusions: string; exclusions: string
  pickupIncluded: boolean; pickupLocation: string
  totalCost: string; currency: string; notes: string
}

interface TransferData {
  confirmationNumber: string
  passengerName: string; passengerEmail: string; passengerPhone: string
  pickupLocation: string; pickupAddress: string
  dropoffLocation: string; dropoffAddress: string
  pickupDate: string; pickupTime: string; flightRef: string
  vehicleType: string; vehicleReg: string; driverName: string; driverPhone: string
  pax: string; luggage: string; provider: string
  totalCost: string; currency: string; notes: string
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defSeg = (): FlightSegment => ({
  airline: '', airlineCode: '', flightNumber: '', aircraft: '',
  fromCode: '', fromCity: '', fromAirport: '', fromTerminal: '',
  toCode: '', toCity: '', toAirport: '', toTerminal: '',
  departureDate: '', departureTime: '', arrivalDate: '', arrivalTime: '',
  duration: '', cabinClass: 'Economy', bookingCode: '',
  baggageChecked: '23kg', baggageCarryOn: '7kg', mealService: 'Standard',
})
const defPax = (): Passenger => ({ name: '', seat: '', eTicket: '', passportNumber: '', nationality: '', dob: '' })
const defFlight = (): FlightData => ({
  isThirdParty: false, originalAirline: '',
  pnr: '', ticketIssueDate: new Date().toISOString().split('T')[0],
  passengers: [defPax()], segments: [defSeg()],
  checkInOpens: '24 hours before departure',
  checkInDeadline: '3 hours before departure (international)',
  gateClosesMins: 20, arriveAirportBy: '3 hours before departure', loungeAccess: 'None',
  clientEmail: '', clientPhone: '', notes: '',
})
const defHotel = (): HotelData => ({
  confirmationNumber: '', guestName: '', guestEmail: '', guestPhone: '',
  hotelName: '', hotelAddress: '', hotelCity: '', hotelCountry: '',
  hotelPhone: '', hotelWebsite: '', hotelStars: '4',
  checkInDate: '', checkInTime: '15:00', checkOutDate: '', checkOutTime: '12:00',
  roomType: '', roomNumber: '', guests: '2', rooms: '1', mealPlan: 'Room Only',
  ratePerNight: '', totalCost: '', currency: 'GBP',
  specialRequests: '', googleMapsUrl: '', notes: '',
})
const defTour = (): TourData => ({
  confirmationNumber: '', guestName: '', guestEmail: '', guestPhone: '',
  tourName: '', operator: '', destination: '', meetingPoint: '',
  tourDate: '', startTime: '', endTime: '', duration: '', guests: '2',
  guideName: '', guidePhone: '', inclusions: '', exclusions: '',
  pickupIncluded: false, pickupLocation: '', totalCost: '', currency: 'GBP', notes: '',
})
const defTransfer = (): TransferData => ({
  confirmationNumber: '', passengerName: '', passengerEmail: '', passengerPhone: '',
  pickupLocation: '', pickupAddress: '', dropoffLocation: '', dropoffAddress: '',
  pickupDate: '', pickupTime: '', flightRef: '',
  vehicleType: 'Saloon Car', vehicleReg: '', driverName: '', driverPhone: '',
  pax: '2', luggage: '2', provider: 'Walz Travels', totalCost: '', currency: 'GBP', notes: '',
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}
function gateClose(t: string, mins: number) {
  if (!t?.includes(':')) return '—'
  const [h, m] = t.split(':').map(Number)
  const tot = h * 60 + m - mins
  return `${String(((Math.floor(tot / 60)) % 24 + 24) % 24).padStart(2,'0')}:${String(((tot % 60) + 60) % 60).padStart(2,'0')}`
}
function nights(ci: string, co: string) {
  if (!ci || !co) return 0
  return Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000)
}

// ─── Form primitives ──────────────────────────────────────────────────────────

const inp = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white'
const sel = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white'

function Lbl({ c }: { c: string }) {
  return <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{c}</label>
}
function Hr({ c }: { c: string }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1">
      <span className="text-[10px] font-bold text-[#0B1F3A] tracking-widest uppercase whitespace-nowrap">{c}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}
function F({ label, value, onChange, type = 'text', options, textarea, rows = 3, span = 1, placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; options?: string[]; textarea?: boolean; rows?: number
  span?: 1 | 2 | 3; placeholder?: string
}) {
  const wrap = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : ''
  return (
    <div className={wrap}>
      <Lbl c={label} />
      {options
        ? <select value={value} onChange={e => onChange(e.target.value)} className={sel}>
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        : textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
            placeholder={placeholder} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white resize-none" />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} className={inp} />}
    </div>
  )
}

// ─── Brand HTML constants ─────────────────────────────────────────────────────

const HDR = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1F3A"><tr><td style="padding:22px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="color:#C9A84C;font-family:Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:4px">WALZ TRAVELS</div><div style="color:rgba(255,255,255,0.4);font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;margin-top:3px">FLIGHTS · HOTELS · TOURS · TRANSFERS · VISAS</div></td><td align="right" style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.4);line-height:1.8">bookings@walztravels.com<br>+44 7398 753797<br>walztravels.com</td></tr></table></td></tr></table>`
const FTR = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1F3A"><tr><td style="padding:14px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.4)">24/7 Emergency: +44 7398 753797 · contact@walztravels.com</td><td align="right" style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.3)">Walz Travels Ltd</td></tr></table></td></tr></table>`

// ─── HTML renderers ───────────────────────────────────────────────────────────

function buildFlightHtml(d: FlightData, ref: string): string {
  const isRT = d.segments.length > 1
  const segs = d.segments.map((s, i) => {
    const gc = gateClose(s.departureTime, d.gateClosesMins)
    const fn = (s.airlineCode + s.flightNumber).replace(/\s/g, '')
    return `${i > 0 ? '<div style="height:12px;background:#F1F5F9;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0"></div>' : ''}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-bottom:1px solid #BFDBFE"><tr><td style="padding:8px 32px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#1D4ED8;letter-spacing:2px">✈ &nbsp;${isRT ? (i===0?'OUTBOUND':'RETURN') : 'FLIGHT'} &nbsp;·&nbsp; ${s.airline} ${s.flightNumber} &nbsp;·&nbsp; ${s.cabinClass.toUpperCase()}</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFF"><tr><td style="padding:24px 32px 0">
<table width="100%" cellpadding="0" cellspacing="0"><tr valign="middle">
<td align="center" width="30%"><div style="font-family:Arial,sans-serif;font-size:52px;font-weight:900;color:#0B1F3A;line-height:1">${s.fromCode||'DEP'}</div><div style="font-family:Arial,sans-serif;font-size:13px;color:#475569;margin-top:4px">${s.fromCity}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#94A3B8">${s.fromAirport}</div>${s.fromTerminal?`<div style="font-family:Arial,sans-serif;font-size:10px;color:#94A3B8">Terminal ${s.fromTerminal}</div>`:''}</td>
<td align="center" width="40%"><div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#C9A84C;letter-spacing:1px;margin-bottom:8px">${s.airline} ${s.flightNumber}</div><table width="100%" cellpadding="0" cellspacing="0"><tr><td width="10"><div style="width:10px;height:10px;background:#C9A84C;border-radius:50%"></div></td><td><div style="height:2px;background:linear-gradient(to right,#C9A84C,#0B1F3A)"></div></td><td style="padding:0 4px;font-size:18px;color:#0B1F3A">✈</td><td><div style="height:2px;background:linear-gradient(to right,#0B1F3A,#C9A84C)"></div></td><td width="10"><div style="width:10px;height:10px;background:#C9A84C;border-radius:50%"></div></td></tr></table><div style="font-family:Arial,sans-serif;font-size:11px;color:#94A3B8;margin-top:6px">${s.duration}</div></td>
<td align="center" width="30%"><div style="font-family:Arial,sans-serif;font-size:52px;font-weight:900;color:#0B1F3A;line-height:1">${s.toCode||'ARR'}</div><div style="font-family:Arial,sans-serif;font-size:13px;color:#475569;margin-top:4px">${s.toCity}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#94A3B8">${s.toAirport}</div>${s.toTerminal?`<div style="font-family:Arial,sans-serif;font-size:10px;color:#94A3B8">Terminal ${s.toTerminal}</div>`:''}</td>
</tr></table></td></tr>
<tr><td style="padding:16px 32px 20px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #CBD5E1;padding-top:16px"><tr>
<td><div style="font-family:Arial,sans-serif;font-size:32px;font-weight:900;color:#0B1F3A">${s.departureTime||'—'}</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569">${fmtDate(s.departureDate)}</div></td>
<td align="right"><div style="font-family:Arial,sans-serif;font-size:32px;font-weight:900;color:#0B1F3A">${s.arrivalTime||'—'}</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569">${fmtDate(s.arrivalDate)}</div></td>
</tr></table></td></tr></table>
<!-- AIRPORT TIMING -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF9E6;border-top:2px solid #C9A84C;border-bottom:2px solid #C9A84C"><tr><td style="padding:18px 32px">
<div style="font-family:Arial,sans-serif;font-size:10px;font-weight:900;color:#92400E;letter-spacing:2px;margin-bottom:14px">⏱ &nbsp; IMPORTANT — AIRPORT TIMING FOR YOUR FLIGHT</div>
<table width="100%" cellpadding="0" cellspacing="0"><tr valign="top">
<td width="25%" style="padding:0 12px 0 0;border-right:1px solid #FDE68A"><div style="font-size:22px">🕐</div><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#92400E;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px">Arrive at Airport</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#0B1F3A;margin-top:4px">${d.arriveAirportBy}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#78716C;margin-top:3px">Allow time for security</div></td>
<td width="25%" style="padding:0 12px;border-right:1px solid #FDE68A"><div style="font-size:22px">🖨</div><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#92400E;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px">Check-in Opens</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#0B1F3A;margin-top:4px">${d.checkInOpens}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#78716C;margin-top:3px">Online check-in available</div></td>
<td width="25%" style="padding:0 12px;border-right:1px solid #FDE68A"><div style="font-size:22px">⚠️</div><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#DC2626;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px">Check-in Deadline</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#DC2626;margin-top:4px">${d.checkInDeadline}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#78716C;margin-top:3px">After this, check-in closes</div></td>
<td width="25%" style="padding:0 0 0 12px"><div style="font-size:22px">🚪</div><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#DC2626;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px">Gate Closes</div><div style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;color:#DC2626;margin-top:2px">${s.departureTime?gc:'—'}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#78716C;margin-top:3px">${d.gateClosesMins} min before departure</div></td>
</tr></table>
<div style="margin-top:14px;padding:10px 14px;background:#FEF3C7;border-radius:8px;border-left:3px solid #C9A84C"><span style="font-family:Arial,sans-serif;font-size:12px;color:#92400E"><strong>📢 Please be at the gate by ${s.departureTime?gc:'—'} on ${fmtDate(s.departureDate)}.</strong> Gates close ${d.gateClosesMins} minutes before departure. Late passengers will not be accommodated.</span></div>
${d.loungeAccess&&d.loungeAccess!=='None'?`<div style="margin-top:8px;padding:8px 14px;background:#EFF6FF;border-radius:6px;border-left:3px solid #3B82F6"><span style="font-family:Arial,sans-serif;font-size:11px;color:#1E40AF">✨ <strong>Lounge Access:</strong> ${d.loungeAccess}</span></div>`:''}
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:18px 32px">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
${[['PNR / Ref',d.pnr||'—'],['Checked Bag',s.baggageChecked],['Cabin Bag',s.baggageCarryOn],['Meal',s.mealService],['Aircraft',s.aircraft||'—'],['Class',s.bookingCode||s.cabinClass]].map(([l,v])=>`<td align="center" style="padding:0 6px;border-right:1px solid #F1F5F9"><div style="font-family:Arial,sans-serif;font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:4px">${l}</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></td>`).join('')}
</tr></table></td></tr></table>
${fn.length>2?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-bottom:1px solid #BBF7D0"><tr><td style="padding:10px 32px;font-family:Arial,sans-serif;font-size:11px;color:#166534">📡 <strong>Track live:</strong> &nbsp;<a href="https://www.flightaware.com/live/flight/${fn}" style="color:#1D4ED8">FlightAware</a> &nbsp;·&nbsp; <a href="https://www.flightradar24.com/${fn}" style="color:#1D4ED8">FlightRadar24</a></td></tr></table>`:''}`
  }).join('')

  const paxRows = d.passengers.filter(p=>p.name).map(p=>`<tr><td style="padding:9px 12px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#0B1F3A;border-bottom:1px solid #F1F5F9">${p.name}</td><td style="padding:9px 12px;font-family:Arial,sans-serif;font-size:12px;color:#475569;border-bottom:1px solid #F1F5F9">${p.seat||'—'}</td><td style="padding:9px 12px;font-family:Arial,sans-serif;font-size:12px;color:#475569;border-bottom:1px solid #F1F5F9">${p.eTicket||'—'}</td><td style="padding:9px 12px;font-family:Arial,sans-serif;font-size:12px;color:#475569;border-bottom:1px solid #F1F5F9">${p.passportNumber||'—'}</td><td style="padding:9px 12px;font-family:Arial,sans-serif;font-size:12px;color:#475569;border-bottom:1px solid #F1F5F9">${p.nationality||'—'}</td></tr>`).join('')

  return `<div style="font-family:Arial,sans-serif;background:#fff;max-width:800px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
${HDR}${segs}
${paxRows?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:20px 32px"><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:2px;margin-bottom:10px">PASSENGERS</div><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden"><tr style="background:#F8FAFF">${['Name','Seat','e-Ticket','Passport','Nationality'].map(h=>`<th style="padding:8px 12px;text-align:left;font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:1px">${h}</th>`).join('')}</tr>${paxRows}</table></td></tr></table>`:''}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid #E2E8F0"><tr><td style="padding:12px 32px"><table cellpadding="0" cellspacing="0"><tr><td style="padding:0 20px 0 0;font-family:Arial,sans-serif;font-size:10px"><span style="color:#94A3B8">Ticket Ref: </span><strong style="color:#0B1F3A">${ref}</strong></td><td style="padding:0 20px;font-family:Arial,sans-serif;font-size:10px;border-left:1px solid #E2E8F0"><span style="color:#94A3B8">Issued: </span><strong style="color:#0B1F3A">${fmtDate(d.ticketIssueDate)}</strong></td>${d.isThirdParty?`<td style="padding:0 0 0 20px;font-family:Arial,sans-serif;font-size:10px;border-left:1px solid #E2E8F0"><span style="color:#94A3B8">Operated by: </span><strong style="color:#0B1F3A">${d.originalAirline}</strong></td>`:''}</tr></table></td></tr></table>
${d.notes?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:14px 32px;font-family:Arial,sans-serif;font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</td></tr></table>`:''}
${FTR}</div>`
}

function buildHotelHtml(d: HotelData, ref: string): string {
  const n = nights(d.checkInDate, d.checkOutDate)
  const stars = parseInt(d.hotelStars)||0
  const mapsUrl = d.googleMapsUrl || (d.hotelName?`https://maps.google.com/?q=${encodeURIComponent(`${d.hotelName} ${d.hotelAddress} ${d.hotelCity}`)}` : '')
  const grid = (items: [string,string][]) => `<table width="100%" cellpadding="0" cellspacing="0"><tr>${items.map(([l,v])=>`<td align="center" style="padding:0 8px;border-right:1px solid #F1F5F9"><div style="font-family:Arial,sans-serif;font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:4px">${l}</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></td>`).join('')}</tr></table>`
  return `<div style="font-family:Arial,sans-serif;background:#fff;max-width:800px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
${HDR}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3FF;border-bottom:1px solid #DDD6FE"><tr><td style="padding:8px 32px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#6D28D9;letter-spacing:2px">🏨 &nbsp; HOTEL BOOKING CONFIRMATION</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:24px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr valign="top"><td><div style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;color:#0B1F3A">${d.hotelName||'Hotel Name'}</div>${stars>0?`<div style="color:#C9A84C;font-size:16px;margin-top:3px">${'★'.repeat(stars)}</div>`:''} ${d.hotelAddress?`<div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;margin-top:8px">📍 ${d.hotelAddress}${d.hotelCity?', '+d.hotelCity:''}${d.hotelCountry?', '+d.hotelCountry:''}</div>`:''} ${d.hotelPhone?`<div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;margin-top:3px">📞 ${d.hotelPhone}</div>`:''} ${d.hotelWebsite?`<div style="font-family:Arial,sans-serif;font-size:12px;color:#3B82F6;margin-top:3px">🌐 ${d.hotelWebsite}</div>`:''}</td>${d.confirmationNumber?`<td align="right"><div style="display:inline-block;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 20px;text-align:center"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#16A34A;letter-spacing:2px">CONFIRMATION NO.</div><div style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#0B1F3A;margin-top:4px">${d.confirmationNumber}</div><div style="font-family:Arial,sans-serif;font-size:9px;color:#94A3B8;margin-top:4px">Ref: ${ref}</div></div></td>`:''}</tr></table></td></tr></table>
${mapsUrl?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;border-bottom:1px solid #E2E8F0"><tr><td style="padding:12px 32px"><table cellpadding="0" cellspacing="0"><tr valign="middle"><td style="font-size:22px;padding-right:10px">🗺</td><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#0B1F3A">View hotel on Google Maps</div><a href="${mapsUrl}" style="font-family:Arial,sans-serif;font-size:11px;color:#3B82F6">${mapsUrl}</a></td></tr></table></td></tr></table>`:''}
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td width="42%" style="padding:20px 32px;background:#F0FDF4;border-right:1px solid #E2E8F0"><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#16A34A;letter-spacing:2px;margin-bottom:6px">CHECK-IN</div><div style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:#0B1F3A">${fmtDate(d.checkInDate)}</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;margin-top:4px">From ${d.checkInTime||'15:00'}</div></td><td width="16%" align="center" style="padding:20px 0;background:#F8FAFF"><div style="font-family:Arial,sans-serif;font-size:36px;font-weight:900;color:#C9A84C">${n||'—'}</div><div style="font-family:Arial,sans-serif;font-size:10px;color:#94A3B8;letter-spacing:1px">NIGHT${n!==1?'S':''}</div></td><td width="42%" style="padding:20px 32px;background:#FEF2F2;border-left:1px solid #E2E8F0"><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#DC2626;letter-spacing:2px;margin-bottom:6px">CHECK-OUT</div><div style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:#0B1F3A">${fmtDate(d.checkOutDate)}</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;margin-top:4px">By ${d.checkOutTime||'12:00'}</div></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:18px 32px">${grid([['GUEST',d.guestName||'—'],['ROOM TYPE',d.roomType||'—'],['ROOM NO.',d.roomNumber||'—'],['GUESTS',d.guests||'—'],['ROOMS',d.rooms||'—'],['MEAL PLAN',d.mealPlan||'—']])}</td></tr></table>
${(d.ratePerNight||d.totalCost)?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border-bottom:1px solid #FDE68A"><tr><td style="padding:12px 32px;font-family:Arial,sans-serif;font-size:12px;color:#92400E">${d.ratePerNight?`Rate/night: <strong>${d.currency} ${d.ratePerNight}</strong>`:''}${d.ratePerNight&&d.totalCost?' &nbsp;·&nbsp; ':''}${d.totalCost?`Total: <strong style="font-size:18px;color:#0B1F3A">${d.currency} ${d.totalCost}</strong>`:''}</td></tr></table>`:''}
${d.specialRequests?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:14px 32px"><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:1.5px;margin-bottom:6px">SPECIAL REQUESTS</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569">${d.specialRequests}</div></td></tr></table>`:''}
${d.notes?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:14px 32px;font-family:Arial,sans-serif;font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</td></tr></table>`:''}
${FTR}</div>`
}

function buildTourHtml(d: TourData, ref: string): string {
  const grid = (items: [string,string][]) => `<table width="100%" cellpadding="0" cellspacing="0"><tr>${items.map(([l,v])=>`<td align="center" style="padding:0 8px;border-right:1px solid #F1F5F9"><div style="font-family:Arial,sans-serif;font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:4px">${l}</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></td>`).join('')}</tr></table>`
  return `<div style="font-family:Arial,sans-serif;background:#fff;max-width:800px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
${HDR}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-bottom:1px solid #BBF7D0"><tr><td style="padding:8px 32px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#16A34A;letter-spacing:2px">🌴 &nbsp; TOUR BOOKING VOUCHER</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:24px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr valign="top"><td><div style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#0B1F3A">${d.tourName||'Tour Name'}</div>${d.operator?`<div style="font-family:Arial,sans-serif;font-size:13px;color:#475569;margin-top:4px">Operated by: <strong>${d.operator}</strong></div>`:''} ${d.destination?`<div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;margin-top:4px">📍 ${d.destination}</div>`:''}</td>${d.confirmationNumber?`<td align="right"><div style="display:inline-block;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 20px;text-align:center"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#16A34A;letter-spacing:2px">VOUCHER NO.</div><div style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#0B1F3A;margin-top:4px">${d.confirmationNumber}</div><div style="font-family:Arial,sans-serif;font-size:9px;color:#94A3B8;margin-top:3px">Ref: ${ref}</div></div></td>`:''}</tr></table></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:18px 32px">${grid([['GUEST',d.guestName||'—'],['DATE',fmtDate(d.tourDate)],['START',d.startTime||'—'],['END',d.endTime||'—'],['DURATION',d.duration||'—'],['GUESTS',d.guests||'—']])}</td></tr></table>
${d.meetingPoint?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border-bottom:1px solid #FDE68A"><tr><td style="padding:12px 32px;font-family:Arial,sans-serif;font-size:12px;color:#92400E"><strong>📍 Meeting Point:</strong> ${d.meetingPoint}</td></tr></table>`:''}
${(d.guideName||d.guidePhone)?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:12px 32px;font-family:Arial,sans-serif;font-size:12px;color:#475569">👤 <strong>Guide:</strong> ${d.guideName||'—'}${d.guidePhone?` &nbsp;·&nbsp; 📞 ${d.guidePhone}`:''}</td></tr></table>`:''}
${d.pickupIncluded&&d.pickupLocation?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-bottom:1px solid #BFDBFE"><tr><td style="padding:10px 32px;font-family:Arial,sans-serif;font-size:12px;color:#1E40AF">🚗 <strong>Pickup included from:</strong> ${d.pickupLocation}</td></tr></table>`:''}
${(d.inclusions||d.exclusions)?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr>${d.inclusions?`<td valign="top" style="padding:14px 32px;border-right:1px solid #E2E8F0"><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#16A34A;letter-spacing:1.5px;margin-bottom:6px">✅ INCLUSIONS</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;white-space:pre-wrap">${d.inclusions}</div></td>`:''}${d.exclusions?`<td valign="top" style="padding:14px 32px"><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#DC2626;letter-spacing:1.5px;margin-bottom:6px">❌ EXCLUSIONS</div><div style="font-family:Arial,sans-serif;font-size:12px;color:#475569;white-space:pre-wrap">${d.exclusions}</div></td>`:''}</tr></table>`:''}
${d.totalCost?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border-bottom:1px solid #FDE68A"><tr><td style="padding:12px 32px;font-family:Arial,sans-serif;font-size:12px;color:#92400E">Total: <strong style="font-size:18px;color:#0B1F3A">${d.currency} ${d.totalCost}</strong></td></tr></table>`:''}
${d.notes?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:14px 32px;font-family:Arial,sans-serif;font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</td></tr></table>`:''}
${FTR}</div>`
}

function buildTransferHtml(d: TransferData, ref: string): string {
  const grid = (items: [string,string][]) => `<table width="100%" cellpadding="0" cellspacing="0"><tr>${items.map(([l,v])=>`<td align="center" style="padding:0 8px;border-right:1px solid #F1F5F9"><div style="font-family:Arial,sans-serif;font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:4px">${l}</div><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></td>`).join('')}</tr></table>`
  return `<div style="font-family:Arial,sans-serif;background:#fff;max-width:800px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
${HDR}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border-bottom:1px solid #FED7AA"><tr><td style="padding:8px 32px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#C2410C;letter-spacing:2px">🚗 &nbsp; TRANSFER BOOKING CONFIRMATION</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border-bottom:1px solid #E2E8F0"><tr><td style="padding:24px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr valign="middle"><td width="45%"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#94A3B8;letter-spacing:2px;margin-bottom:4px">PICKUP FROM</div><div style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#0B1F3A">${d.pickupLocation||'—'}</div>${d.pickupAddress?`<div style="font-family:Arial,sans-serif;font-size:11px;color:#475569;margin-top:3px">${d.pickupAddress}</div>`:''}</td><td width="10%" align="center"><div style="font-size:28px;color:#C9A84C">→</div></td><td width="45%" align="right"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;color:#94A3B8;letter-spacing:2px;margin-bottom:4px;text-align:right">DROP-OFF AT</div><div style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#0B1F3A;text-align:right">${d.dropoffLocation||'—'}</div>${d.dropoffAddress?`<div style="font-family:Arial,sans-serif;font-size:11px;color:#475569;margin-top:3px;text-align:right">${d.dropoffAddress}</div>`:''}</td></tr></table></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:18px 32px">${grid([['PASSENGER',d.passengerName||'—'],['PICKUP DATE',fmtDate(d.pickupDate)],['PICKUP TIME',d.pickupTime||'—'],['VEHICLE',d.vehicleType||'—'],['PAX',d.pax||'—'],['LUGGAGE',`${d.luggage||'0'} pcs`]])}</td></tr></table>
${(d.driverName||d.driverPhone||d.vehicleReg)?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;border-bottom:1px solid #E2E8F0"><tr><td style="padding:12px 32px;font-family:Arial,sans-serif;font-size:12px;color:#475569">🧑‍✈️ <strong>Driver:</strong> ${d.driverName||'TBC'}${d.driverPhone?` &nbsp;·&nbsp; 📞 ${d.driverPhone}`:''}${d.vehicleReg?` &nbsp;·&nbsp; 🚗 ${d.vehicleReg}`:''}</td></tr></table>`:''}
${(d.confirmationNumber||d.provider||d.flightRef)?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:12px 32px"><table cellpadding="0" cellspacing="0"><tr>${d.confirmationNumber?`<td style="padding:0 20px 0 0;font-family:Arial,sans-serif;font-size:10px"><span style="color:#94A3B8">Confirmation: </span><strong style="color:#0B1F3A">${d.confirmationNumber}</strong></td>`:''}${d.provider?`<td style="${d.confirmationNumber?'border-left:1px solid #E2E8F0;padding:0 20px;':''}font-family:Arial,sans-serif;font-size:10px"><span style="color:#94A3B8">Provider: </span><strong style="color:#0B1F3A">${d.provider}</strong></td>`:''}${d.flightRef?`<td style="border-left:1px solid #E2E8F0;padding:0 0 0 20px;font-family:Arial,sans-serif;font-size:10px"><span style="color:#94A3B8">Flight Ref: </span><strong style="color:#0B1F3A">${d.flightRef}</strong></td>`:''}<td style="border-left:1px solid #E2E8F0;padding:0 0 0 20px;font-family:Arial,sans-serif;font-size:10px"><span style="color:#94A3B8">Ticket Ref: </span><strong style="color:#0B1F3A">${ref}</strong></td></tr></table></td></tr></table>`:''}
${d.totalCost?`<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border-bottom:1px solid #FDE68A"><tr><td style="padding:12px 32px;font-family:Arial,sans-serif;font-size:12px;color:#92400E">Total: <strong style="font-size:18px;color:#0B1F3A">${d.currency} ${d.totalCost}</strong></td></tr></table>`:''}
${d.notes?`<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #E2E8F0"><tr><td style="padding:14px 32px;font-family:Arial,sans-serif;font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</td></tr></table>`:''}
${FTR}</div>`
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ visible, onClose, onResend }: {
  visible: boolean; onClose: () => void
  onResend: (html: string, email: string) => void
}) {
  const [tickets, setTickets] = useState<SavedTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/tickets/save')
    const d = await r.json()
    setTickets(d.tickets ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (visible) load() }, [visible, load])

  if (!visible) return null

  const TYPE_COLOR: Record<string,string> = {
    FLIGHT: 'bg-blue-100 text-blue-700', HOTEL: 'bg-purple-100 text-purple-700',
    TOUR: 'bg-green-100 text-green-700', TRANSFER: 'bg-orange-100 text-orange-700',
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-white flex flex-col h-full shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-bold text-[#0B1F3A] text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-[#C9A84C]" /> Ticket History
          </h2>
          <div className="flex gap-1">
            <button onClick={load} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>}
          {!loading && tickets.length === 0 && <p className="text-center text-gray-400 text-sm py-12">No tickets saved yet.</p>}
          {tickets.map(t => (
            <div key={t.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${TYPE_COLOR[t.ticketType] || 'bg-gray-100 text-gray-600'}`}>{t.ticketType}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0B1F3A] truncate">{t.ticketNumber}</div>
                    <div className="text-[11px] text-gray-400 truncate">{t.clientName} · {t.clientEmail}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {t.sentAt ? <span className="text-[10px] text-green-600 font-semibold">Sent</span>
                    : <span className="text-[10px] text-gray-400">Unsent</span>}
                  {expanded === t.id
                    ? <ChevronDown className="w-3 h-3 text-gray-400 ml-1 inline" />
                    : <ChevronRight className="w-3 h-3 text-gray-400 ml-1 inline" />}
                </div>
              </button>
              {expanded === t.id && (
                <div className="border-t border-gray-100 p-3 bg-gray-50 flex gap-2">
                  <button onClick={() => onResend('', t.clientEmail)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold rounded-lg">
                    <Send className="w-3 h-3" /> Resend to {t.clientEmail}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const [tab,      setTab]      = useState<TicketTab>('FLIGHT')
  const [flight,   setFlight]   = useState<FlightData>(defFlight())
  const [hotel,    setHotel]    = useState<HotelData>(defHotel())
  const [tour,     setTour]     = useState<TourData>(defTour())
  const [transfer, setTransfer] = useState<TransferData>(defTransfer())

  const [bookings,   setBookings]   = useState<DBBooking[]>([])
  const [selBooking, setSelBooking] = useState('')

  const [emailTo,   setEmailTo]   = useState('')
  const [ticketRef, setTicketRef] = useState('WALZ-TKT-DRAFT')
  const [savedId,   setSavedId]   = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [history,   setHistory]   = useState(false)

  useEffect(() => {
    fetch('/api/admin/tickets/bookings').then(r => r.json()).then(d => setBookings(d.bookings ?? [])).catch(() => {})
  }, [])

  // Pull from booking
  useEffect(() => {
    if (!selBooking) return
    const bk = bookings.find(b => b.id === selBooking)
    if (!bk) return

    if (bk.type === 'FLIGHT' && bk.flightDetails) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segs = [...(bk.flightDetails.outbound ?? []), ...(bk.flightDetails.inbound ?? [])].map((s: any) => ({
        ...defSeg(),
        airline:       s.airline || '',
        airlineCode:   s.airlineCode || '',
        flightNumber:  s.flightNumber || '',
        aircraft:      s.aircraft || '',
        fromCode:      s.departureAirport?.slice(-3) || '',
        fromAirport:   s.departureAirport || '',
        toCode:        s.arrivalAirport?.slice(-3) || '',
        toAirport:     s.arrivalAirport || '',
        departureDate: s.departureTime?.split('T')[0] || '',
        departureTime: s.departureTime?.split('T')[1]?.slice(0,5) || '',
        arrivalDate:   s.arrivalTime?.split('T')[0] || '',
        arrivalTime:   s.arrivalTime?.split('T')[1]?.slice(0,5) || '',
        duration:      s.duration ? `${Math.floor(s.duration/60)}h ${s.duration%60}m` : '',
        cabinClass:    s.cabinClass || 'Economy',
        bookingCode:   s.bookingCode || '',
      }))
      const pax = (bk.passengers ?? []).map(p => ({ ...defPax(), name: `${p.firstName} ${p.lastName}`.trim(), passportNumber: p.passportNumber || '', nationality: p.nationality || '', dob: p.dateOfBirth || '' }))
      setFlight(f => ({ ...f, pnr: bk.pnr || bk.bookingReference, segments: segs.length ? segs : [defSeg()], passengers: pax.length ? pax : [defPax()], clientEmail: bk.contactEmail, clientPhone: bk.contactPhone || '', notes: bk.notes || '' }))
      setEmailTo(bk.contactEmail); setTab('FLIGHT')
    }
    if (bk.type === 'HOTEL' && bk.hotelDetails) {
      const hd = bk.hotelDetails
      const p0 = bk.passengers?.[0]
      setHotel(h => ({ ...h, confirmationNumber: bk.bookingReference, guestName: p0 ? `${p0.firstName} ${p0.lastName}`.trim() : h.guestName, guestEmail: bk.contactEmail, guestPhone: bk.contactPhone || '', hotelName: hd.name || '', hotelAddress: hd.address?.lines?.join(', ') || '', hotelCity: hd.address?.city || '', hotelCountry: hd.address?.country || '', hotelStars: String(hd.stars || 4), roomType: hd.roomType || '', mealPlan: hd.mealPlan || 'Room Only', checkInDate: hd.checkIn?.split('T')[0] || '', checkOutDate: hd.checkOut?.split('T')[0] || '', totalCost: hd.totalPrice ? String(hd.totalPrice.amount) : '', currency: hd.totalPrice?.currency || bk.currency }))
      setEmailTo(bk.contactEmail); setTab('HOTEL')
    }
    if (bk.type === 'TRANSFER') {
      const p0 = bk.passengers?.[0]
      setTransfer(t => ({ ...t, confirmationNumber: bk.bookingReference, passengerName: p0 ? `${p0.firstName} ${p0.lastName}`.trim() : t.passengerName, passengerEmail: bk.contactEmail, passengerPhone: bk.contactPhone || '', totalCost: String(bk.totalAmount), currency: bk.currency }))
      setEmailTo(bk.contactEmail); setTab('TRANSFER')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selBooking])

  function getHtml() {
    if (tab === 'FLIGHT')   return buildFlightHtml(flight, ticketRef)
    if (tab === 'HOTEL')    return buildHotelHtml(hotel, ticketRef)
    if (tab === 'TOUR')     return buildTourHtml(tour, ticketRef)
    return buildTransferHtml(transfer, ticketRef)
  }
  function getClient() {
    if (tab === 'FLIGHT')   return { name: flight.passengers[0]?.name || 'Client', email: flight.clientEmail }
    if (tab === 'HOTEL')    return { name: hotel.guestName || 'Client', email: hotel.guestEmail }
    if (tab === 'TOUR')     return { name: tour.guestName || 'Client', email: tour.guestEmail }
    return { name: transfer.passengerName || 'Client', email: transfer.passengerEmail }
  }

  async function handleSave() {
    setSaving(true)
    const { name, email } = getClient()
    const data = tab==='FLIGHT' ? flight : tab==='HOTEL' ? hotel : tab==='TOUR' ? tour : transfer
    const r = await fetch('/api/admin/tickets/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: selBooking||null, ticketType: tab, clientName: name, clientEmail: email||emailTo, data, htmlSnapshot: getHtml() }),
    })
    const d = await r.json()
    if (d.ticket) { setSavedId(d.ticket.id); setTicketRef(d.ticket.ticketNumber) }
    setSaving(false)
  }

  async function handleSend(emailOverride?: string) {
    const to = emailOverride || emailTo
    if (!to) return
    setSending(true)
    const { name } = getClient()
    const labels: Record<TicketTab,string> = { FLIGHT:'Flight', HOTEL:'Hotel', TOUR:'Tour', TRANSFER:'Transfer' }
    await fetch('/api/admin/tickets/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: savedId, to, subject: `Your ${labels[tab]} Confirmation — ${name} — Walz Travels`, html: getHtml(), type: tab }),
    })
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  function handlePrint() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title><style>body{margin:0;padding:20px;background:#f1f5f9}@media print{body{background:#fff;padding:0}}</style></head><body>${getHtml()}</body></html>`)
    w.document.close(); w.print()
  }

  function handleReset() {
    if (tab==='FLIGHT') setFlight(defFlight())
    else if (tab==='HOTEL') setHotel(defHotel())
    else if (tab==='TOUR') setTour(defTour())
    else setTransfer(defTransfer())
    setSavedId(null); setTicketRef('WALZ-TKT-DRAFT')
  }

  const TABS = [
    { type: 'FLIGHT',   icon: Plane,     label: 'Flight Ticket',         color: 'text-blue-600'   },
    { type: 'HOTEL',    icon: Building2, label: 'Hotel Confirmation',    color: 'text-purple-600' },
    { type: 'TOUR',     icon: MapPin,    label: 'Tour Voucher',          color: 'text-green-600'  },
    { type: 'TRANSFER', icon: Car,       label: 'Transfer Confirmation', color: 'text-orange-600' },
  ] as const

  const previewHtml = getHtml()

  return (
    <>
      <HistoryPanel visible={history} onClose={() => setHistory(false)}
        onResend={(_, email) => { setHistory(false); handleSend(email) }} />

      <div className="space-y-5 max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1F3A] flex items-center gap-2">
              <Ticket className="w-6 h-6 text-[#C9A84C]" /> Ticket Generator
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">Emirates-style travel documents with full airport timing guidance</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setHistory(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50">
              <History className="w-3.5 h-3.5" /> Ticket History
            </button>
            <select value={selBooking} onChange={e => setSelBooking(e.target.value)}
              className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#C9A84C] text-gray-600 min-w-[240px]">
              <option value="">Pull from confirmed booking…</option>
              {bookings.map(b => <option key={b.id} value={b.id}>{b.bookingReference} — {b.type} — {b.contactEmail}</option>)}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.type} onClick={() => setTab(t.type as TicketTab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab===t.type ? 'bg-[#0B1F3A] text-white shadow-lg' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <Icon className={`w-4 h-4 ${tab===t.type ? 'text-[#C9A84C]' : t.color}`} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* ── FORM ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-[#0B1F3A] text-sm">Enter Details</h2>
              <button onClick={handleReset} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><RefreshCw className="w-3 h-3" /> Reset</button>
            </div>
            <div className="p-5 max-h-[calc(100vh-260px)] overflow-y-auto">

              {/* FLIGHT */}
              {tab === 'FLIGHT' && (
                <div className="grid grid-cols-3 gap-3">
                  <Hr c="Booking" />
                  <F label="PNR / Ref" value={flight.pnr} onChange={v => setFlight(f=>({...f,pnr:v}))} placeholder="ABC123" />
                  <F label="Issue Date" value={flight.ticketIssueDate} onChange={v => setFlight(f=>({...f,ticketIssueDate:v}))} type="date" />
                  <div><Lbl c="Third-party?" /><label className="flex items-center gap-2 h-9 text-sm cursor-pointer"><input type="checkbox" checked={flight.isThirdParty} onChange={e=>setFlight(f=>({...f,isThirdParty:e.target.checked}))} className="rounded" /> Show operated-by</label></div>
                  {flight.isThirdParty && <F label="Operated by" value={flight.originalAirline} onChange={v=>setFlight(f=>({...f,originalAirline:v}))} span={2} />}

                  <Hr c="Airport Timing Guidance" />
                  <F label="Arrive airport by" value={flight.arriveAirportBy} onChange={v=>setFlight(f=>({...f,arriveAirportBy:v}))} options={['3 hours before departure','2.5 hours before departure','2 hours before departure','1 hour before departure']} span={2} />
                  <F label="Check-in opens" value={flight.checkInOpens} onChange={v=>setFlight(f=>({...f,checkInOpens:v}))} options={['24 hours before departure','48 hours before departure','3 hours before departure']} />
                  <F label="Check-in deadline" value={flight.checkInDeadline} onChange={v=>setFlight(f=>({...f,checkInDeadline:v}))} options={['3 hours before departure (international)','2 hours before departure (international)','45 minutes before departure (domestic)','60 minutes before departure']} span={2} />
                  <div><Lbl c="Gate closes (mins)" /><input type="number" value={flight.gateClosesMins} onChange={e=>setFlight(f=>({...f,gateClosesMins:parseInt(e.target.value)||20}))} className={inp} min={5} max={60} /></div>
                  <F label="Lounge access" value={flight.loungeAccess} onChange={v=>setFlight(f=>({...f,loungeAccess:v}))} options={['None','Business Class Lounge','Marhaba Lounge','Skywards Lounge','Airport Lounge Access']} span={2} />

                  {flight.segments.map((seg, si) => (
                    <div key={si} className="col-span-3 bg-gray-50 rounded-xl p-4 relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-[#0B1F3A] tracking-wider uppercase">✈ {flight.segments.length>1 ? `Segment ${si+1}` : 'Flight Segment'}</span>
                        {flight.segments.length > 1 && <button onClick={()=>setFlight(f=>({...f,segments:f.segments.filter((_,i)=>i!==si)}))} className="w-5 h-5 rounded-full bg-red-100 text-red-400 flex items-center justify-center"><X className="w-3 h-3" /></button>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['airline','airlineCode','flightNumber','aircraft'] as const).map((k,j) => (
                          <div key={k}><Lbl c={['Airline','Code (e.g. BA)','Flight No.','Aircraft'][j]} />
                          <input value={seg[k]} onChange={e=>setFlight(f=>({...f,segments:f.segments.map((s,i)=>i===si?{...s,[k]:e.target.value}:s)}))} placeholder={['British Airways','BA','BA001','Boeing 777'][j]} className={inp} /></div>
                        ))}
                        <div className="col-span-3 pt-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Departure</div>
                        {(['fromAirport','fromCode','fromCity','fromTerminal','departureDate','departureTime'] as const).map((k2,i2) => (
                          <div key={k2}><Lbl c={['Departure Airport','IATA','City','Terminal','Date','Time'][i2]} />
                          <input type={k2.includes('Date')?'date':k2.includes('Time')?'time':'text'}
                            value={seg[k2] as string}
                            onChange={e=>setFlight(f=>({...f,segments:f.segments.map((s,i)=>i===si?{...s,[k2]:e.target.value}:s)}))}
                            className={inp} /></div>
                        ))}
                        <div className="col-span-3 pt-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Arrival</div>
                        {(['toAirport','toCode','toCity','toTerminal','arrivalDate','arrivalTime'] as const).map((k2,i2) => (
                          <div key={k2}><Lbl c={['Arrival Airport','IATA','City','Terminal','Date','Time'][i2]} />
                          <input type={k2.includes('Date')?'date':k2.includes('Time')?'time':'text'}
                            value={seg[k2] as string}
                            onChange={e=>setFlight(f=>({...f,segments:f.segments.map((s,i)=>i===si?{...s,[k2]:e.target.value}:s)}))}
                            className={inp} /></div>
                        ))}
                        <div className="col-span-3 pt-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class & Extras</div>
                        <div><Lbl c="Cabin Class" /><select value={seg.cabinClass} onChange={e=>setFlight(f=>({...f,segments:f.segments.map((s,i)=>i===si?{...s,cabinClass:e.target.value}:s)}))} className={sel}>{['Economy','Premium Economy','Business','First Class'].map(o=><option key={o}>{o}</option>)}</select></div>
                        {(['duration','bookingCode','baggageChecked','baggageCarryOn','mealService'] as const).map((k2,i2) => (
                          <div key={k2}><Lbl c={['Duration','Booking Class','Checked Bag','Cabin Bag','Meal'][i2]} />
                          <input value={seg[k2]} onChange={e=>setFlight(f=>({...f,segments:f.segments.map((s,i)=>i===si?{...s,[k2]:e.target.value}:s)}))} placeholder={['5h 35m','V','23kg','7kg','Standard'][i2]} className={inp} /></div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="col-span-3"><button onClick={()=>setFlight(f=>({...f,segments:[...f.segments,defSeg()]}))} className="flex items-center gap-1 text-xs text-[#C9A84C] font-bold hover:underline"><Plus className="w-3 h-3" /> Add Return / Connecting Segment</button></div>

                  <Hr c="Passengers" />
                  {flight.passengers.map((p, pi) => (
                    <div key={pi} className="col-span-3 bg-gray-50 rounded-xl p-3 relative">
                      <div className="grid grid-cols-3 gap-2">
                        {(['name','seat','eTicket','passportNumber','nationality','dob'] as const).map((k,j) => (
                          <div key={k}><Lbl c={['Full Name','Seat No.','e-Ticket No.','Passport No.','Nationality','Date of Birth'][j]} />
                          <input type={k==='dob'?'date':'text'} value={p[k]}
                            onChange={e=>setFlight(f=>({...f,passengers:f.passengers.map((px,j2)=>j2===pi?{...px,[k]:e.target.value}:px)}))}
                            placeholder={['JOHN ADEYEMI','14A','125-123456789','','British',''][j]} className={inp} /></div>
                        ))}
                      </div>
                      {flight.passengers.length > 1 && <button onClick={()=>setFlight(f=>({...f,passengers:f.passengers.filter((_,j)=>j!==pi)}))} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-100 text-red-400 flex items-center justify-center"><X className="w-3 h-3" /></button>}
                    </div>
                  ))}
                  <div className="col-span-3"><button onClick={()=>setFlight(f=>({...f,passengers:[...f.passengers,defPax()]}))} className="flex items-center gap-1 text-xs text-[#C9A84C] font-bold hover:underline"><Plus className="w-3 h-3" /> Add Passenger</button></div>

                  <Hr c="Client Contact" />
                  <F label="Client Email" value={flight.clientEmail} onChange={v=>{setFlight(f=>({...f,clientEmail:v}));setEmailTo(v)}} type="email" placeholder="client@email.com" span={2} />
                  <F label="Phone" value={flight.clientPhone} onChange={v=>setFlight(f=>({...f,clientPhone:v}))} placeholder="+44 7…" />
                  <F label="Additional Notes" value={flight.notes} onChange={v=>setFlight(f=>({...f,notes:v}))} textarea span={3} />
                </div>
              )}

              {/* HOTEL */}
              {tab === 'HOTEL' && (
                <div className="grid grid-cols-3 gap-3">
                  <Hr c="Guest" />
                  <F label="Guest Name" value={hotel.guestName} onChange={v=>setHotel(h=>({...h,guestName:v}))} placeholder="John Adeyemi" />
                  <F label="Email" value={hotel.guestEmail} onChange={v=>{setHotel(h=>({...h,guestEmail:v}));setEmailTo(v)}} type="email" />
                  <F label="Phone" value={hotel.guestPhone} onChange={v=>setHotel(h=>({...h,guestPhone:v}))} />
                  <Hr c="Hotel" />
                  <F label="Hotel Name" value={hotel.hotelName} onChange={v=>setHotel(h=>({...h,hotelName:v}))} placeholder="The Savoy" span={2} />
                  <F label="Stars" value={hotel.hotelStars} onChange={v=>setHotel(h=>({...h,hotelStars:v}))} options={['3','4','5']} />
                  <F label="Address" value={hotel.hotelAddress} onChange={v=>setHotel(h=>({...h,hotelAddress:v}))} span={2} />
                  <F label="City" value={hotel.hotelCity} onChange={v=>setHotel(h=>({...h,hotelCity:v}))} />
                  <F label="Country" value={hotel.hotelCountry} onChange={v=>setHotel(h=>({...h,hotelCountry:v}))} />
                  <F label="Hotel Phone" value={hotel.hotelPhone} onChange={v=>setHotel(h=>({...h,hotelPhone:v}))} />
                  <F label="Website" value={hotel.hotelWebsite} onChange={v=>setHotel(h=>({...h,hotelWebsite:v}))} />
                  <F label="Confirmation No." value={hotel.confirmationNumber} onChange={v=>setHotel(h=>({...h,confirmationNumber:v}))} span={2} />
                  <F label="Google Maps URL (optional)" value={hotel.googleMapsUrl} onChange={v=>setHotel(h=>({...h,googleMapsUrl:v}))} span={3} />
                  <Hr c="Stay" />
                  <F label="Check-in Date" value={hotel.checkInDate} onChange={v=>setHotel(h=>({...h,checkInDate:v}))} type="date" />
                  <F label="Check-in Time" value={hotel.checkInTime} onChange={v=>setHotel(h=>({...h,checkInTime:v}))} type="time" />
                  <F label="Room Type" value={hotel.roomType} onChange={v=>setHotel(h=>({...h,roomType:v}))} />
                  <F label="Check-out Date" value={hotel.checkOutDate} onChange={v=>setHotel(h=>({...h,checkOutDate:v}))} type="date" />
                  <F label="Check-out Time" value={hotel.checkOutTime} onChange={v=>setHotel(h=>({...h,checkOutTime:v}))} type="time" />
                  <F label="Room Number" value={hotel.roomNumber} onChange={v=>setHotel(h=>({...h,roomNumber:v}))} placeholder="412" />
                  <F label="Guests" value={hotel.guests} onChange={v=>setHotel(h=>({...h,guests:v}))} placeholder="2" />
                  <F label="Rooms" value={hotel.rooms} onChange={v=>setHotel(h=>({...h,rooms:v}))} placeholder="1" />
                  <F label="Meal Plan" value={hotel.mealPlan} onChange={v=>setHotel(h=>({...h,mealPlan:v}))} options={['Room Only','Bed & Breakfast','Half Board','Full Board','All Inclusive']} />
                  <Hr c="Cost" />
                  <F label="Currency" value={hotel.currency} onChange={v=>setHotel(h=>({...h,currency:v}))} options={['GBP','USD','EUR','AED','NGN','GHS','CAD']} />
                  <F label="Rate / Night" value={hotel.ratePerNight} onChange={v=>setHotel(h=>({...h,ratePerNight:v}))} placeholder="450" />
                  <F label="Total Cost" value={hotel.totalCost} onChange={v=>setHotel(h=>({...h,totalCost:v}))} placeholder="1350" />
                  <F label="Special Requests" value={hotel.specialRequests} onChange={v=>setHotel(h=>({...h,specialRequests:v}))} span={3} textarea />
                  <F label="Notes" value={hotel.notes} onChange={v=>setHotel(h=>({...h,notes:v}))} span={3} textarea />
                </div>
              )}

              {/* TOUR */}
              {tab === 'TOUR' && (
                <div className="grid grid-cols-3 gap-3">
                  <Hr c="Guest" />
                  <F label="Guest Name" value={tour.guestName} onChange={v=>setTour(t=>({...t,guestName:v}))} />
                  <F label="Email" value={tour.guestEmail} onChange={v=>{setTour(t=>({...t,guestEmail:v}));setEmailTo(v)}} type="email" />
                  <F label="Phone" value={tour.guestPhone} onChange={v=>setTour(t=>({...t,guestPhone:v}))} />
                  <Hr c="Tour Details" />
                  <F label="Tour Name" value={tour.tourName} onChange={v=>setTour(t=>({...t,tourName:v}))} span={2} />
                  <F label="Voucher No." value={tour.confirmationNumber} onChange={v=>setTour(t=>({...t,confirmationNumber:v}))} />
                  <F label="Operator" value={tour.operator} onChange={v=>setTour(t=>({...t,operator:v}))} span={2} />
                  <F label="Destination" value={tour.destination} onChange={v=>setTour(t=>({...t,destination:v}))} />
                  <Hr c="Schedule" />
                  <F label="Tour Date" value={tour.tourDate} onChange={v=>setTour(t=>({...t,tourDate:v}))} type="date" />
                  <F label="Start Time" value={tour.startTime} onChange={v=>setTour(t=>({...t,startTime:v}))} type="time" />
                  <F label="End Time" value={tour.endTime} onChange={v=>setTour(t=>({...t,endTime:v}))} type="time" />
                  <F label="Duration" value={tour.duration} onChange={v=>setTour(t=>({...t,duration:v}))} placeholder="6 hours" />
                  <F label="Guests" value={tour.guests} onChange={v=>setTour(t=>({...t,guests:v}))} placeholder="2" />
                  <F label="Meeting Point" value={tour.meetingPoint} onChange={v=>setTour(t=>({...t,meetingPoint:v}))} />
                  <Hr c="Guide & Pickup" />
                  <F label="Guide Name" value={tour.guideName} onChange={v=>setTour(t=>({...t,guideName:v}))} />
                  <F label="Guide Phone" value={tour.guidePhone} onChange={v=>setTour(t=>({...t,guidePhone:v}))} />
                  <div><Lbl c="Pickup included?" /><label className="flex items-center gap-2 h-9 text-sm cursor-pointer"><input type="checkbox" checked={tour.pickupIncluded} onChange={e=>setTour(t=>({...t,pickupIncluded:e.target.checked}))} className="rounded" /> Yes</label></div>
                  {tour.pickupIncluded && <F label="Pickup Location" value={tour.pickupLocation} onChange={v=>setTour(t=>({...t,pickupLocation:v}))} span={3} />}
                  <Hr c="Cost & Notes" />
                  <F label="Currency" value={tour.currency} onChange={v=>setTour(t=>({...t,currency:v}))} options={['GBP','USD','EUR','AED','NGN','GHS','CAD']} />
                  <F label="Total Cost" value={tour.totalCost} onChange={v=>setTour(t=>({...t,totalCost:v}))} span={2} />
                  <F label="Inclusions" value={tour.inclusions} onChange={v=>setTour(t=>({...t,inclusions:v}))} textarea span={3} />
                  <F label="Exclusions" value={tour.exclusions} onChange={v=>setTour(t=>({...t,exclusions:v}))} textarea span={3} />
                  <F label="Notes" value={tour.notes} onChange={v=>setTour(t=>({...t,notes:v}))} textarea span={3} />
                </div>
              )}

              {/* TRANSFER */}
              {tab === 'TRANSFER' && (
                <div className="grid grid-cols-3 gap-3">
                  <Hr c="Passenger" />
                  <F label="Passenger Name" value={transfer.passengerName} onChange={v=>setTransfer(t=>({...t,passengerName:v}))} />
                  <F label="Email" value={transfer.passengerEmail} onChange={v=>{setTransfer(t=>({...t,passengerEmail:v}));setEmailTo(v)}} type="email" />
                  <F label="Phone" value={transfer.passengerPhone} onChange={v=>setTransfer(t=>({...t,passengerPhone:v}))} />
                  <Hr c="Route" />
                  <F label="Pickup Location" value={transfer.pickupLocation} onChange={v=>setTransfer(t=>({...t,pickupLocation:v}))} span={2} />
                  <F label="Pickup Date" value={transfer.pickupDate} onChange={v=>setTransfer(t=>({...t,pickupDate:v}))} type="date" />
                  <F label="Pickup Address" value={transfer.pickupAddress} onChange={v=>setTransfer(t=>({...t,pickupAddress:v}))} span={2} />
                  <F label="Pickup Time" value={transfer.pickupTime} onChange={v=>setTransfer(t=>({...t,pickupTime:v}))} type="time" />
                  <F label="Drop-off Location" value={transfer.dropoffLocation} onChange={v=>setTransfer(t=>({...t,dropoffLocation:v}))} span={2} />
                  <F label="Flight Ref" value={transfer.flightRef} onChange={v=>setTransfer(t=>({...t,flightRef:v}))} />
                  <F label="Drop-off Address" value={transfer.dropoffAddress} onChange={v=>setTransfer(t=>({...t,dropoffAddress:v}))} span={3} />
                  <Hr c="Vehicle & Driver" />
                  <F label="Vehicle Type" value={transfer.vehicleType} onChange={v=>setTransfer(t=>({...t,vehicleType:v}))} options={['Saloon Car','Estate Car','MPV (7-Seat)','Minibus (8-16)','Executive Saloon','Luxury Mercedes']} />
                  <F label="Passengers" value={transfer.pax} onChange={v=>setTransfer(t=>({...t,pax:v}))} placeholder="2" />
                  <F label="Luggage" value={transfer.luggage} onChange={v=>setTransfer(t=>({...t,luggage:v}))} placeholder="2" />
                  <F label="Driver Name" value={transfer.driverName} onChange={v=>setTransfer(t=>({...t,driverName:v}))} />
                  <F label="Driver Phone" value={transfer.driverPhone} onChange={v=>setTransfer(t=>({...t,driverPhone:v}))} />
                  <F label="Vehicle Reg" value={transfer.vehicleReg} onChange={v=>setTransfer(t=>({...t,vehicleReg:v}))} placeholder="AB12 CDE" />
                  <Hr c="Confirmation" />
                  <F label="Confirmation No." value={transfer.confirmationNumber} onChange={v=>setTransfer(t=>({...t,confirmationNumber:v}))} span={2} />
                  <F label="Provider" value={transfer.provider} onChange={v=>setTransfer(t=>({...t,provider:v}))} />
                  <F label="Currency" value={transfer.currency} onChange={v=>setTransfer(t=>({...t,currency:v}))} options={['GBP','USD','EUR','AED','NGN','GHS','CAD']} />
                  <F label="Total Cost" value={transfer.totalCost} onChange={v=>setTransfer(t=>({...t,totalCost:v}))} span={2} />
                  <F label="Notes / Instructions" value={transfer.notes} onChange={v=>setTransfer(t=>({...t,notes:v}))} placeholder="Meet at arrivals…" textarea span={3} />
                </div>
              )}
            </div>
          </div>

          {/* ── PREVIEW ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-[#0B1F3A] text-sm">Live Preview</h2>
                {ticketRef !== 'WALZ-TKT-DRAFT' && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">{ticketRef}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1F3A] text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5 text-[#C9A84C]" />}
                  {savedId ? 'Saved ✓' : 'Save Record'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-h-[calc(100vh-320px)] bg-slate-50">
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-white"
                dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
              {tab === 'FLIGHT' && flight.segments[0]?.departureTime && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-700">
                    Gate closes at <strong>{gateClose(flight.segments[0].departureTime, flight.gateClosesMins)}</strong> on {fmtDate(flight.segments[0].departureDate)} · {flight.gateClosesMins} min before departure
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="client@email.com" type="email"
                  className="flex-1 h-9 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white" />
                <button onClick={() => handleSend()} disabled={sending || !emailTo || sent}
                  className="flex items-center gap-1.5 px-4 h-9 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm disabled:opacity-50">
                  {sent ? <><CheckCircle className="w-3.5 h-3.5" /> Sent!</>
                    : sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                    : <><Send className="w-3.5 h-3.5" /> Email Client</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
