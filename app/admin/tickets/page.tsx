'use client'
import { useState, useEffect, useRef } from 'react'
import { Plane, Building2, MapPin, Car, Plus, X, Loader2, Send, Printer, CheckCircle, RefreshCw } from 'lucide-react'

type TicketType = 'FLIGHT' | 'HOTEL' | 'TOUR' | 'TRANSFER'

interface Passenger { name: string; seatNumber: string; ticketNumber: string }

interface FlightData {
  passengers: Passenger[]
  airline: string; flightNumber: string; aircraftType: string
  departureAirport: string; departureAirportCode: string; departureCity: string
  departureDate: string; departureTime: string; departureTerminal: string
  arrivalAirport: string; arrivalAirportCode: string; arrivalCity: string
  arrivalDate: string; arrivalTime: string; arrivalTerminal: string
  cabinClass: string; baggageAllowance: string; pnr: string
  operatingCarrier: string; notes: string
}

interface HotelData {
  guestName: string; guestEmail: string; guestPhone: string
  hotelName: string; hotelAddress: string; hotelPhone: string
  hotelRating: string; checkInDate: string; checkInTime: string
  checkOutDate: string; checkOutTime: string; roomType: string
  roomNumber: string; numberOfGuests: string; numberOfRooms: string
  confirmationNumber: string; ratePerNight: string; totalCost: string
  currency: string; mealPlan: string; specialRequests: string; notes: string
}

interface TourData {
  guestName: string; guestEmail: string; guestPhone: string
  tourName: string; operator: string; destination: string
  meetingPoint: string; tourDate: string; startTime: string
  endTime: string; duration: string; numberOfGuests: string
  confirmationNumber: string; guideeName: string; guidePhone: string
  inclusions: string; exclusions: string; totalCost: string
  currency: string; pickupIncluded: string; pickupLocation: string; notes: string
}

interface TransferData {
  passengerName: string; passengerEmail: string; passengerPhone: string
  pickupLocation: string; pickupAddress: string
  dropoffLocation: string; dropoffAddress: string
  pickupDate: string; pickupTime: string; flightNumber: string
  vehicleType: string; vehicleRegistration: string
  driverName: string; driverPhone: string
  numberOfPassengers: string; luggagePieces: string
  confirmationNumber: string; provider: string
  totalCost: string; currency: string; notes: string
}

interface ExistingBooking {
  id: string; bookingReference: string; type: string; contactEmail: string
  flightDetails: Record<string, unknown> | null
  hotelDetails: Record<string, unknown> | null
  passengers: Array<{ firstName?: string; lastName?: string }> | null
}

const TABS: { type: TicketType; label: string; icon: React.ElementType; color: string }[] = [
  { type: 'FLIGHT',   label: 'Flight Ticket',         icon: Plane,     color: 'text-blue-600'   },
  { type: 'HOTEL',    label: 'Hotel Confirmation',    icon: Building2, color: 'text-purple-600' },
  { type: 'TOUR',     label: 'Tour Voucher',          icon: MapPin,    color: 'text-green-600'  },
  { type: 'TRANSFER', label: 'Transfer Confirmation', icon: Car,       color: 'text-orange-600' },
]

const WALZ_HEADER_HTML = `<div style="background:#0B1F3A;padding:20px 32px;display:flex;align-items:center;justify-content:space-between">
  <div>
    <div style="color:#C9A84C;font-size:20px;font-weight:900;letter-spacing:3px;font-family:Arial,sans-serif">WALZ TRAVELS</div>
    <div style="color:rgba(255,255,255,0.4);font-size:10px;letter-spacing:2px;margin-top:2px">FLIGHTS · HOTELS · TOURS · TRANSFERS</div>
  </div>
  <div style="text-align:right;font-size:9px;color:rgba(255,255,255,0.4)">
    <div>contact@walztravels.com</div>
    <div>+44 7398 753797</div>
    <div>walztravels.com</div>
  </div>
</div>`

const WALZ_FOOTER_HTML = `<div style="background:#0B1F3A;padding:14px 32px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-size:10px;color:rgba(255,255,255,0.4)">Walz Travels Emergency: +44 7398 753797</div>
  <div style="font-size:10px;color:rgba(255,255,255,0.4)">contact@walztravels.com</div>
</div>`

const defaultFlight = (): FlightData => ({
  passengers: [{ name: '', seatNumber: '', ticketNumber: '' }],
  airline: '', flightNumber: '', aircraftType: '',
  departureAirport: '', departureAirportCode: '', departureCity: '',
  departureDate: '', departureTime: '', departureTerminal: '',
  arrivalAirport: '', arrivalAirportCode: '', arrivalCity: '',
  arrivalDate: '', arrivalTime: '', arrivalTerminal: '',
  cabinClass: 'Economy', baggageAllowance: '23kg',
  pnr: '', operatingCarrier: '', notes: '',
})

const defaultHotel = (): HotelData => ({
  guestName: '', guestEmail: '', guestPhone: '',
  hotelName: '', hotelAddress: '', hotelPhone: '',
  hotelRating: '4', checkInDate: '', checkInTime: '15:00',
  checkOutDate: '', checkOutTime: '11:00',
  roomType: '', roomNumber: '', numberOfGuests: '2', numberOfRooms: '1',
  confirmationNumber: '', ratePerNight: '', totalCost: '',
  currency: 'GBP', mealPlan: 'Room Only',
  specialRequests: '', notes: '',
})

const defaultTour = (): TourData => ({
  guestName: '', guestEmail: '', guestPhone: '',
  tourName: '', operator: '', destination: '',
  meetingPoint: '', tourDate: '', startTime: '',
  endTime: '', duration: '', numberOfGuests: '2',
  confirmationNumber: '', guideeName: '', guidePhone: '',
  inclusions: '', exclusions: '',
  totalCost: '', currency: 'GBP',
  pickupIncluded: 'No', pickupLocation: '', notes: '',
})

