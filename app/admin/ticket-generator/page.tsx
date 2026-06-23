'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Plane, Hotel, MapIcon, Car, FileText, Package2,
  ChevronLeft, ChevronRight, Download, Send,
  CheckCircle, Loader2, History, LayoutTemplate,
  Plus, Trash2, AlertCircle, RefreshCw, Copy, Check, Printer,
} from 'lucide-react'
import { TicketPreview } from '@/components/admin/TicketPreview'
import { FlightTicketTemplate } from '@/components/ticket-generator/FlightTicketTemplate'
import type { FlightLeg as FlightLegType, Passenger as FlightPassenger, PricingBreakdown } from '@/types/flight-ticket'

// ─── Ticket type config ────────────────────────────────────────────────────────

const TICKET_TYPES = [
  { id: 'flight',   label: 'Flight Ticket',    icon: Plane,    bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8', desc: 'Airlines & boarding' },
  { id: 'hotel',    label: 'Hotel Voucher',     icon: Hotel,    bg: '#F0FDF4', border: '#86EFAC', text: '#15803D', desc: 'Stays & reservations' },
  { id: 'tour',     label: 'Tour Confirmation', icon: MapIcon,  bg: '#F5F3FF', border: '#C4B5FD', text: '#6D28D9', desc: 'Guided experiences' },
  { id: 'transfer', label: 'Transfer Voucher',  icon: Car,      bg: '#FFFBEB', border: '#FCD34D', text: '#B45309', desc: 'Pickups & chauffeur' },
  { id: 'visa',     label: 'Visa Appointment',  icon: FileText, bg: '#FEF2F2', border: '#FCA5A5', text: '#B91C1C', desc: 'Embassy appointments' },
  { id: 'package',  label: 'Holiday Package',   icon: Package2, bg: '#FFF7ED', border: '#C9A84C', text: '#92400E', desc: 'Full package docs' },
] as const

const INCLUSION_LABELS: Record<string, string> = {
  flights: 'Return Flights', visa: 'Visa Processing', hotel: 'Hotel Accommodation',
  transfers: 'Airport Transfers', tours: 'Tour Experiences',
  insurance: 'Travel Insurance', esim: 'eSIM Connectivity',
}
const INCLUSION_KEYS = ['flights', 'visa', 'hotel', 'transfers', 'tours', 'insurance', 'esim'] as const

const STEPS = ['Ticket Type', 'Client Info', 'Booking Details', 'Message & Send']

// ─── State types ───────────────────────────────────────────────────────────────

interface Passenger { name: string; passport: string; seat: string }

// ── New flight ticket types (multi-leg) ──────────────────────────────────────

interface FlightTicketData {
  pnr:          string
  tripType:     'one-way' | 'return'
  bookingDate:  string
  outbound:     FlightLegType[]
  inbound:      FlightLegType[]
  passengers:   FlightPassenger[]
  includePricing: boolean
  pricing: PricingBreakdown
}
interface InclusionItem { included: boolean; note: string }

interface ClientInfo  { name: string; email: string; phone: string }
interface FlightData  { booking_ref: string; pnr: string; airline: string; flight_number: string; from_city: string; from_code: string; to_city: string; to_code: string; departure_date: string; departure_time: string; arrival_date: string; arrival_time: string; duration: string; cabin_class: string; seat_number: string; baggage_allowance: string; passport_number: string; additional_passengers: Passenger[] }
interface HotelData   { booking_ref: string; hotel_name: string; hotel_address: string; hotel_phone: string; hotel_email: string; checkin_date: string; checkin_time: string; checkout_date: string; checkout_time: string; num_nights: string; room_type: string; num_guests: string; guest_names: string; confirmation_number: string; special_requests: string }
interface TourData    { booking_ref: string; tour_name: string; tour_operator: string; guide_name: string; tour_date: string; tour_time: string; duration: string; meeting_point: string; num_guests: string; guest_names: string; pickup_included: boolean; pickup_address: string; pickup_time: string; what_included: string; what_to_bring: string; emergency_contact: string }
interface TransferData{ booking_ref: string; transfer_company: string; vehicle_type: string; driver_name: string; driver_phone: string; pickup_location: string; pickup_date: string; pickup_time: string; dropoff_location: string; flight_number: string; num_passengers: string; passenger_names: string; special_instructions: string }
interface VisaData    { reference_number: string; visa_type: string; passport_number: string; appointment_date: string; appointment_time: string; appointment_location: string; vfs_address: string; contact_person: string; contact_phone: string; documents_to_bring: string }
interface PackageData { package_reference: string; package_name: string; destination: string; travel_from: string; travel_to: string; num_travellers: string; traveller_names: string; inclusions: Record<string, InclusionItem>; total_value: string; amount_paid: string; currency: string; payment_due_date: string }

// ─── Initial state ─────────────────────────────────────────────────────────────

const BLANK_CLIENT: ClientInfo = { name: '', email: '', phone: '' }
const BLANK_FLIGHT: FlightData = { booking_ref: '', pnr: '', airline: '', flight_number: '', from_city: '', from_code: '', to_city: '', to_code: '', departure_date: '', departure_time: '', arrival_date: '', arrival_time: '', duration: '', cabin_class: 'Economy', seat_number: '', baggage_allowance: '23kg', passport_number: '', additional_passengers: [] }
const BLANK_LEG: FlightLegType = {
  flightNumber: '', airline: '', aircraft: '', operatedBy: '',
  departureCode: '', departureCity: '', departureAirport: '', departureCountry: '', departureTerminal: '',
  departureDate: '', departureTime: '',
  arrivalCode: '', arrivalCity: '', arrivalAirport: '', arrivalCountry: '', arrivalTerminal: '',
  arrivalDate: '', arrivalTime: '', arrivalNextDay: false,
  duration: '', cabinClass: 'Economy', baggage: '23kg', seat: '', mealPreference: '', connectionTime: '',
}
const BLANK_FLIGHT_PASSENGER: FlightPassenger = {
  title: 'Mr', firstName: '', lastName: '', eTicketNumber: '', cabinClass: 'Economy',
  seat: '', meal: '', passport: '', nationality: '', dob: '', frequentFlyer: '',
}
const BLANK_FLIGHT_TICKET: FlightTicketData = {
  pnr: '', tripType: 'one-way', bookingDate: new Date().toISOString().split('T')[0],
  outbound: [{ ...BLANK_LEG }],
  inbound:  [],
  passengers: [{ ...BLANK_FLIGHT_PASSENGER }],
  includePricing: false,
  pricing: { currency: 'USD', currencySymbol: '$', baseFare: 0, taxes: 0, total: 0, passengerCount: 1, grandTotal: 0, lineItems: [] },
}
const BLANK_HOTEL: HotelData = { booking_ref: '', hotel_name: '', hotel_address: '', hotel_phone: '', hotel_email: '', checkin_date: '', checkin_time: '14:00', checkout_date: '', checkout_time: '12:00', num_nights: '', room_type: '', num_guests: '1', guest_names: '', confirmation_number: '', special_requests: '' }
const BLANK_TOUR: TourData = { booking_ref: '', tour_name: '', tour_operator: '', guide_name: '', tour_date: '', tour_time: '', duration: '', meeting_point: '', num_guests: '1', guest_names: '', pickup_included: false, pickup_address: '', pickup_time: '', what_included: '', what_to_bring: '', emergency_contact: '' }
const BLANK_TRANSFER: TransferData = { booking_ref: '', transfer_company: '', vehicle_type: 'Sedan', driver_name: '', driver_phone: '', pickup_location: '', pickup_date: '', pickup_time: '', dropoff_location: '', flight_number: '', num_passengers: '1', passenger_names: '', special_instructions: '' }
const BLANK_VISA: VisaData = { reference_number: '', visa_type: 'Tourist', passport_number: '', appointment_date: '', appointment_time: '', appointment_location: '', vfs_address: '', contact_person: '', contact_phone: '', documents_to_bring: '' }
const BLANK_PACKAGE: PackageData = { package_reference: '', package_name: '', destination: '', travel_from: '', travel_to: '', num_travellers: '1', traveller_names: '', inclusions: Object.fromEntries(INCLUSION_KEYS.map(k => [k, { included: ['flights','hotel','transfers'].includes(k), note: '' }])), total_value: '', amount_paid: '', currency: 'USD', payment_due_date: '' }

// ─── Shared input helpers ──────────────────────────────────────────────────────

const base = 'w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition'

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
        {label}{req && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 rounded-full bg-[#C9A84C] flex-shrink-0" />
        <span className="text-[10px] font-bold text-[#0B1F3A] uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  )
}

// ─── STEP 1: Ticket Type ────────────────────────────────────────────────────────

function Step1({ ticketType, setTicketType }: { ticketType: string; setTicketType: (t: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Choose the type of travel document to generate.</p>
      <div className="grid grid-cols-2 gap-3">
        {TICKET_TYPES.map(({ id, label, icon: Icon, bg, border, text, desc }) => {
          const active = ticketType === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTicketType(id)}
              className="relative flex flex-col items-start gap-2 p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm"
              style={{ backgroundColor: active ? bg : '#FAFAFA', borderColor: active ? border : '#E5E7EB' }}
            >
              {active && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: text }}>
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="p-1.5 rounded-lg" style={{ backgroundColor: active ? text + '20' : '#F3F4F6' }}>
                <Icon className="w-4 h-4" style={{ color: active ? text : '#9CA3AF' }} />
              </div>
              <div>
                <div className="text-xs font-bold" style={{ color: active ? text : '#374151' }}>{label}</div>
                <div className="text-[10px] text-gray-400">{desc}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── STEP 2: Client Info ────────────────────────────────────────────────────────

function Step2({ client, setClient }: { client: ClientInfo; setClient: (c: ClientInfo) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Client information that will appear on the document.</p>
      <F label="Full Name" req>
        <input className={base} type="text" placeholder="e.g. John Doe" value={client.name}
          onChange={e => setClient({ ...client, name: e.target.value })} />
      </F>
      <F label="Email Address" req>
        <input className={base} type="email" placeholder="john@example.com" value={client.email}
          onChange={e => setClient({ ...client, email: e.target.value })} />
      </F>
      <F label="Phone / WhatsApp">
        <input className={base} type="tel" placeholder="+44 7000 000000" value={client.phone}
          onChange={e => setClient({ ...client, phone: e.target.value })} />
      </F>
    </div>
  )
}

// ─── STEP 3 variants ───────────────────────────────────────────────────────────

// ─── NEW FLIGHT TICKET STEP (multi-leg, passengers, pricing) ──────────────────

function LegForm({
  leg, index, total, direction,
  onChange, onRemove,
}: {
  leg: FlightLegType
  index: number
  total: number
  direction: 'outbound' | 'inbound'
  onChange: (l: FlightLegType) => void
  onRemove: () => void
}) {
  const s = (k: keyof FlightLegType, v: unknown) => onChange({ ...leg, [k]: v })
  const isLast = index === total - 1
  const label = direction === 'outbound' ? 'Outbound' : 'Inbound'

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0B1F3A]">
        <span className="text-[10px] font-bold text-[#C9A84C] uppercase tracking-wider">
          {label} Leg {index + 1}
        </span>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-300 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="p-4 space-y-3">
        <Row>
          <F label="Flight Number" req>
            <input className={base} placeholder="BA 0076" value={leg.flightNumber}
              onChange={e => s('flightNumber', e.target.value)} />
          </F>
          <F label="Airline" req>
            <input className={base} placeholder="Airline name" value={leg.airline}
              onChange={e => s('airline', e.target.value)} />
          </F>
        </Row>
        <Row>
          <F label="Aircraft (optional)">
            <input className={base} placeholder="Boeing 777-300ER" value={leg.aircraft ?? ''}
              onChange={e => s('aircraft', e.target.value)} />
          </F>
          <F label="Operated By (optional)">
            <input className={base} placeholder="Operated by name" value={leg.operatedBy ?? ''}
              onChange={e => s('operatedBy', e.target.value)} />
          </F>
        </Row>

        <div className="border-t border-gray-200 pt-3">
          <div className="text-[9px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-blue-400 rounded-full" />Departure
          </div>
          <div className="grid grid-cols-3 gap-2">
            <F label="IATA Code" req>
              <input className={base} placeholder="LOS" maxLength={3}
                value={leg.departureCode} onChange={e => s('departureCode', e.target.value.toUpperCase())} />
            </F>
            <F label="City" req>
              <input className={base} placeholder="Lagos" value={leg.departureCity}
                onChange={e => s('departureCity', e.target.value)} />
            </F>
            <F label="Terminal">
              <input className={base} placeholder="T1" value={leg.departureTerminal ?? ''}
                onChange={e => s('departureTerminal', e.target.value)} />
            </F>
          </div>
          <Row>
            <F label="Airport Name">
              <input className={base} placeholder="Murtala Muhammed International" value={leg.departureAirport}
                onChange={e => s('departureAirport', e.target.value)} />
            </F>
            <F label="Country">
              <input className={base} placeholder="Nigeria" value={leg.departureCountry}
                onChange={e => s('departureCountry', e.target.value)} />
            </F>
          </Row>
          <Row>
            <F label="Date" req>
              <input className={base} type="date" value={leg.departureDate}
                onChange={e => s('departureDate', e.target.value)} />
            </F>
            <F label="Time" req>
              <input className={base} type="time" value={leg.departureTime}
                onChange={e => s('departureTime', e.target.value)} />
            </F>
          </Row>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <div className="text-[9px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-green-400 rounded-full" />Arrival
          </div>
          <div className="grid grid-cols-3 gap-2">
            <F label="IATA Code" req>
              <input className={base} placeholder="LHR" maxLength={3}
                value={leg.arrivalCode} onChange={e => s('arrivalCode', e.target.value.toUpperCase())} />
            </F>
            <F label="City" req>
              <input className={base} placeholder="London" value={leg.arrivalCity}
                onChange={e => s('arrivalCity', e.target.value)} />
            </F>
            <F label="Terminal">
              <input className={base} placeholder="T5" value={leg.arrivalTerminal ?? ''}
                onChange={e => s('arrivalTerminal', e.target.value)} />
            </F>
          </div>
          <Row>
            <F label="Airport Name">
              <input className={base} placeholder="Heathrow Airport" value={leg.arrivalAirport}
                onChange={e => s('arrivalAirport', e.target.value)} />
            </F>
            <F label="Country">
              <input className={base} placeholder="United Kingdom" value={leg.arrivalCountry}
                onChange={e => s('arrivalCountry', e.target.value)} />
            </F>
          </Row>
          <Row>
            <F label="Date" req>
              <input className={base} type="date" value={leg.arrivalDate}
                onChange={e => s('arrivalDate', e.target.value)} />
            </F>
            <F label="Time" req>
              <input className={base} type="time" value={leg.arrivalTime}
                onChange={e => s('arrivalTime', e.target.value)} />
            </F>
          </Row>
          <div className="flex items-center gap-2 mt-1">
            <input type="checkbox" id={`nextday-${direction}-${index}`}
              checked={!!leg.arrivalNextDay}
              onChange={e => s('arrivalNextDay', e.target.checked)}
              className="rounded accent-[#C9A84C]" />
            <label htmlFor={`nextday-${direction}-${index}`} className="text-[10px] text-gray-500">
              Arrives next day (+1)
            </label>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <div className="text-[9px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-[#C9A84C] rounded-full" />Flight Details
          </div>
          <Row>
            <F label="Duration" req>
              <input className={base} placeholder="6h 30m" value={leg.duration}
                onChange={e => s('duration', e.target.value)} />
            </F>
            <F label="Cabin Class">
              <select className={base} value={leg.cabinClass} onChange={e => s('cabinClass', e.target.value)}>
                {['Economy', 'Premium Economy', 'Business', 'First Class'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
          </Row>
          <Row>
            <F label="Baggage Allowance" req>
              <input className={base} placeholder="23kg" value={leg.baggage}
                onChange={e => s('baggage', e.target.value)} />
            </F>
            <F label="Seat Number (optional)">
              <input className={base} placeholder="24A" value={leg.seat ?? ''}
                onChange={e => s('seat', e.target.value)} />
            </F>
          </Row>
          <F label="Meal Preference (optional)">
            <input className={base} placeholder="Standard / Vegetarian / Halal / Kosher..." value={leg.mealPreference ?? ''}
              onChange={e => s('mealPreference', e.target.value)} />
          </F>
          {!isLast && (
            <F label="Connection Time (optional)">
              <input className={base} placeholder="2h 15m" value={leg.connectionTime ?? ''}
                onChange={e => s('connectionTime', e.target.value)} />
            </F>
          )}
        </div>
      </div>
    </div>
  )
}

function FlightTicketStep({ d, set }: { d: FlightTicketData; set: (v: FlightTicketData) => void }) {
  const addLeg = (dir: 'outbound' | 'inbound') => {
    set({ ...d, [dir]: [...d[dir], { ...BLANK_LEG }] })
  }
  const removeLeg = (dir: 'outbound' | 'inbound', i: number) => {
    set({ ...d, [dir]: d[dir].filter((_, j) => j !== i) })
  }
  const updateLeg = (dir: 'outbound' | 'inbound', i: number, leg: FlightLegType) => {
    const arr = [...d[dir]]; arr[i] = leg
    set({ ...d, [dir]: arr })
  }
  const addPax = () => {
    set({ ...d, passengers: [...d.passengers, { ...BLANK_FLIGHT_PASSENGER }] })
  }
  const removePax = (i: number) => {
    set({ ...d, passengers: d.passengers.filter((_, j) => j !== i) })
  }
  const updatePax = (i: number, pax: FlightPassenger) => {
    const arr = [...d.passengers]; arr[i] = pax
    set({ ...d, passengers: arr })
  }
  const setPricing = (k: keyof PricingBreakdown, v: unknown) => {
    const p = { ...d.pricing, [k]: v }
    p.total = Number(p.baseFare) + Number(p.taxes) + Number(p.carrierFees ?? 0)
    p.grandTotal = p.total * Number(p.passengerCount)
    set({ ...d, pricing: p })
  }

  return (
    <div className="space-y-4">
      {/* PNR + Trip Type + Booking Date */}
      <Section title="Booking">
        <Row>
          <F label="Airline PNR" req>
            <input className={base} placeholder="ABCXYZ" maxLength={8}
              value={d.pnr} onChange={e => set({ ...d, pnr: e.target.value.toUpperCase() })} />
          </F>
          <F label="Trip Type" req>
            <select className={base} value={d.tripType}
              onChange={e => {
                const t = e.target.value as 'one-way' | 'return'
                set({ ...d, tripType: t, inbound: t === 'one-way' ? [] : (d.inbound.length ? d.inbound : [{ ...BLANK_LEG }]) })
              }}>
              <option value="one-way">One Way</option>
              <option value="return">Return</option>
            </select>
          </F>
        </Row>
        <F label="Booking Date">
          <input className={base} type="date" value={d.bookingDate}
            onChange={e => set({ ...d, bookingDate: e.target.value })} />
        </F>
      </Section>

      {/* Outbound legs */}
      <Section title="Outbound Flights">
        {d.outbound.map((leg, i) => (
          <LegForm key={i} leg={leg} index={i} total={d.outbound.length}
            direction="outbound"
            onChange={l => updateLeg('outbound', i, l)}
            onRemove={() => removeLeg('outbound', i)} />
        ))}
        {d.outbound.length < 4 && (
          <button type="button" onClick={() => addLeg('outbound')}
            className="flex items-center gap-2 text-xs text-[#C9A84C] font-semibold hover:text-[#B8973B] transition">
            <Plus className="w-3.5 h-3.5" /> Add Outbound Leg
          </button>
        )}
      </Section>

      {/* Inbound legs — only if return */}
      {d.tripType === 'return' && (
        <Section title="Inbound Flights">
          {d.inbound.map((leg, i) => (
            <LegForm key={i} leg={leg} index={i} total={d.inbound.length}
              direction="inbound"
              onChange={l => updateLeg('inbound', i, l)}
              onRemove={() => removeLeg('inbound', i)} />
          ))}
          {d.inbound.length < 4 && (
            <button type="button" onClick={() => addLeg('inbound')}
              className="flex items-center gap-2 text-xs text-[#C9A84C] font-semibold hover:text-[#B8973B] transition">
              <Plus className="w-3.5 h-3.5" /> Add Inbound Leg
            </button>
          )}
        </Section>
      )}

      {/* Passengers */}
      <Section title="Passengers">
        {d.passengers.map((p, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[#F3F4F6]">
              <span className="text-[10px] font-bold text-[#0B1F3A] uppercase tracking-wider">Passenger {i + 1}</span>
              {d.passengers.length > 1 && (
                <button type="button" onClick={() => removePax(i)} className="text-gray-400 hover:text-red-500 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <F label="Title">
                  <select className={base} value={p.title} onChange={e => updatePax(i, { ...p, title: e.target.value })}>
                    {['Mr','Mrs','Ms','Miss','Dr','Prof'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </F>
                <F label="First Name" req>
                  <input className={base} placeholder="John" value={p.firstName}
                    onChange={e => updatePax(i, { ...p, firstName: e.target.value })} />
                </F>
                <F label="Last Name" req>
                  <input className={base} placeholder="Doe" value={p.lastName}
                    onChange={e => updatePax(i, { ...p, lastName: e.target.value })} />
                </F>
              </div>
              <Row>
                <F label="E-Ticket Number">
                  <input className={base} placeholder="180-1234567890" value={p.eTicketNumber ?? ''}
                    onChange={e => updatePax(i, { ...p, eTicketNumber: e.target.value })} />
                </F>
                <F label="Cabin Class">
                  <select className={base} value={p.cabinClass} onChange={e => updatePax(i, { ...p, cabinClass: e.target.value })}>
                    {['Economy', 'Premium Economy', 'Business', 'First Class'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </F>
              </Row>
              <Row>
                <F label="Seat">
                  <input className={base} placeholder="24A" value={p.seat ?? ''}
                    onChange={e => updatePax(i, { ...p, seat: e.target.value })} />
                </F>
                <F label="Meal Preference">
                  <input className={base} placeholder="Standard / Halal / Vegetarian" value={p.meal ?? ''}
                    onChange={e => updatePax(i, { ...p, meal: e.target.value })} />
                </F>
              </Row>
              <Row>
                <F label="Passport Number">
                  <input className={base} placeholder="A12345678" value={p.passport ?? ''}
                    onChange={e => updatePax(i, { ...p, passport: e.target.value })} />
                </F>
                <F label="Nationality">
                  <input className={base} placeholder="British" value={p.nationality ?? ''}
                    onChange={e => updatePax(i, { ...p, nationality: e.target.value })} />
                </F>
              </Row>
              <Row>
                <F label="Date of Birth">
                  <input className={base} type="date" value={p.dob ?? ''}
                    onChange={e => updatePax(i, { ...p, dob: e.target.value })} />
                </F>
                <F label="Frequent Flyer No. (optional)">
                  <input className={base} placeholder="BA12345678" value={p.frequentFlyer ?? ''}
                    onChange={e => updatePax(i, { ...p, frequentFlyer: e.target.value })} />
                </F>
              </Row>
            </div>
          </div>
        ))}
        {d.passengers.length < 9 && (
          <button type="button" onClick={addPax}
            className="flex items-center gap-2 text-xs text-[#C9A84C] font-semibold hover:text-[#B8973B] transition">
            <Plus className="w-3.5 h-3.5" /> Add Passenger
          </button>
        )}
      </Section>

      {/* Pricing (optional) */}
      <Section title="Pricing">
        <div className="flex items-center gap-3">
          <input type="checkbox" id="include-pricing" checked={d.includePricing}
            onChange={e => set({ ...d, includePricing: e.target.checked })}
            className="rounded accent-[#C9A84C]" />
          <label htmlFor="include-pricing" className="text-xs text-gray-600">Include pricing breakdown in email</label>
        </div>
        {d.includePricing && (
          <div className="space-y-3 pt-2">
            <Row>
              <F label="Currency">
                <select className={base} value={d.pricing.currency}
                  onChange={e => {
                    const sym: Record<string, string> = { USD:'$', GBP:'£', EUR:'€', CAD:'CA$', AED:'د.إ', NGN:'₦', GHS:'GH₵' }
                    set({ ...d, pricing: { ...d.pricing, currency: e.target.value, currencySymbol: sym[e.target.value] ?? e.target.value } })
                  }}>
                  {['USD','GBP','EUR','CAD','AED','NGN','GHS'].map(c => <option key={c}>{c}</option>)}
                </select>
              </F>
              <F label="Passengers">
                <input className={base} type="number" min="1" value={d.pricing.passengerCount}
                  onChange={e => setPricing('passengerCount', parseInt(e.target.value) || 1)} />
              </F>
            </Row>
            <Row>
              <F label="Base Fare (per pax)">
                <input className={base} type="number" step="0.01" min="0" value={d.pricing.baseFare}
                  onChange={e => setPricing('baseFare', parseFloat(e.target.value) || 0)} />
              </F>
              <F label="Taxes & Fees (per pax)">
                <input className={base} type="number" step="0.01" min="0" value={d.pricing.taxes}
                  onChange={e => setPricing('taxes', parseFloat(e.target.value) || 0)} />
              </F>
            </Row>
            <F label="Carrier Fees (optional)">
              <input className={base} type="number" step="0.01" min="0" value={d.pricing.carrierFees ?? ''}
                onChange={e => setPricing('carrierFees', parseFloat(e.target.value) || undefined)} />
            </F>
            <div className="p-3 bg-[#F7F4EF] rounded-lg border border-[#E8D98B]">
              <div className="text-[10px] text-gray-500 mb-1">Auto-calculated</div>
              <div className="flex justify-between text-xs"><span>Total per pax</span><span className="font-bold">{d.pricing.currency} {d.pricing.total.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm font-bold text-[#C9A84C] mt-1"><span>Grand Total ({d.pricing.passengerCount} pax)</span><span>{d.pricing.currencySymbol}{d.pricing.grandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}

function HotelStep({ d, set }: { d: HotelData; set: (v: HotelData) => void }) {
  return (
    <div className="space-y-4">
      <Section title="Guest">
        <Row>
          <F label="Number of Guests"><input className={base} type="number" min="1" value={d.num_guests} onChange={e => set({ ...d, num_guests: e.target.value })} /></F>
          <F label="Confirmation No."><input className={base} placeholder="RES-123456" value={d.confirmation_number} onChange={e => set({ ...d, confirmation_number: e.target.value })} /></F>
        </Row>
        <F label="Guest Names"><input className={base} placeholder="John Doe, Jane Doe" value={d.guest_names} onChange={e => set({ ...d, guest_names: e.target.value })} /></F>
      </Section>
      <Section title="Hotel">
        <F label="Hotel Name" req><input className={base} placeholder="The Ritz London" value={d.hotel_name} onChange={e => set({ ...d, hotel_name: e.target.value })} /></F>
        <F label="Address"><input className={base} placeholder="150 Piccadilly, London W1J 9BR" value={d.hotel_address} onChange={e => set({ ...d, hotel_address: e.target.value })} /></F>
        <Row>
          <F label="Phone"><input className={base} placeholder="+44 20 7493 8181" value={d.hotel_phone} onChange={e => set({ ...d, hotel_phone: e.target.value })} /></F>
          <F label="Email"><input className={base} type="email" placeholder="reservations@hotel.com" value={d.hotel_email} onChange={e => set({ ...d, hotel_email: e.target.value })} /></F>
        </Row>
      </Section>
      <Section title="Stay">
        <Row>
          <F label="Check-in Date" req><input className={base} type="date" value={d.checkin_date} onChange={e => set({ ...d, checkin_date: e.target.value })} /></F>
          <F label="Check-in Time"><input className={base} type="time" value={d.checkin_time} onChange={e => set({ ...d, checkin_time: e.target.value })} /></F>
        </Row>
        <Row>
          <F label="Check-out Date" req><input className={base} type="date" value={d.checkout_date} onChange={e => set({ ...d, checkout_date: e.target.value })} /></F>
          <F label="Check-out Time"><input className={base} type="time" value={d.checkout_time} onChange={e => set({ ...d, checkout_time: e.target.value })} /></F>
        </Row>
        <Row>
          <F label="Number of Nights"><input className={base} placeholder="7" value={d.num_nights} onChange={e => set({ ...d, num_nights: e.target.value })} /></F>
          <F label="Room Type"><input className={base} placeholder="Deluxe Double" value={d.room_type} onChange={e => set({ ...d, room_type: e.target.value })} /></F>
        </Row>
        <F label="Special Requests">
          <textarea className={base + ' resize-none'} rows={2} placeholder="High floor, sea view..." value={d.special_requests} onChange={e => set({ ...d, special_requests: e.target.value })} />
        </F>
      </Section>
    </div>
  )
}

function TourStep({ d, set }: { d: TourData; set: (v: TourData) => void }) {
  return (
    <div className="space-y-4">
      <Section title="Guests">
        <Row>
          <F label="Number of Guests"><input className={base} type="number" min="1" value={d.num_guests} onChange={e => set({ ...d, num_guests: e.target.value })} /></F>
          <F label="Booking Ref"><input className={base} placeholder="TUR-ABC123" value={d.booking_ref} onChange={e => set({ ...d, booking_ref: e.target.value })} /></F>
        </Row>
        <F label="Guest Names"><input className={base} placeholder="John Doe, Jane Doe" value={d.guest_names} onChange={e => set({ ...d, guest_names: e.target.value })} /></F>
      </Section>
      <Section title="Tour">
        <F label="Tour Name" req><input className={base} placeholder="Pyramids of Giza Full-Day Tour" value={d.tour_name} onChange={e => set({ ...d, tour_name: e.target.value })} /></F>
        <Row>
          <F label="Tour Operator"><input className={base} placeholder="Egypt Tours Plus" value={d.tour_operator} onChange={e => set({ ...d, tour_operator: e.target.value })} /></F>
          <F label="Guide Name"><input className={base} placeholder="Ahmed Hassan" value={d.guide_name} onChange={e => set({ ...d, guide_name: e.target.value })} /></F>
        </Row>
        <Row>
          <F label="Tour Date" req><input className={base} type="date" value={d.tour_date} onChange={e => set({ ...d, tour_date: e.target.value })} /></F>
          <F label="Tour Time"><input className={base} type="time" value={d.tour_time} onChange={e => set({ ...d, tour_time: e.target.value })} /></F>
        </Row>
        <Row>
          <F label="Duration"><input className={base} placeholder="8 hours" value={d.duration} onChange={e => set({ ...d, duration: e.target.value })} /></F>
          <div />
        </Row>
        <F label="Meeting Point" req><input className={base} placeholder="Hotel lobby / Main entrance" value={d.meeting_point} onChange={e => set({ ...d, meeting_point: e.target.value })} /></F>
      </Section>
      <Section title="Pickup (optional)">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={d.pickup_included} onChange={e => set({ ...d, pickup_included: e.target.checked })} className="w-4 h-4 rounded accent-[#C9A84C]" />
          <span className="text-xs font-semibold text-[#0B1F3A]">Pickup Included</span>
        </label>
        {d.pickup_included && (
          <Row>
            <F label="Pickup Address"><input className={base} placeholder="Hotel name / address" value={d.pickup_address} onChange={e => set({ ...d, pickup_address: e.target.value })} /></F>
            <F label="Pickup Time"><input className={base} type="time" value={d.pickup_time} onChange={e => set({ ...d, pickup_time: e.target.value })} /></F>
          </Row>
        )}
      </Section>
      <Section title="Details">
        <F label="What's Included" req={false}>
          <textarea className={base + ' resize-none'} rows={4} placeholder={"Entrance tickets\nLunch\nGuided tour"} value={d.what_included} onChange={e => set({ ...d, what_included: e.target.value })} />
          <p className="text-[10px] text-gray-400 mt-1">One item per line</p>
        </F>
        <F label="What to Bring">
          <textarea className={base + ' resize-none'} rows={3} placeholder={"Comfortable shoes\nSunscreen\nWater bottle"} value={d.what_to_bring} onChange={e => set({ ...d, what_to_bring: e.target.value })} />
          <p className="text-[10px] text-gray-400 mt-1">One item per line</p>
        </F>
        <F label="Emergency Contact"><input className={base} placeholder="+20 1234 567890 (Ahmed)" value={d.emergency_contact} onChange={e => set({ ...d, emergency_contact: e.target.value })} /></F>
      </Section>
    </div>
  )
}

function TransferStep({ d, set }: { d: TransferData; set: (v: TransferData) => void }) {
  return (
    <div className="space-y-4">
      <Section title="Passengers">
        <Row>
          <F label="Number of Passengers"><input className={base} type="number" min="1" value={d.num_passengers} onChange={e => set({ ...d, num_passengers: e.target.value })} /></F>
          <F label="Booking Ref"><input className={base} placeholder="TRF-ABC123" value={d.booking_ref} onChange={e => set({ ...d, booking_ref: e.target.value })} /></F>
        </Row>
        <F label="Passenger Names"><input className={base} placeholder="John Doe, Jane Doe" value={d.passenger_names} onChange={e => set({ ...d, passenger_names: e.target.value })} /></F>
      </Section>
      <Section title="Vehicle">
        <Row>
          <F label="Transfer Company"><input className={base} placeholder="Walz Executive Cars" value={d.transfer_company} onChange={e => set({ ...d, transfer_company: e.target.value })} /></F>
          <F label="Vehicle Type">
            <select className={base} value={d.vehicle_type} onChange={e => set({ ...d, vehicle_type: e.target.value })}>
              {['Sedan','SUV','MPV','Minivan','Minibus','Coach'].map(o => <option key={o}>{o}</option>)}
            </select>
          </F>
        </Row>
        <Row>
          <F label="Driver Name"><input className={base} placeholder="James Miller" value={d.driver_name} onChange={e => set({ ...d, driver_name: e.target.value })} /></F>
          <F label="Driver Phone"><input className={base} placeholder="+44 7000 000000" value={d.driver_phone} onChange={e => set({ ...d, driver_phone: e.target.value })} /></F>
        </Row>
      </Section>
      <Section title="Journey">
        <F label="Pickup Location" req><input className={base} placeholder="Heathrow Terminal 5" value={d.pickup_location} onChange={e => set({ ...d, pickup_location: e.target.value })} /></F>
        <Row>
          <F label="Pickup Date" req><input className={base} type="date" value={d.pickup_date} onChange={e => set({ ...d, pickup_date: e.target.value })} /></F>
          <F label="Pickup Time"><input className={base} type="time" value={d.pickup_time} onChange={e => set({ ...d, pickup_time: e.target.value })} /></F>
        </Row>
        <F label="Drop-off Location" req><input className={base} placeholder="24 Baker Street, London" value={d.dropoff_location} onChange={e => set({ ...d, dropoff_location: e.target.value })} /></F>
        <F label="Associated Flight Number"><input className={base} placeholder="BA 0076" value={d.flight_number} onChange={e => set({ ...d, flight_number: e.target.value })} /></F>
        <F label="Special Instructions">
          <textarea className={base + ' resize-none'} rows={2} placeholder="Child seat required. Ring upon arrival." value={d.special_instructions} onChange={e => set({ ...d, special_instructions: e.target.value })} />
        </F>
      </Section>
    </div>
  )
}

function VisaStep({ d, set }: { d: VisaData; set: (v: VisaData) => void }) {
  return (
    <div className="space-y-4">
      <Section title="Applicant">
        <Row>
          <F label="Visa Type">
            <select className={base} value={d.visa_type} onChange={e => set({ ...d, visa_type: e.target.value })}>
              {['Tourist','Business','Student','Work','Transit','Family','Medical'].map(o => <option key={o}>{o}</option>)}
            </select>
          </F>
          <F label="Reference Number"><input className={base} placeholder="VFS-2024-001234" value={d.reference_number} onChange={e => set({ ...d, reference_number: e.target.value })} /></F>
        </Row>
        <F label="Passport Number"><input className={base} placeholder="A12345678" value={d.passport_number} onChange={e => set({ ...d, passport_number: e.target.value })} /></F>
      </Section>
      <Section title="Appointment">
        <Row>
          <F label="Date" req><input className={base} type="date" value={d.appointment_date} onChange={e => set({ ...d, appointment_date: e.target.value })} /></F>
          <F label="Time"><input className={base} type="time" value={d.appointment_time} onChange={e => set({ ...d, appointment_time: e.target.value })} /></F>
        </Row>
        <F label="Appointment Location"><input className={base} placeholder="VFS Global London" value={d.appointment_location} onChange={e => set({ ...d, appointment_location: e.target.value })} /></F>
        <F label="VFS / Embassy Address"><input className={base} placeholder="66-68 Hammersmith Rd, London W14 8UD" value={d.vfs_address} onChange={e => set({ ...d, vfs_address: e.target.value })} /></F>
        <Row>
          <F label="Contact Person"><input className={base} placeholder="Walz Travels" value={d.contact_person} onChange={e => set({ ...d, contact_person: e.target.value })} /></F>
          <F label="Contact Phone"><input className={base} placeholder="+44 7398 753797" value={d.contact_phone} onChange={e => set({ ...d, contact_phone: e.target.value })} /></F>
        </Row>
      </Section>
      <Section title="Documents to Bring">
        <F label="List (one per line)">
          <textarea className={base + ' resize-none'} rows={5}
            placeholder={"Valid passport\nCompleted application form\n2 passport photos\nBank statement (3 months)\nHotel booking confirmation"}
            value={d.documents_to_bring} onChange={e => set({ ...d, documents_to_bring: e.target.value })} />
        </F>
      </Section>
    </div>
  )
}

function PackageStep({ d, set }: { d: PackageData; set: (v: PackageData) => void }) {
  function toggleInc(key: string) {
    set({ ...d, inclusions: { ...d.inclusions, [key]: { ...d.inclusions[key], included: !d.inclusions[key].included } } })
  }
  function setNote(key: string, note: string) {
    set({ ...d, inclusions: { ...d.inclusions, [key]: { ...d.inclusions[key], note } } })
  }
  return (
    <div className="space-y-4">
      <Section title="Travellers">
        <Row>
          <F label="Number of Travellers"><input className={base} type="number" min="1" value={d.num_travellers} onChange={e => set({ ...d, num_travellers: e.target.value })} /></F>
          <F label="Package Reference"><input className={base} placeholder="PKG-DXB-001" value={d.package_reference} onChange={e => set({ ...d, package_reference: e.target.value })} /></F>
        </Row>
        <F label="Traveller Names"><input className={base} placeholder="John Doe, Jane Doe" value={d.traveller_names} onChange={e => set({ ...d, traveller_names: e.target.value })} /></F>
      </Section>
      <Section title="Package">
        <F label="Package Name" req><input className={base} placeholder="Dubai Luxury Escape 7 Nights" value={d.package_name} onChange={e => set({ ...d, package_name: e.target.value })} /></F>
        <F label="Destination"><input className={base} placeholder="Dubai, UAE" value={d.destination} onChange={e => set({ ...d, destination: e.target.value })} /></F>
        <Row>
          <F label="Travel From" req><input className={base} type="date" value={d.travel_from} onChange={e => set({ ...d, travel_from: e.target.value })} /></F>
          <F label="Travel To" req><input className={base} type="date" value={d.travel_to} onChange={e => set({ ...d, travel_to: e.target.value })} /></F>
        </Row>
      </Section>
      <Section title="What's Included">
        <div className="space-y-2">
          {INCLUSION_KEYS.map(key => (
            <div key={key} className="border border-gray-200 rounded-lg p-2.5 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={d.inclusions[key]?.included ?? false} onChange={() => toggleInc(key)} className="w-4 h-4 rounded accent-[#C9A84C]" />
                <span className="text-xs font-semibold text-[#0B1F3A]">{INCLUSION_LABELS[key]}</span>
              </label>
              {d.inclusions[key]?.included && (
                <input className={base} placeholder="e.g. Return flights from Heathrow" value={d.inclusions[key].note}
                  onChange={e => setNote(key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Payment">
        <Row>
          <F label="Total Value"><input className={base} type="number" min="0" placeholder="3500" value={d.total_value} onChange={e => set({ ...d, total_value: e.target.value })} /></F>
          <F label="Amount Paid"><input className={base} type="number" min="0" placeholder="1000" value={d.amount_paid} onChange={e => set({ ...d, amount_paid: e.target.value })} /></F>
        </Row>
        <Row>
          <F label="Currency">
            <select className={base} value={d.currency} onChange={e => set({ ...d, currency: e.target.value })}>
              {['USD','GBP','EUR','AED','NGN','CAD'].map(o => <option key={o}>{o}</option>)}
            </select>
          </F>
          <F label="Payment Due Date"><input className={base} type="date" value={d.payment_due_date} onChange={e => set({ ...d, payment_due_date: e.target.value })} /></F>
        </Row>
      </Section>
    </div>
  )
}

// ─── STEP 3 wrapper ─────────────────────────────────────────────────────────────

function Step3({
  ticketType, flightTicket, hotel, tour, transfer, visa, pkg,
  setFlightTicket, setHotel, setTour, setTransfer, setVisa, setPkg,
}: {
  ticketType: string
  flightTicket: FlightTicketData; hotel: HotelData; tour: TourData
  transfer: TransferData; visa: VisaData; pkg: PackageData
  setFlightTicket: (v: FlightTicketData) => void; setHotel: (v: HotelData) => void
  setTour: (v: TourData) => void; setTransfer: (v: TransferData) => void
  setVisa: (v: VisaData) => void; setPkg: (v: PackageData) => void
}) {
  if (!ticketType) return <p className="text-xs text-gray-400 text-center py-6">Please select a ticket type in Step 1 first.</p>
  if (ticketType === 'flight')   return <FlightTicketStep d={flightTicket} set={setFlightTicket} />
  if (ticketType === 'hotel')    return <HotelStep    d={hotel}    set={setHotel} />
  if (ticketType === 'tour')     return <TourStep     d={tour}     set={setTour} />
  if (ticketType === 'transfer') return <TransferStep d={transfer} set={setTransfer} />
  if (ticketType === 'visa')     return <VisaStep     d={visa}     set={setVisa} />
  if (ticketType === 'package')  return <PackageStep  d={pkg}      set={setPkg} />
  return null
}

// ─── STEP 4: Message & Send ────────────────────────────────────────────────────

function Step4({
  message, setMessage, clientName, clientEmail, ticketType,
  isGenerating, isSending, onGenerate, onSend,
  toast, sentRef,
}: {
  message: string; setMessage: (v: string) => void
  clientName: string; clientEmail: string; ticketType: string
  isGenerating: boolean; isSending: boolean
  onGenerate: () => void; onSend: () => void
  toast: { type: 'success' | 'error'; msg: string } | null
  sentRef: string | null
}) {
  return (
    <div className="space-y-4">
      <Section title="Custom Message">
        <F label="Message to Client (optional)">
          <textarea
            className={base + ' resize-none'}
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Dear ${clientName || 'Valued Client'}, please find your travel document attached. Contact us anytime if you need assistance.`}
          />
          <p className="text-[10px] text-gray-400 mt-1">Leave blank to use the default message.</p>
        </F>
      </Section>

      {toast && (
        <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-semibold text-xs">{toast.type === 'success' ? 'Success' : 'Error'}</p>
            <p className="text-xs mt-0.5">{toast.msg}</p>
            {sentRef && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs font-mono font-bold">{sentRef}</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(sentRef)} className="text-green-600 hover:text-green-700"><Copy className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        </div>
      )}

      <Section title="Actions">
        <div className="space-y-2.5">
          <button type="button" onClick={onGenerate} disabled={isGenerating || isSending || !ticketType}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-[#0B1F3A] text-[#0B1F3A] text-sm font-bold transition hover:bg-[#0B1F3A] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isGenerating ? 'Generating PDF…' : 'Generate & Download PDF'}
          </button>
          {ticketType === 'flight' && (
            <button type="button" onClick={() => window.print()} disabled={isGenerating || isSending}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-[#6B7280] text-[#6B7280] text-sm font-bold transition hover:bg-[#6B7280] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">
              <Printer className="w-4 h-4" /> Print Ticket (A4)
            </button>
          )}
          <button type="button" onClick={onSend} disabled={isSending || isGenerating || !ticketType || !clientEmail}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold transition hover:bg-[#B8973B] disabled:opacity-40 disabled:cursor-not-allowed">
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSending ? 'Sending…' : 'Generate PDF & Send to Client'}
          </button>
          {!clientEmail && (
            <p className="text-[10px] text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Add client email in Step 2 to send</p>
          )}
        </div>
      </Section>
    </div>
  )
}

// ─── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center mb-6">
      {STEPS.map((label, i) => {
        const num = i + 1; const done = step > num; const active = step === num
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${done ? 'bg-[#C9A84C] text-[#0B1F3A]' : active ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-400'}`}>
                {done ? <Check className="w-3.5 h-3.5" /> : num}
              </div>
              <span className={`text-[9px] font-semibold whitespace-nowrap ${active ? 'text-[#0B1F3A]' : done ? 'text-[#C9A84C]' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 mt-[-10px] ${done ? 'bg-[#C9A84C]' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Build API payload ─────────────────────────────────────────────────────────

function buildPayload(ticketType: string, client: ClientInfo, message: string, flightTicket: FlightTicketData, hotel: HotelData, tour: TourData, transfer: TransferData, visa: VisaData, pkg: PackageData): Record<string, unknown> {
  const base = { ticket_type: ticketType, client_name: client.name, client_email: client.email, client_phone: client.phone, message }
  if (ticketType === 'flight') {
    const lastOutbound = flightTicket.outbound[flightTicket.outbound.length - 1]
    return {
      ...base,
      pnr: flightTicket.pnr,
      tripType: flightTicket.tripType,
      bookingDate: flightTicket.bookingDate,
      outbound: flightTicket.outbound,
      inbound: flightTicket.inbound,
      passengers: flightTicket.passengers,
      firstName: client.name.split(' ')[0] ?? '',
      lastName: client.name.split(' ').slice(1).join(' ') ?? '',
      title: '',
      email: client.email,
      phone: client.phone,
      // Flat fields for preview/legacy compatibility
      from_city: flightTicket.outbound[0]?.departureCity ?? '',
      from_code: flightTicket.outbound[0]?.departureCode ?? '',
      to_city: lastOutbound?.arrivalCity ?? '',
      to_code: lastOutbound?.arrivalCode ?? '',
      airline: flightTicket.outbound[0]?.airline ?? '',
      flight_number: flightTicket.outbound[0]?.flightNumber ?? '',
      cabin_class: flightTicket.outbound[0]?.cabinClass ?? '',
      departure_date: flightTicket.outbound[0]?.departureDate ?? '',
      departure_time: flightTicket.outbound[0]?.departureTime ?? '',
      ...(flightTicket.includePricing ? { pricing: flightTicket.pricing } : {}),
    }
  }
  if (ticketType === 'hotel')    return { ...base, num_guests: hotel.num_guests, guest_names: hotel.guest_names, hotel_name: hotel.hotel_name, hotel_address: hotel.hotel_address, hotel_phone: hotel.hotel_phone, hotel_email: hotel.hotel_email, checkin_date: hotel.checkin_date, checkin_time: hotel.checkin_time, checkout_date: hotel.checkout_date, checkout_time: hotel.checkout_time, num_nights: hotel.num_nights, room_type: hotel.room_type, confirmation_number: hotel.confirmation_number, special_requests: hotel.special_requests }
  if (ticketType === 'tour')     return { ...base, num_guests: tour.num_guests, guest_names: tour.guest_names, tour_name: tour.tour_name, tour_operator: tour.tour_operator, guide_name: tour.guide_name, tour_date: tour.tour_date, tour_time: tour.tour_time, duration: tour.duration, meeting_point: tour.meeting_point, pickup_included: tour.pickup_included ? 'yes' : 'no', pickup_address: tour.pickup_address, pickup_time: tour.pickup_time, what_included: tour.what_included, what_to_bring: tour.what_to_bring, emergency_contact: tour.emergency_contact, booking_reference: tour.booking_ref }
  if (ticketType === 'transfer') return { ...base, num_passengers: transfer.num_passengers, passenger_names: transfer.passenger_names, transfer_company: transfer.transfer_company, vehicle_type: transfer.vehicle_type, driver_name: transfer.driver_name, driver_phone: transfer.driver_phone, pickup_location: transfer.pickup_location, pickup_date: transfer.pickup_date, pickup_time: transfer.pickup_time, dropoff_location: transfer.dropoff_location, flight_number: transfer.flight_number, booking_reference: transfer.booking_ref, special_instructions: transfer.special_instructions }
  if (ticketType === 'visa')     return { ...base, visa_type: visa.visa_type, reference_number: visa.reference_number, passport_number: visa.passport_number, appointment_date: visa.appointment_date, appointment_time: visa.appointment_time, appointment_location: visa.appointment_location, vfs_address: visa.vfs_address, contact_person: visa.contact_person, contact_phone: visa.contact_phone, documents_to_bring: visa.documents_to_bring }
  if (ticketType === 'package')  return { ...base, num_travellers: pkg.num_travellers, traveller_names: pkg.traveller_names, package_name: pkg.package_name, destination: pkg.destination, package_reference: pkg.package_reference, travel_from: pkg.travel_from, travel_to: pkg.travel_to, inclusions: pkg.inclusions, total_value: pkg.total_value, amount_paid: pkg.amount_paid, currency: pkg.currency, payment_due_date: pkg.payment_due_date }
  return base
}

// ─── Build preview data ────────────────────────────────────────────────────────

function buildPreview(ticketType: string, client: ClientInfo, message: string, flightTicket: FlightTicketData, hotel: HotelData, tour: TourData, transfer: TransferData, visa: VisaData, pkg: PackageData): Record<string, unknown> {
  const b = buildPayload(ticketType, client, message, flightTicket, hotel, tour, transfer, visa, pkg)
  return { ...b, ticket_reference: 'WLZ-PREVIEW' }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TicketGeneratorPage() {
  const [step, setStep]             = useState(1)
  const [ticketType, setTicketType] = useState('')
  const [client, setClient]         = useState<ClientInfo>(BLANK_CLIENT)
  const [message, setMessage]       = useState('')
  const [flight, setFlight]         = useState<FlightData>(BLANK_FLIGHT)
  const [flightTicket, setFlightTicket] = useState<FlightTicketData>(BLANK_FLIGHT_TICKET)
  const [hotel, setHotel]           = useState<HotelData>(BLANK_HOTEL)
  const [tour, setTour]             = useState<TourData>(BLANK_TOUR)
  const [transfer, setTransfer]     = useState<TransferData>(BLANK_TRANSFER)
  const [visa, setVisa]             = useState<VisaData>(BLANK_VISA)
  const [pkg, setPkg]               = useState<PackageData>(BLANK_PACKAGE)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSending, setIsSending]       = useState(false)
  const [toast, setToast]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [sentRef, setSentRef] = useState<string | null>(null)

  function showToast(type: 'success' | 'error', msg: string, ref?: string) {
    setToast({ type, msg })
    if (ref) setSentRef(ref)
    setTimeout(() => setToast(null), 8000)
  }

  function reset() {
    setStep(1); setTicketType(''); setClient(BLANK_CLIENT); setMessage('')
    setFlight(BLANK_FLIGHT); setHotel(BLANK_HOTEL); setTour(BLANK_TOUR)
    setTransfer(BLANK_TRANSFER); setVisa(BLANK_VISA); setPkg(BLANK_PACKAGE)
    setFlightTicket(BLANK_FLIGHT_TICKET)
    setToast(null); setSentRef(null)
  }

  async function handleGenerate() {
    if (!ticketType) return
    setIsGenerating(true)
    try {
      const res = await fetch('/api/admin/ticket-generator/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(ticketType, client, message, flightTicket, hotel, tour, transfer, visa, pkg)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate PDF')
      if (data.pdf_base64) {
        const link = document.createElement('a')
        link.href = `data:application/pdf;base64,${data.pdf_base64}`
        link.download = `WALZ-${ticketType.toUpperCase()}-${data.ticket_reference}-${(client.name || 'Client').replace(/\s+/g,'-')}.pdf`
        link.click()
      }
      showToast('success', `PDF generated — Ref: ${data.ticket_reference}`, data.ticket_reference)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally { setIsGenerating(false) }
  }

  async function handleSend() {
    if (!ticketType || !client.email) return
    setIsSending(true)
    try {
      const res = await fetch('/api/admin/ticket-generator/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(ticketType, client, message, flightTicket, hotel, tour, transfer, visa, pkg)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send ticket')
      showToast('success', `Sent to ${data.sent_to} — Ref: ${data.ticket_reference}`, data.ticket_reference)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to send ticket')
    } finally { setIsSending(false) }
  }

  const canNext = step === 1 ? !!ticketType : step === 2 ? !!client.name && !!client.email : true
  const previewData = buildPreview(ticketType, client, message, flightTicket, hotel, tour, transfer, visa, pkg)

  return (
    // Pull the page out of the admin layout's p-6/p-8 padding so we can do a full-bleed two-column layout
    <div className="-mx-6 -my-6 lg:-mx-8 lg:-my-8 bg-[#F8F7F4]">

      {/* ── Page Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-[#0B1F3A]">Ticket Generator</h1>
          <p className="text-xs text-gray-500 mt-0.5">Generate branded Walz Travels documents and send to clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ticket-generator/history"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <History className="w-3.5 h-3.5" /> History
          </Link>
          <Link href="/admin/ticket-generator/templates"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <LayoutTemplate className="w-3.5 h-3.5" /> Templates
          </Link>
          <button type="button" onClick={reset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1F3A] border border-[#0B1F3A] rounded-lg hover:bg-[#0B1F3A] hover:text-white transition">
            <RefreshCw className="w-3.5 h-3.5" /> New Ticket
          </button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex">

        {/* LEFT — Form */}
        <div className="w-full lg:w-[45%] bg-white border-r border-gray-200">
          <div className="p-6">
            <Stepper step={step} />

            {step === 1 && <Step1 ticketType={ticketType} setTicketType={setTicketType} />}
            {step === 2 && <Step2 client={client} setClient={setClient} />}
            {step === 3 && (
              <Step3 ticketType={ticketType}
                flightTicket={flightTicket} hotel={hotel} tour={tour} transfer={transfer} visa={visa} pkg={pkg}
                setFlightTicket={setFlightTicket} setHotel={setHotel} setTour={setTour} setTransfer={setTransfer} setVisa={setVisa} setPkg={setPkg}
              />
            )}
            {step === 4 && (
              <Step4
                message={message} setMessage={setMessage}
                clientName={client.name} clientEmail={client.email} ticketType={ticketType}
                isGenerating={isGenerating} isSending={isSending}
                onGenerate={handleGenerate} onSend={handleSend}
                toast={toast} sentRef={sentRef}
              />
            )}

            {/* Nav buttons — inline, not sticky */}
            <div className="flex items-center justify-between gap-3 mt-8 pt-5 border-t border-gray-100">
              <button type="button" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
              <span className="text-[11px] text-gray-400 font-medium">Step {step} of {STEPS.length}</span>
              {step < STEPS.length ? (
                <button type="button" onClick={() => setStep(s => Math.min(STEPS.length, s + 1))} disabled={!canNext}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-[#0B1F3A] text-white rounded-xl hover:bg-[#0f2a4a] transition disabled:opacity-30 disabled:cursor-not-allowed">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button type="button" onClick={handleSend} disabled={isSending || isGenerating || !ticketType || !client.email}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-[#C9A84C] text-[#0B1F3A] rounded-xl hover:bg-[#B8973B] transition disabled:opacity-30 disabled:cursor-not-allowed">
                  {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send to Client
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Live Preview (sticky) */}
        <div className="hidden lg:block lg:w-[55%] bg-gray-100">
          <div className="sticky top-0 p-6 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-black text-[#0B1F3A]">Live Preview</h2>
                <p className="text-[10px] text-gray-400">Updates as you fill in the form</p>
              </div>
              <div className="flex items-center gap-2">
                {ticketType === 'flight' && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-[#0B1F3A] border border-[#0B1F3A] rounded-lg hover:bg-[#0B1F3A] hover:text-white transition"
                  >
                    <Printer className="w-3 h-3" /> Print
                  </button>
                )}
                {ticketType && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                    <span className="text-[10px] font-bold text-[#92400E] uppercase tracking-wide">Live</span>
                  </div>
                )}
              </div>
            </div>

            {ticketType === 'flight' ? (
              <>
                {/* Print CSS — only injected when flight type selected */}
                <style>{`
                  @media print {
                    body * { visibility: hidden !important; }
                    #ticket-print-area, #ticket-print-area * { visibility: visible !important; }
                    #ticket-print-area {
                      position: fixed !important;
                      left: 0 !important; top: 0 !important;
                      width: 100% !important;
                      margin: 0 !important; padding: 0 !important;
                    }
                    @page { size: A4; margin: 8mm; }
                  }
                `}</style>
                <div className="rounded-xl border border-gray-200 shadow-xl bg-white overflow-hidden">
                  <FlightTicketTemplate
                    flightTicket={flightTicket}
                    client={client}
                    reference="WLZ-PREVIEW"
                    bookingDate={flightTicket.bookingDate || new Date().toISOString().split('T')[0]}
                    agentMessage={message || undefined}
                    mode="preview"
                  />
                </div>
              </>
            ) : (
              <TicketPreview data={previewData as Parameters<typeof TicketPreview>[0]['data']} />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