const defaultTransfer = (): TransferData => ({
  passengerName: '', passengerEmail: '', passengerPhone: '',
  pickupLocation: '', pickupAddress: '',
  dropoffLocation: '', dropoffAddress: '',
  pickupDate: '', pickupTime: '', flightNumber: '',
  vehicleType: 'Saloon Car', vehicleRegistration: '',
  driverName: '', driverPhone: '',
  numberOfPassengers: '2', luggagePieces: '2',
  confirmationNumber: '', provider: '', totalCost: '', currency: 'GBP', notes: '',
})

function Field({ label, value, onChange, placeholder = '', type = 'text', span = 1, textarea = false, options }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; span?: 1|2|3; textarea?: boolean; options?: string[]
}) {
  const cls = `w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white${span === 2 ? ' col-span-2' : span === 3 ? ' col-span-3' : ''}`
  const wrapCls = span === 2 ? 'col-span-2' : span === 3 ? 'col-span-3' : ''
  return (
    <div className={wrapCls}>
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white h-9`}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white resize-none`} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] bg-white`} />
      )}
    </div>
  )
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-3 flex items-center gap-2 pt-1">
      <span className="text-[10px] font-bold text-[#0B1F3A] uppercase tracking-widest">{children}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

export default function TicketsPage() {
  const [activeTab, setActiveTab] = useState<TicketType>('FLIGHT')
  const [flight,    setFlight]    = useState<FlightData>(defaultFlight())
  const [hotel,     setHotel]     = useState<HotelData>(defaultHotel())
  const [tour,      setTour]      = useState<TourData>(defaultTour())
  const [transfer,  setTransfer]  = useState<TransferData>(defaultTransfer())
  const [bookings,  setBookings]  = useState<ExistingBooking[]>([])
  const [selectedBooking, setSelectedBooking] = useState('')
  const [emailTo,   setEmailTo]   = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/admin/tickets/bookings')
      .then(r => r.json())
      .then(d => setBookings(d.bookings ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedBooking) return
    const bk = bookings.find(b => b.id === selectedBooking)
    if (!bk) return
    if ((bk.type === 'FLIGHT') && bk.flightDetails) {
      const fd = bk.flightDetails as Record<string, unknown>
      const pax = (bk.passengers || []).map(p => ({ name: `${p.firstName || ''} ${p.lastName || ''}`.trim(), seatNumber: '', ticketNumber: '' }))
      setFlight(prev => ({ ...prev, pnr: bk.bookingReference, airline: (fd.airline as string) || prev.airline, flightNumber: (fd.flightNumber as string) || prev.flightNumber, passengers: pax.length > 0 ? pax : prev.passengers }))
      setActiveTab('FLIGHT')
      setEmailTo(bk.contactEmail)
    }
    if (bk.type === 'HOTEL' && bk.hotelDetails) {
      const hd = bk.hotelDetails as Record<string, unknown>
      setHotel(prev => ({ ...prev, hotelName: (hd.hotelName as string) || prev.hotelName, hotelAddress: (hd.address as string) || prev.hotelAddress, confirmationNumber: bk.bookingReference, guestEmail: bk.contactEmail }))
      setActiveTab('HOTEL')
      setEmailTo(bk.contactEmail)
    }
  }, [selectedBooking, bookings])

  function getPreviewHtml(): string {
    if (activeTab === 'FLIGHT') return buildFlightHtml(flight)
    if (activeTab === 'HOTEL')  return buildHotelHtml(hotel)
    if (activeTab === 'TOUR')   return buildTourHtml(tour)
    return buildTransferHtml(transfer)
  }

  async function handleSend() {
    if (!emailTo) return
    setSending(true)
    const html = getPreviewHtml()
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif}</style></head><body>${html}</body></html>`
    const typeLabels: Record<TicketType, string> = { FLIGHT: 'Flight', HOTEL: 'Hotel', TOUR: 'Tour', TRANSFER: 'Transfer' }
    await fetch('/api/admin/tickets/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: emailTo, type: typeLabels[activeTab], html: fullHtml }),
    })
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  function handlePrint() { window.print() }
  function handleReset() {
    if (activeTab === 'FLIGHT') setFlight(defaultFlight())
    if (activeTab === 'HOTEL') setHotel(defaultHotel())
    if (activeTab === 'TOUR') setTour(defaultTour())
    if (activeTab === 'TRANSFER') setTransfer(defaultTransfer())
  }

  const previewHtml = getPreviewHtml()

  return (
    <>
      <style>{`@media print { body > * { display: none !important; } #ticket-print-area { display: block !important; position: fixed; top: 0; left: 0; right: 0; z-index: 99999; background: white; padding: 20px; } }`}</style>

      {/* Hidden print area */}
      <div id="ticket-print-area" style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />

      <div className="space-y-5 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1F3A]">Ticket Generator</h1>
            <p className="text-gray-400 text-sm mt-0.5">Generate branded Walz Travels tickets for clients</p>
          </div>
          <select value={selectedBooking} onChange={e => setSelectedBooking(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#C9A84C] text-gray-600 min-w-[200px]">
            <option value="">Pull from confirmed booking…</option>
            {bookings.map(b => (
              <option key={b.id} value={b.id}>{b.bookingReference} — {b.type}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.type} onClick={() => setActiveTab(tab.type)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.type ? 'bg-[#0B1F3A] text-white shadow-lg' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <Icon className={`w-4 h-4 ${activeTab === tab.type ? 'text-[#C9A84C]' : tab.color}`} />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-[#0B1F3A] text-sm">Enter Details</h2>
              <button onClick={handleReset} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                <RefreshCw className="w-3 h-3" /> Reset
              </button>
            </div>
            <div className="p-5 max-h-[calc(100vh-280px)] overflow-y-auto">

              {/* FLIGHT FORM */}
              {activeTab === 'FLIGHT' && (
                <div className="grid grid-cols-3 gap-3">
                  <Divider>Passengers</Divider>
                  {flight.passengers.map((p, i) => (
                    <div key={i} className="col-span-3 bg-gray-50 rounded-xl p-3 relative">
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Full Name" value={p.name} onChange={v => setFlight(f => ({ ...f, passengers: f.passengers.map((px, j) => j === i ? { ...px, name: v } : px) }))} placeholder="JOHN ADEYEMI" />
                        <Field label="Seat" value={p.seatNumber} onChange={v => setFlight(f => ({ ...f, passengers: f.passengers.map((px, j) => j === i ? { ...px, seatNumber: v } : px) }))} placeholder="12A" />
                        <Field label="e-Ticket" value={p.ticketNumber} onChange={v => setFlight(f => ({ ...f, passengers: f.passengers.map((px, j) => j === i ? { ...px, ticketNumber: v } : px) }))} placeholder="125-1234…" />
                      </div>
                      {flight.passengers.length > 1 && (
                        <button onClick={() => setFlight(f => ({ ...f, passengers: f.passengers.filter((_, j) => j !== i) }))}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-100 text-red-400 flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="col-span-3">
                    <button onClick={() => setFlight(f => ({ ...f, passengers: [...f.passengers, { name: '', seatNumber: '', ticketNumber: '' }] }))}
                      className="flex items-center gap-1 text-xs text-[#C9A84C] font-semibold hover:underline">
                      <Plus className="w-3 h-3" /> Add Passenger
                    </button>
                  </div>
                  <Divider>Flight</Divider>
                  <Field label="Airline" value={flight.airline} onChange={v => setFlight(f => ({...f, airline: v}))} placeholder="British Airways" />
                  <Field label="Flight No." value={flight.flightNumber} onChange={v => setFlight(f => ({...f, flightNumber: v}))} placeholder="BA 001" />
                  <Field label="Aircraft" value={flight.aircraftType} onChange={v => setFlight(f => ({...f, aircraftType: v}))} placeholder="Boeing 777" />
                  <Divider>Departure</Divider>
                  <Field label="Airport" value={flight.departureAirport} onChange={v => setFlight(f => ({...f, departureAirport: v}))} placeholder="Heathrow Airport" />
                  <Field label="IATA" value={flight.departureAirportCode} onChange={v => setFlight(f => ({...f, departureAirportCode: v.toUpperCase()}))} placeholder="LHR" />
                  <Field label="City" value={flight.departureCity} onChange={v => setFlight(f => ({...f, departureCity: v}))} placeholder="London" />
                  <Field label="Date" value={flight.departureDate} onChange={v => setFlight(f => ({...f, departureDate: v}))} type="date" />
                  <Field label="Time" value={flight.departureTime} onChange={v => setFlight(f => ({...f, departureTime: v}))} type="time" />
                  <Field label="Terminal" value={flight.departureTerminal} onChange={v => setFlight(f => ({...f, departureTerminal: v}))} placeholder="5" />
                  <Divider>Arrival</Divider>
                  <Field label="Airport" value={flight.arrivalAirport} onChange={v => setFlight(f => ({...f, arrivalAirport: v}))} placeholder="Lagos Airport" />
                  <Field label="IATA" value={flight.arrivalAirportCode} onChange={v => setFlight(f => ({...f, arrivalAirportCode: v.toUpperCase()}))} placeholder="LOS" />
                  <Field label="City" value={flight.arrivalCity} onChange={v => setFlight(f => ({...f, arrivalCity: v}))} placeholder="Lagos" />
                  <Field label="Date" value={flight.arrivalDate} onChange={v => setFlight(f => ({...f, arrivalDate: v}))} type="date" />
                  <Field label="Time" value={flight.arrivalTime} onChange={v => setFlight(f => ({...f, arrivalTime: v}))} type="time" />
                  <Field label="Terminal" value={flight.arrivalTerminal} onChange={v => setFlight(f => ({...f, arrivalTerminal: v}))} placeholder="2" />
                  <Divider>Class & Extras</Divider>
                  <Field label="Class" value={flight.cabinClass} onChange={v => setFlight(f => ({...f, cabinClass: v}))} options={['Economy', 'Premium Economy', 'Business', 'First Class']} />
                  <Field label="Baggage" value={flight.baggageAllowance} onChange={v => setFlight(f => ({...f, baggageAllowance: v}))} placeholder="23kg × 2" />
                  <Field label="PNR / Ref" value={flight.pnr} onChange={v => setFlight(f => ({...f, pnr: v}))} placeholder="ABC123" />
                  <Field label="Notes" value={flight.notes} onChange={v => setFlight(f => ({...f, notes: v}))} placeholder="Any additional notes…" span={3} textarea />
                </div>
              )}

              {/* HOTEL FORM */}
              {activeTab === 'HOTEL' && (
                <div className="grid grid-cols-3 gap-3">
                  <Divider>Guest</Divider>
                  <Field label="Guest Name" value={hotel.guestName} onChange={v => setHotel(h => ({...h, guestName: v}))} placeholder="John Adeyemi" />
                  <Field label="Email" value={hotel.guestEmail} onChange={v => setHotel(h => ({...h, guestEmail: v}))} placeholder="guest@email.com" type="email" />
                  <Field label="Phone" value={hotel.guestPhone} onChange={v => setHotel(h => ({...h, guestPhone: v}))} placeholder="+44 7…" />
                  <Divider>Hotel</Divider>
                  <Field label="Hotel Name" value={hotel.hotelName} onChange={v => setHotel(h => ({...h, hotelName: v}))} placeholder="The Savoy" span={2} />
                  <Field label="Rating (stars)" value={hotel.hotelRating} onChange={v => setHotel(h => ({...h, hotelRating: v}))} options={['3', '4', '5']} />
                  <Field label="Address" value={hotel.hotelAddress} onChange={v => setHotel(h => ({...h, hotelAddress: v}))} placeholder="Strand, London WC2R 0EU" span={2} />
                  <Field label="Hotel Phone" value={hotel.hotelPhone} onChange={v => setHotel(h => ({...h, hotelPhone: v}))} placeholder="+44 20…" />
                  <Field label="Confirmation No." value={hotel.confirmationNumber} onChange={v => setHotel(h => ({...h, confirmationNumber: v}))} placeholder="HTL-ABC123" span={2} />
                  <Field label="Meal Plan" value={hotel.mealPlan} onChange={v => setHotel(h => ({...h, mealPlan: v}))} options={['Room Only', 'Bed & Breakfast', 'Half Board', 'Full Board', 'All Inclusive']} />
                  <Divider>Stay</Divider>
                  <Field label="Check-in Date" value={hotel.checkInDate} onChange={v => setHotel(h => ({...h, checkInDate: v}))} type="date" />
                  <Field label="Check-in Time" value={hotel.checkInTime} onChange={v => setHotel(h => ({...h, checkInTime: v}))} type="time" />
                  <Field label="Room Type" value={hotel.roomType} onChange={v => setHotel(h => ({...h, roomType: v}))} placeholder="Deluxe King" />
                  <Field label="Check-out Date" value={hotel.checkOutDate} onChange={v => setHotel(h => ({...h, checkOutDate: v}))} type="date" />
                  <Field label="Check-out Time" value={hotel.checkOutTime} onChange={v => setHotel(h => ({...h, checkOutTime: v}))} type="time" />
                  <Field label="Room Number" value={hotel.roomNumber} onChange={v => setHotel(h => ({...h, roomNumber: v}))} placeholder="412" />
                  <Field label="Guests" value={hotel.numberOfGuests} onChange={v => setHotel(h => ({...h, numberOfGuests: v}))} placeholder="2" />
                  <Field label="Rooms" value={hotel.numberOfRooms} onChange={v => setHotel(h => ({...h, numberOfRooms: v}))} placeholder="1" />
                  <Field label="Currency" value={hotel.currency} onChange={v => setHotel(h => ({...h, currency: v}))} options={['GBP','USD','EUR','AED','NGN','GHS','CAD']} />
                  <Field label="Rate/Night" value={hotel.ratePerNight} onChange={v => setHotel(h => ({...h, ratePerNight: v}))} placeholder="450" />
                  <Field label="Total Cost" value={hotel.totalCost} onChange={v => setHotel(h => ({...h, totalCost: v}))} placeholder="1350" />
                  <div />
                  <Field label="Special Requests" value={hotel.specialRequests} onChange={v => setHotel(h => ({...h, specialRequests: v}))} placeholder="High floor, quiet room…" span={3} textarea />
                  <Field label="Notes" value={hotel.notes} onChange={v => setHotel(h => ({...h, notes: v}))} placeholder="Any notes…" span={3} textarea />
                </div>
              )}

              {/* TOUR FORM */}
              {activeTab === 'TOUR' && (
                <div className="grid grid-cols-3 gap-3">
                  <Divider>Guest</Divider>
                  <Field label="Guest Name" value={tour.guestName} onChange={v => setTour(t => ({...t, guestName: v}))} placeholder="John Adeyemi" />
                  <Field label="Email" value={tour.guestEmail} onChange={v => setTour(t => ({...t, guestEmail: v}))} type="email" />
                  <Field label="Phone" value={tour.guestPhone} onChange={v => setTour(t => ({...t, guestPhone: v}))} />
                  <Divider>Tour Details</Divider>
                  <Field label="Tour Name" value={tour.tourName} onChange={v => setTour(t => ({...t, tourName: v}))} placeholder="Dubai Desert Safari" span={2} />
                  <Field label="Operator" value={tour.operator} onChange={v => setTour(t => ({...t, operator: v}))} placeholder="Desert Safari Co." />
                  <Field label="Destination" value={tour.destination} onChange={v => setTour(t => ({...t, destination: v}))} placeholder="Dubai, UAE" span={2} />
                  <Field label="Voucher No." value={tour.confirmationNumber} onChange={v => setTour(t => ({...t, confirmationNumber: v}))} placeholder="TOUR-ABC123" />
                  <Divider>Schedule</Divider>
                  <Field label="Tour Date" value={tour.tourDate} onChange={v => setTour(t => ({...t, tourDate: v}))} type="date" />
                  <Field label="Start Time" value={tour.startTime} onChange={v => setTour(t => ({...t, startTime: v}))} type="time" />
                  <Field label="End Time" value={tour.endTime} onChange={v => setTour(t => ({...t, endTime: v}))} type="time" />
                  <Field label="Duration" value={tour.duration} onChange={v => setTour(t => ({...t, duration: v}))} placeholder="6 hours" />
                  <Field label="Guests" value={tour.numberOfGuests} onChange={v => setTour(t => ({...t, numberOfGuests: v}))} placeholder="2" />
                  <Field label="Meeting Point" value={tour.meetingPoint} onChange={v => setTour(t => ({...t, meetingPoint: v}))} placeholder="Hotel lobby" />
                  <Divider>Guide & Cost</Divider>
                  <Field label="Guide Name" value={tour.guideeName} onChange={v => setTour(t => ({...t, guideeName: v}))} placeholder="Mohammed" />
                  <Field label="Guide Phone" value={tour.guidePhone} onChange={v => setTour(t => ({...t, guidePhone: v}))} />
                  <Field label="Currency" value={tour.currency} onChange={v => setTour(t => ({...t, currency: v}))} options={['GBP','USD','EUR','AED','NGN','GHS','CAD']} />
                  <Field label="Total Cost" value={tour.totalCost} onChange={v => setTour(t => ({...t, totalCost: v}))} placeholder="250" span={2} />
                  <Field label="Pickup Included" value={tour.pickupIncluded} onChange={v => setTour(t => ({...t, pickupIncluded: v}))} options={['No', 'Yes']} />
                  {tour.pickupIncluded === 'Yes' && (
                    <Field label="Pickup Location" value={tour.pickupLocation} onChange={v => setTour(t => ({...t, pickupLocation: v}))} placeholder="Hotel name…" span={2} />
                  )}
                  <Field label="Inclusions" value={tour.inclusions} onChange={v => setTour(t => ({...t, inclusions: v}))} placeholder="Camel ride, BBQ dinner…" span={3} textarea />
                  <Field label="Exclusions" value={tour.exclusions} onChange={v => setTour(t => ({...t, exclusions: v}))} placeholder="Alcoholic drinks, tips…" span={3} textarea />
                  <Field label="Notes" value={tour.notes} onChange={v => setTour(t => ({...t, notes: v}))} placeholder="Any notes…" span={3} textarea />
                </div>
              )}

              {/* TRANSFER FORM */}
              {activeTab === 'TRANSFER' && (
                <div className="grid grid-cols-3 gap-3">
                  <Divider>Passenger</Divider>
                  <Field label="Passenger Name" value={transfer.passengerName} onChange={v => setTransfer(t => ({...t, passengerName: v}))} placeholder="John Adeyemi" />
                  <Field label="Email" value={transfer.passengerEmail} onChange={v => setTransfer(t => ({...t, passengerEmail: v}))} type="email" />
                  <Field label="Phone" value={transfer.passengerPhone} onChange={v => setTransfer(t => ({...t, passengerPhone: v}))} />
                  <Divider>Route</Divider>
                  <Field label="Pickup Location" value={transfer.pickupLocation} onChange={v => setTransfer(t => ({...t, pickupLocation: v}))} placeholder="Heathrow Airport T5" span={2} />
                  <Field label="Pickup Date" value={transfer.pickupDate} onChange={v => setTransfer(t => ({...t, pickupDate: v}))} type="date" />
                  <Field label="Pickup Address" value={transfer.pickupAddress} onChange={v => setTransfer(t => ({...t, pickupAddress: v}))} placeholder="Terminal 5, Heathrow" span={2} />
                  <Field label="Pickup Time" value={transfer.pickupTime} onChange={v => setTransfer(t => ({...t, pickupTime: v}))} type="time" />
                  <Field label="Dropoff Location" value={transfer.dropoffLocation} onChange={v => setTransfer(t => ({...t, dropoffLocation: v}))} placeholder="City Centre Hotel" span={2} />
                  <Field label="Flight Ref" value={transfer.flightNumber} onChange={v => setTransfer(t => ({...t, flightNumber: v}))} placeholder="BA 001" />
                  <Field label="Dropoff Address" value={transfer.dropoffAddress} onChange={v => setTransfer(t => ({...t, dropoffAddress: v}))} placeholder="Full address" span={3} />
                  <Divider>Vehicle & Driver</Divider>
                  <Field label="Vehicle Type" value={transfer.vehicleType} onChange={v => setTransfer(t => ({...t, vehicleType: v}))} options={['Saloon Car', 'Estate Car', 'MPV (7-Seat)', 'Minibus (8-16)', 'Executive Saloon', 'Luxury Mercedes']} />
                  <Field label="Passengers" value={transfer.numberOfPassengers} onChange={v => setTransfer(t => ({...t, numberOfPassengers: v}))} placeholder="2" />
                  <Field label="Luggage" value={transfer.luggagePieces} onChange={v => setTransfer(t => ({...t, luggagePieces: v}))} placeholder="2" />
                  <Field label="Driver Name" value={transfer.driverName} onChange={v => setTransfer(t => ({...t, driverName: v}))} placeholder="David Smith" />
                  <Field label="Driver Phone" value={transfer.driverPhone} onChange={v => setTransfer(t => ({...t, driverPhone: v}))} />
                  <Field label="Vehicle Reg" value={transfer.vehicleRegistration} onChange={v => setTransfer(t => ({...t, vehicleRegistration: v}))} placeholder="AB12 CDE" />
                  <Field label="Confirmation No." value={transfer.confirmationNumber} onChange={v => setTransfer(t => ({...t, confirmationNumber: v}))} placeholder="TRF-ABC123" span={2} />
                  <Field label="Provider" value={transfer.provider} onChange={v => setTransfer(t => ({...t, provider: v}))} placeholder="Walz Travels" />
                  <Field label="Currency" value={transfer.currency} onChange={v => setTransfer(t => ({...t, currency: v}))} options={['GBP','USD','EUR','AED','NGN','GHS','CAD']} />
                  <Field label="Total Cost" value={transfer.totalCost} onChange={v => setTransfer(t => ({...t, totalCost: v}))} placeholder="85" span={2} />
                  <Field label="Notes / Instructions" value={transfer.notes} onChange={v => setTransfer(t => ({...t, notes: v}))} placeholder="Meet at arrivals gate…" span={3} textarea />
                </div>
              )}

            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-[#0B1F3A] text-sm">Preview</h2>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-h-[calc(100vh-320px)]" ref={previewRef}>
              <div className="rounded-xl overflow-hidden border border-gray-200"
                dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>

            {/* Send */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <div className="flex gap-2">
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  placeholder="client@email.com" type="email"
                  className="flex-1 h-9 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
                />
                <button onClick={handleSend} disabled={sending || !emailTo || sent}
                  className="flex items-center gap-1.5 px-4 h-9 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm disabled:opacity-50">
                  {sent ? <><CheckCircle className="w-3.5 h-3.5" /> Sent!</>
                    : sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                    : <><Send className="w-3.5 h-3.5" /> Email</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── HTML generators ────────────────────────────────────────────────────────────

function buildFlightHtml(d: FlightData): string {
  const fn = d.flightNumber.replace(/\s/g, '')
  return `<div style="font-family:Arial,sans-serif;background:#fff;border-radius:0;overflow:hidden">
  ${WALZ_HEADER_HTML}
  <div style="background:#EFF6FF;padding:8px 32px;border-bottom:1px solid #BFDBFE">
    <span style="color:#1D4ED8;font-weight:700;font-size:12px;letter-spacing:2px">✈ FLIGHT BOOKING CONFIRMATION</span>
  </div>
  <div style="padding:24px 32px;background:#F8FAFF;border-bottom:1px solid #e2e8f0">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="text-align:center">
        <div style="font-size:44px;font-weight:900;color:#0B1F3A;line-height:1">${d.departureAirportCode || 'DEP'}</div>
        <div style="font-size:12px;color:#64748B;margin-top:4px">${d.departureCity || 'Departure'}</div>
        <div style="font-size:10px;color:#94A3B8">${d.departureAirport || ''}</div>
      </div>
      <div style="flex:1;text-align:center;padding:0 16px">
        <div style="font-size:11px;font-weight:700;color:#C9A84C;letter-spacing:1px;margin-bottom:6px">${d.airline} ${d.flightNumber} · ${d.cabinClass}</div>
        <div style="display:flex;align-items:center">
          <div style="width:8px;height:8px;background:#C9A84C;border-radius:50%"></div>
          <div style="flex:1;height:1px;background:linear-gradient(to right,#C9A84C,#0B1F3A);margin:0 4px"></div>
          <div style="font-size:18px;color:#0B1F3A">✈</div>
          <div style="flex:1;height:1px;background:linear-gradient(to right,#0B1F3A,#C9A84C);margin:0 4px"></div>
          <div style="width:8px;height:8px;background:#C9A84C;border-radius:50%"></div>
        </div>
      </div>
      <div style="text-align:center">
        <div style="font-size:44px;font-weight:900;color:#0B1F3A;line-height:1">${d.arrivalAirportCode || 'ARR'}</div>
        <div style="font-size:12px;color:#64748B;margin-top:4px">${d.arrivalCity || 'Arrival'}</div>
        <div style="font-size:10px;color:#94A3B8">${d.arrivalAirport || ''}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px dashed #CBD5E1">
      <div>
        <div style="font-size:22px;font-weight:700;color:#0B1F3A">${d.departureTime || '00:00'}</div>
        <div style="font-size:11px;color:#64748B">${d.departureDate ? new Date(d.departureDate).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}) : 'Date TBC'}</div>
        ${d.departureTerminal ? `<div style="font-size:10px;color:#94A3B8">Terminal ${d.departureTerminal}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:700;color:#0B1F3A">${d.arrivalTime || '00:00'}</div>
        <div style="font-size:11px;color:#64748B">${d.arrivalDate ? new Date(d.arrivalDate).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}) : 'Date TBC'}</div>
        ${d.arrivalTerminal ? `<div style="font-size:10px;color:#94A3B8">Terminal ${d.arrivalTerminal}</div>` : ''}
      </div>
    </div>
  </div>
  ${d.passengers.filter(p => p.name).length > 0 ? `
  <div style="padding:16px 32px;border-bottom:1px solid #e2e8f0">
    <div style="font-size:10px;color:#94A3B8;letter-spacing:2px;margin-bottom:10px">PASSENGER(S)</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${d.passengers.filter(p => p.name).map(p => `
      <div style="background:#F8FAFF;border-radius:8px;padding:8px 14px;border:1px solid #E2E8F0">
        <div style="font-weight:700;color:#0B1F3A;font-size:13px">${p.name}</div>
        ${p.seatNumber ? `<div style="font-size:11px;color:#64748B">Seat: <strong>${p.seatNumber}</strong></div>` : ''}
        ${p.ticketNumber ? `<div style="font-size:10px;color:#94A3B8">e-Ticket: ${p.ticketNumber}</div>` : ''}
      </div>`).join('')}
    </div>
  </div>` : ''}
  <div style="padding:16px 32px;border-bottom:1px solid #e2e8f0">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${[
        { label: 'PNR / Booking Ref', val: d.pnr || '—' },
        { label: 'Baggage', val: d.baggageAllowance || '—' },
        { label: 'Aircraft', val: d.aircraftType || '—' },
        { label: 'Carrier', val: d.operatingCarrier || d.airline || '—' },
      ].map(({ label, val }) => `<div><div style="font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">${label}</div><div style="font-size:13px;font-weight:700;color:#0B1F3A">${val}</div></div>`).join('')}
    </div>
  </div>
  ${fn ? `<div style="padding:12px 32px;background:#FFFBEB;border-bottom:1px solid #FDE68A">
    <div style="font-size:11px;color:#92400E">📡 <strong>Track live:</strong>
      flightaware.com/live/flight/${fn} · flightradar24.com/${fn}
    </div>
  </div>` : ''}
  ${d.notes ? `<div style="padding:12px 32px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#94A3B8;letter-spacing:1px;margin-bottom:4px">NOTES</div><div style="font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</div></div>` : ''}
  ${WALZ_FOOTER_HTML}
</div>`
}

function buildHotelHtml(d: HotelData): string {
  const nights = d.checkInDate && d.checkOutDate
    ? Math.round((new Date(d.checkOutDate).getTime() - new Date(d.checkInDate).getTime()) / (1000*60*60*24))
    : 0
  const stars = parseInt(d.hotelRating) || 0
  const mapsUrl = d.hotelAddress ? `https://maps.google.com/?q=${encodeURIComponent(d.hotelName + ' ' + d.hotelAddress)}` : ''
  const fmt = (v: string) => v ? `${d.currency} ${v}` : '—'

  return `<div style="font-family:Arial,sans-serif;background:#fff;border-radius:0;overflow:hidden">
  ${WALZ_HEADER_HTML}
  <div style="background:#F5F3FF;padding:8px 32px;border-bottom:1px solid #DDD6FE">
    <span style="color:#6D28D9;font-weight:700;font-size:12px;letter-spacing:2px">🏨 HOTEL BOOKING CONFIRMATION</span>
  </div>
  <div style="padding:20px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:22px;font-weight:900;color:#0B1F3A">${d.hotelName || 'Hotel Name'}</div>
      ${stars > 0 ? `<div style="color:#C9A84C;font-size:14px;margin-top:2px">${'★'.repeat(stars)}</div>` : ''}
      ${d.hotelAddress ? `<div style="font-size:12px;color:#64748B;margin-top:6px">📍 ${d.hotelAddress}</div>` : ''}
      ${d.hotelPhone ? `<div style="font-size:12px;color:#64748B;margin-top:2px">📞 ${d.hotelPhone}</div>` : ''}
    </div>
    ${d.confirmationNumber ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px 18px;text-align:center">
      <div style="font-size:9px;color:#16A34A;letter-spacing:2px;font-weight:700">CONFIRMATION</div>
      <div style="font-size:16px;font-weight:900;color:#0B1F3A;margin-top:2px">${d.confirmationNumber}</div>
    </div>` : ''}
  </div>
  ${mapsUrl ? `<div style="padding:12px 32px;border-bottom:1px solid #e2e8f0;background:#F1F5F9;display:flex;align-items:center;gap:10px">
    <span style="font-size:18px">🗺</span>
    <div>
      <div style="font-size:12px;font-weight:700;color:#0B1F3A">View on Google Maps</div>
      <div style="font-size:11px;color:#3B82F6">${mapsUrl}</div>
    </div>
  </div>` : ''}
  <div style="display:grid;grid-template-columns:1fr 60px 1fr;padding:16px 32px;border-bottom:1px solid #e2e8f0;align-items:center">
    <div style="background:#F0FDF4;border-radius:10px;padding:12px 16px">
      <div style="font-size:9px;color:#16A34A;letter-spacing:2px;font-weight:700;margin-bottom:3px">CHECK-IN</div>
      <div style="font-size:18px;font-weight:900;color:#0B1F3A">${d.checkInDate ? new Date(d.checkInDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div>
      <div style="font-size:11px;color:#64748B">From ${d.checkInTime || '15:00'}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:18px;font-weight:900;color:#C9A84C">${nights || '—'}</div>
      <div style="font-size:9px;color:#94A3B8;letter-spacing:1px">NIGHTS</div>
    </div>
    <div style="background:#FEF2F2;border-radius:10px;padding:12px 16px">
      <div style="font-size:9px;color:#DC2626;letter-spacing:2px;font-weight:700;margin-bottom:3px">CHECK-OUT</div>
      <div style="font-size:18px;font-weight:900;color:#0B1F3A">${d.checkOutDate ? new Date(d.checkOutDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div>
      <div style="font-size:11px;color:#64748B">Until ${d.checkOutTime || '11:00'}</div>
    </div>
  </div>
  <div style="padding:16px 32px;border-bottom:1px solid #e2e8f0">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${[
        { l: 'GUEST', v: d.guestName || '—' }, { l: 'ROOM TYPE', v: d.roomType || '—' }, { l: 'MEAL PLAN', v: d.mealPlan || '—' },
        { l: 'GUESTS', v: d.numberOfGuests || '—' }, { l: 'ROOMS', v: d.numberOfRooms || '—' }, { l: 'ROOM NO.', v: d.roomNumber || '—' },
      ].map(({ l, v }) => `<div><div style="font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">${l}</div><div style="font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></div>`).join('')}
    </div>
  </div>
  ${(d.ratePerNight || d.totalCost) ? `<div style="padding:12px 32px;background:#FFFBEB;border-bottom:1px solid #FDE68A;display:flex;justify-content:space-between">
    ${d.ratePerNight ? `<span style="font-size:11px;color:#92400E">Rate/night: <strong>${fmt(d.ratePerNight)}</strong></span>` : ''}
    ${d.totalCost ? `<span style="font-size:11px;color:#92400E">Total: <strong style="font-size:16px">${fmt(d.totalCost)}</strong></span>` : ''}
  </div>` : ''}
  ${d.specialRequests ? `<div style="padding:12px 32px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">SPECIAL REQUESTS</div><div style="font-size:12px;color:#475569">${d.specialRequests}</div></div>` : ''}
  ${d.notes ? `<div style="padding:12px 32px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">NOTES</div><div style="font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</div></div>` : ''}
  ${WALZ_FOOTER_HTML}
</div>`
}

function buildTourHtml(d: TourData): string {
  const fmt = (v: string) => v ? `${d.currency} ${v}` : '—'
  return `<div style="font-family:Arial,sans-serif;background:#fff;border-radius:0;overflow:hidden">
  ${WALZ_HEADER_HTML}
  <div style="background:#F0FDF4;padding:8px 32px;border-bottom:1px solid #BBF7D0">
    <span style="color:#16A34A;font-weight:700;font-size:12px;letter-spacing:2px">🌴 TOUR BOOKING VOUCHER</span>
  </div>
  <div style="padding:20px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:22px;font-weight:900;color:#0B1F3A">${d.tourName || 'Tour Name'}</div>
      ${d.operator ? `<div style="font-size:13px;color:#64748B;margin-top:4px">Operated by: ${d.operator}</div>` : ''}
      ${d.destination ? `<div style="font-size:12px;color:#64748B;margin-top:2px">📍 ${d.destination}</div>` : ''}
    </div>
    ${d.confirmationNumber ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px 18px;text-align:center">
      <div style="font-size:9px;color:#16A34A;letter-spacing:2px;font-weight:700">VOUCHER NO.</div>
      <div style="font-size:16px;font-weight:900;color:#0B1F3A;margin-top:2px">${d.confirmationNumber}</div>
    </div>` : ''}
  </div>
  <div style="padding:16px 32px;border-bottom:1px solid #e2e8f0">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${[
        { l: 'GUEST NAME', v: d.guestName || '—' },
        { l: 'TOUR DATE', v: d.tourDate ? new Date(d.tourDate).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}) : '—' },
        { l: 'DURATION', v: d.duration || '—' },
        { l: 'START TIME', v: d.startTime || '—' },
        { l: 'END TIME', v: d.endTime || '—' },
        { l: 'GUESTS', v: d.numberOfGuests || '—' },
        { l: 'MEETING POINT', v: d.meetingPoint || '—' },
        { l: 'GUIDE', v: d.guideeName || '—' },
        { l: 'GUIDE PHONE', v: d.guidePhone || '—' },
      ].map(({ l, v }) => `<div><div style="font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">${l}</div><div style="font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></div>`).join('')}
    </div>
  </div>
  ${d.pickupIncluded === 'Yes' && d.pickupLocation ? `<div style="padding:12px 32px;background:#FFFBEB;border-bottom:1px solid #FDE68A"><div style="font-size:11px;color:#92400E">🚗 <strong>Pickup included from:</strong> ${d.pickupLocation}</div></div>` : ''}
  ${(d.inclusions || d.exclusions) ? `<div style="padding:16px 32px;border-bottom:1px solid #e2e8f0;display:grid;grid-template-columns:1fr 1fr;gap:16px">
    ${d.inclusions ? `<div><div style="font-size:9px;color:#16A34A;letter-spacing:1px;font-weight:700;margin-bottom:6px">✅ INCLUSIONS</div><div style="font-size:12px;color:#475569;white-space:pre-wrap">${d.inclusions}</div></div>` : ''}
    ${d.exclusions ? `<div><div style="font-size:9px;color:#DC2626;letter-spacing:1px;font-weight:700;margin-bottom:6px">❌ EXCLUSIONS</div><div style="font-size:12px;color:#475569;white-space:pre-wrap">${d.exclusions}</div></div>` : ''}
  </div>` : ''}
  ${d.totalCost ? `<div style="padding:12px 32px;background:#FFFBEB;border-bottom:1px solid #FDE68A"><span style="font-size:11px;color:#92400E">Total: </span><strong style="font-size:16px;color:#0B1F3A">${fmt(d.totalCost)}</strong></div>` : ''}
  ${d.notes ? `<div style="padding:12px 32px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">NOTES</div><div style="font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</div></div>` : ''}
  ${WALZ_FOOTER_HTML}
</div>`
}

function buildTransferHtml(d: TransferData): string {
  const fmt = (v: string) => v ? `${d.currency} ${v}` : '—'
  return `<div style="font-family:Arial,sans-serif;background:#fff;border-radius:0;overflow:hidden">
  ${WALZ_HEADER_HTML}
  <div style="background:#FFF7ED;padding:8px 32px;border-bottom:1px solid #FED7AA">
    <span style="color:#C2410C;font-weight:700;font-size:12px;letter-spacing:2px">🚗 TRANSFER BOOKING CONFIRMATION</span>
  </div>
  <div style="padding:20px 32px;background:#FFF7ED;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:16px">
    <div style="flex:1">
      <div style="font-size:9px;color:#94A3B8;letter-spacing:2px;margin-bottom:4px">PICKUP FROM</div>
      <div style="font-size:18px;font-weight:900;color:#0B1F3A">${d.pickupLocation || 'Pickup Location'}</div>
      ${d.pickupAddress ? `<div style="font-size:11px;color:#64748B;margin-top:2px">${d.pickupAddress}</div>` : ''}
    </div>
    <div style="font-size:28px;color:#C9A84C">→</div>
    <div style="flex:1">
      <div style="font-size:9px;color:#94A3B8;letter-spacing:2px;margin-bottom:4px">DROP-OFF AT</div>
      <div style="font-size:18px;font-weight:900;color:#0B1F3A">${d.dropoffLocation || 'Drop-off Location'}</div>
      ${d.dropoffAddress ? `<div style="font-size:11px;color:#64748B;margin-top:2px">${d.dropoffAddress}</div>` : ''}
    </div>
  </div>
  <div style="padding:16px 32px;border-bottom:1px solid #e2e8f0">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${[
        { l: 'PASSENGER', v: d.passengerName || '—' },
        { l: 'PICKUP DATE', v: d.pickupDate ? new Date(d.pickupDate).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}) : '—' },
        { l: 'PICKUP TIME', v: d.pickupTime || '—' },
        { l: 'VEHICLE TYPE', v: d.vehicleType || '—' },
        { l: 'PASSENGERS', v: d.numberOfPassengers || '—' },
        { l: 'LUGGAGE', v: `${d.luggagePieces || '0'} pieces` },
        { l: 'DRIVER NAME', v: d.driverName || '—' },
        { l: 'DRIVER PHONE', v: d.driverPhone || '—' },
        { l: 'VEHICLE REG', v: d.vehicleRegistration || '—' },
        { l: 'CONFIRMATION', v: d.confirmationNumber || '—' },
        { l: 'PROVIDER', v: d.provider || 'Walz Travels' },
        { l: 'FLIGHT REF', v: d.flightNumber || '—' },
      ].map(({ l, v }) => `<div><div style="font-size:9px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">${l}</div><div style="font-size:13px;font-weight:700;color:#0B1F3A">${v}</div></div>`).join('')}
    </div>
  </div>
  ${d.totalCost ? `<div style="padding:12px 32px;background:#FFFBEB;border-bottom:1px solid #FDE68A"><span style="font-size:11px;color:#92400E">Total: </span><strong style="font-size:16px;color:#0B1F3A">${fmt(d.totalCost)}</strong></div>` : ''}
  ${d.notes ? `<div style="padding:12px 32px;border-bottom:1px solid #e2e8f0"><div style="font-size:10px;color:#94A3B8;letter-spacing:1px;margin-bottom:3px">INSTRUCTIONS</div><div style="font-size:12px;color:#475569;white-space:pre-wrap">${d.notes}</div></div>` : ''}
  ${WALZ_FOOTER_HTML}
</div>`
}
