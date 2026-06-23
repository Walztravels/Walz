'use client'

import React from 'react'
import type { FlightLeg, Passenger, PricingBreakdown } from '@/types/flight-ticket'

const NAVY = '#0B1F3A'
const GOLD  = '#C9A84C'

const TYPE_LABELS: Record<string, string> = {
  flight: '✈  FLIGHT TICKET', hotel: '🏨  HOTEL VOUCHER',
  tour: '🗺  TOUR CONFIRMATION', transfer: '🚗  TRANSFER VOUCHER',
  visa: '📋  VISA APPOINTMENT', package: '📦  HOLIDAY PACKAGE',
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function FieldPair({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="mb-3">
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-bold" style={{ color: NAVY }}>{value}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 mb-1">{children}</div>
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-3">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: NAVY }}>{children}</div>
      <div className="flex-1 h-px" style={{ backgroundColor: GOLD + '60' }} />
    </div>
  )
}

function GoldBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: '#FFFBF0', border: `1px solid ${GOLD}` }}>
      <div className="text-xs font-bold mb-1" style={{ color: NAVY }}>{title}</div>
      <div className="text-xs whitespace-pre-line" style={{ color: '#78650A' }}>{text}</div>
    </div>
  )
}

function RedBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: '#FFF5F5', border: '1px solid #DC2626' }}>
      <div className="text-xs font-bold mb-1 text-red-700">{title}</div>
      <div className="text-xs whitespace-pre-line text-red-600">{text}</div>
    </div>
  )
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mb-1.5">
      <span className="text-xs font-bold flex-shrink-0" style={{ color: GOLD }}>✓</span>
      <span className="text-xs" style={{ color: NAVY }}>{text}</span>
    </div>
  )
}

function fmtDate(s?: string): string {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

// ── Single flight leg display ─────────────────────────────────────────────────

function LegDisplay({ leg, index, total }: { leg: FlightLeg; index: number; total: number }) {
  return (
    <div className="mb-3 last:mb-0 rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
      {total > 1 && (
        <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: NAVY + '08', color: GOLD, borderBottom: '1px solid #E5E7EB' }}>
          Flight {index + 1} of {total}
          {leg.connectionTime && index < total - 1 && (
            <span className="ml-2 text-gray-400 font-normal normal-case">· connection {leg.connectionTime}</span>
          )}
        </div>
      )}
      <div className="p-3">
        {/* Flight number + airline row */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-sm font-black" style={{ color: NAVY }}>{leg.flightNumber || '—'}</div>
            <div className="text-[10px] text-gray-500">
              {leg.airline || '—'}
              {leg.operatedBy ? ` · operated by ${leg.operatedBy}` : ''}
              {leg.aircraft ? ` · ${leg.aircraft}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">{leg.cabinClass}</div>
            {leg.duration && <div className="text-[10px] text-gray-400">{leg.duration}</div>}
          </div>
        </div>

        {/* Route block */}
        <div className="flex items-center gap-2 rounded-lg p-3 mb-2" style={{ backgroundColor: '#F3F4F6' }}>
          {/* Departure */}
          <div className="flex-1">
            <div className="text-xl font-black" style={{ color: NAVY }}>{leg.departureCode || '???'}</div>
            <div className="text-[10px] font-medium text-gray-600">{leg.departureCity}</div>
            {leg.departureTerminal && (
              <div className="text-[9px] text-gray-400">Terminal {leg.departureTerminal}</div>
            )}
            <div className="text-[10px] font-semibold mt-1" style={{ color: NAVY }}>{fmtDate(leg.departureDate)}</div>
            <div className="text-sm font-bold" style={{ color: NAVY }}>{leg.departureTime}</div>
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0 text-center px-1">
            <div className="text-[9px] text-gray-400 mb-0.5">{leg.duration}</div>
            <div className="text-base font-bold" style={{ color: GOLD }}>→</div>
          </div>

          {/* Arrival */}
          <div className="flex-1 text-right">
            <div className="text-xl font-black" style={{ color: NAVY }}>{leg.arrivalCode || '???'}</div>
            <div className="text-[10px] font-medium text-gray-600">{leg.arrivalCity}</div>
            {leg.arrivalTerminal && (
              <div className="text-[9px] text-gray-400">Terminal {leg.arrivalTerminal}</div>
            )}
            <div className="text-[10px] font-semibold mt-1" style={{ color: NAVY }}>
              {fmtDate(leg.arrivalDate)}
              {leg.arrivalNextDay && <span style={{ color: GOLD }}> +1</span>}
            </div>
            <div className="text-sm font-bold" style={{ color: NAVY }}>{leg.arrivalTime}</div>
          </div>
        </div>

        {/* Baggage / meal row */}
        {(leg.baggage || leg.mealPreference) && (
          <div className="flex gap-4 text-[10px] text-gray-400">
            {leg.baggage && <span>🧳 {leg.baggage}</span>}
            {leg.mealPreference && <span>🍽 {leg.mealPreference}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Terms & Conditions (appended to every ticket type) ────────────────────────

function TermsSection() {
  return (
    <div className="mt-6 pt-4" style={{ borderTop: '1px solid #E5E7EB' }}>
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Terms &amp; Conditions</div>
      <div className="text-[9px] text-gray-400 leading-relaxed space-y-1">
        <p>1. This document is issued by Walz Travels Ltd and serves as confirmation of your travel arrangements. Please carry this document with your valid passport and any required visas.</p>
        <p>2. Passengers must check in at least 2 hours before departure for domestic flights and 3 hours for international flights. Walz Travels is not liable for missed flights due to late check-in.</p>
        <p>3. Baggage allowances are subject to airline policy. Excess baggage charges are the passenger&apos;s responsibility. Please verify allowances directly with the operating airline before travel.</p>
        <p>4. Cancellation and amendment policies vary by ticket type (refundable / non-refundable). Please contact Walz Travels at least 48 hours before departure to discuss changes. Change fees may apply.</p>
        <p>5. Walz Travels acts as an agent for airlines, hotels and other travel suppliers. We are not liable for delays, cancellations, overbooking, or service failures by third-party suppliers.</p>
        <p>6. Travel insurance is strongly recommended for all journeys. Walz Travels is not responsible for losses arising from medical emergencies, trip interruptions or personal property loss.</p>
        <p>7. By proceeding with this booking, the passenger confirms acceptance of these terms. For full terms visit walztravels.com/terms or contact support@walztravels.com.</p>
        <p className="mt-2 font-medium text-gray-500">WhatsApp: +44 7398 753797 · contact@walztravels.com · walztravels.com</p>
      </div>
    </div>
  )
}

// ── Ticket body variants ──────────────────────────────────────────────────────

function FlightPreview({ d }: { d: Record<string, unknown> }) {
  const outbound   = (d.outbound   as FlightLeg[])  ?? []
  const inbound    = (d.inbound    as FlightLeg[])  ?? []
  const passengers = (d.passengers as Passenger[])  ?? []
  const tripType   = d.tripType as string
  const pnr        = d.pnr as string | undefined
  const pricing    = d.pricing as PricingBreakdown | undefined

  // Legacy fallback — if no outbound array, show flat fields
  const hasLegs = outbound.length > 0

  return (
    <>
      {/* PNR pill */}
      {pnr && (
        <div className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ backgroundColor: GOLD + '20', color: NAVY, border: `1px solid ${GOLD}` }}>
          PNR: {pnr}
        </div>
      )}

      {hasLegs ? (
        <>
          {/* ── Multi-leg outbound ── */}
          <SectionTitle>{outbound.length > 1 ? 'Outbound Flights' : 'Outbound Flight'}</SectionTitle>
          {outbound.map((leg, i) => (
            <LegDisplay key={i} leg={leg} index={i} total={outbound.length} />
          ))}

          {/* ── Inbound / return legs ── */}
          {tripType === 'return' && inbound.length > 0 && (
            <>
              <SectionTitle>{inbound.length > 1 ? 'Return Flights' : 'Return Flight'}</SectionTitle>
              {inbound.map((leg, i) => (
                <LegDisplay key={i} leg={leg} index={i} total={inbound.length} />
              ))}
            </>
          )}

          {/* ── Passengers ── */}
          {passengers.length > 0 && (
            <>
              <SectionTitle>Passengers</SectionTitle>
              {passengers.map((pax, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg p-2.5 mb-1.5"
                  style={{ backgroundColor: '#F3F4F6' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold w-5 text-center" style={{ color: GOLD }}>{i + 1}</span>
                    <div>
                      <div className="text-xs font-bold" style={{ color: NAVY }}>
                        {pax.title} {pax.firstName} {pax.lastName}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {pax.cabinClass}
                        {pax.seat ? ` · Seat ${pax.seat}` : ''}
                        {pax.meal ? ` · ${pax.meal}` : ''}
                      </div>
                    </div>
                  </div>
                  {pax.eTicketNumber && (
                    <div className="text-[10px] font-mono text-gray-500 text-right">
                      E-Ticket:<br />{pax.eTicketNumber}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        /* Legacy flat-field fallback */
        <>
          <SectionTitle>Passenger</SectionTitle>
          <Row>
            <FieldPair label="Full Name"  value={d.client_name as string} />
            <FieldPair label="Passport"   value={d.passport_number as string} />
          </Row>
          <SectionTitle>Flight</SectionTitle>
          <div className="rounded-xl p-4 mb-3 flex items-center justify-between" style={{ backgroundColor: '#F3F4F6' }}>
            <div className="text-center">
              <div className="text-2xl font-black" style={{ color: NAVY }}>{String(d.from_code ?? '???').toUpperCase()}</div>
              <div className="text-xs text-gray-500">{d.from_city as string}</div>
            </div>
            <div className="text-xl font-bold" style={{ color: GOLD }}>→</div>
            <div className="text-center">
              <div className="text-2xl font-black" style={{ color: NAVY }}>{String(d.to_code ?? '???').toUpperCase()}</div>
              <div className="text-xs text-gray-500">{d.to_city as string}</div>
            </div>
          </div>
          <Row>
            <FieldPair label="Airline"       value={d.airline as string} />
            <FieldPair label="Flight Number" value={d.flight_number as string} />
          </Row>
          <Row>
            <FieldPair label="Departure" value={`${d.departure_date ?? ''} ${d.departure_time ?? ''}`} />
            <FieldPair label="Arrival"   value={`${d.arrival_date ?? ''} ${d.arrival_time ?? ''}`} />
          </Row>
          <Row>
            <FieldPair label="Duration" value={d.duration as string} />
            <FieldPair label="Cabin"    value={d.cabin_class as string} />
          </Row>
          <Row>
            <FieldPair label="Seat"    value={d.seat_number as string} />
            <FieldPair label="Baggage" value={d.baggage_allowance as string} />
          </Row>
        </>
      )}

      {/* Pricing breakdown */}
      {pricing && pricing.grandTotal > 0 && (
        <>
          <SectionTitle>Pricing</SectionTitle>
          <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#FFFBF0', border: `1px solid ${GOLD}` }}>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Base fare (per pax)</span>
              <span style={{ color: NAVY }}>{pricing.currencySymbol}{pricing.baseFare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Taxes &amp; fees</span>
              <span style={{ color: NAVY }}>{pricing.currencySymbol}{pricing.taxes.toFixed(2)}</span>
            </div>
            {pricing.carrierFees ? (
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Carrier fees</span>
                <span style={{ color: NAVY }}>{pricing.currencySymbol}{pricing.carrierFees.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold pt-1" style={{ borderTop: `1px solid ${GOLD}60` }}>
              <span style={{ color: NAVY }}>Grand Total ({pricing.passengerCount} pax)</span>
              <span style={{ color: GOLD }}>{pricing.currencySymbol}{pricing.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}

      <Row>
        <FieldPair label="Booking Ref" value={d.booking_reference as string} />
      </Row>
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsSection />
    </>
  )
}

function HotelPreview({ d }: { d: Record<string, unknown> }) {
  return (
    <>
      <SectionTitle>Guest Details</SectionTitle>
      <Row>
        <FieldPair label="Guest Name" value={d.client_name as string} />
        <FieldPair label="Guests"     value={d.num_guests as string} />
      </Row>
      <FieldPair label="Guest Names"  value={d.guest_names as string} />
      <SectionTitle>Hotel</SectionTitle>
      <FieldPair label="Hotel Name"   value={d.hotel_name as string} />
      <FieldPair label="Address"      value={d.hotel_address as string} />
      <Row>
        <FieldPair label="Phone" value={d.hotel_phone as string} />
        <FieldPair label="Email" value={d.hotel_email as string} />
      </Row>
      <SectionTitle>Stay</SectionTitle>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[['CHECK IN', d.checkin_date as string, d.checkin_time as string ?? '14:00'],
          ['CHECK OUT', d.checkout_date as string, d.checkout_time as string ?? '12:00']].map(([lbl, date, time]) => (
          <div key={lbl as string} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F3F4F6' }}>
            <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">{lbl}</div>
            <div className="text-lg font-black" style={{ color: NAVY }}>{date}</div>
            <div className="text-[10px] text-gray-400">{lbl === 'CHECK IN' ? 'From' : 'By'} {time}</div>
          </div>
        ))}
      </div>
      <Row>
        <FieldPair label="Nights"    value={d.num_nights as string} />
        <FieldPair label="Room Type" value={d.room_type as string} />
      </Row>
      <GoldBox title="Confirmation Number" text={(d.confirmation_number as string) ?? '—'} />
      {d.special_requests && <GoldBox title="Special Requests" text={d.special_requests as string} />}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsSection />
    </>
  )
}

function TourPreview({ d }: { d: Record<string, unknown> }) {
  const incl  = (d.what_included as string ?? '').split('\n').filter(Boolean)
  const bring = (d.what_to_bring as string ?? '').split('\n').filter(Boolean)
  return (
    <>
      <SectionTitle>Guest Details</SectionTitle>
      <Row>
        <FieldPair label="Guest"  value={d.client_name as string} />
        <FieldPair label="Guests" value={d.num_guests as string} />
      </Row>
      <FieldPair label="Guest Names" value={d.guest_names as string} />
      <SectionTitle>Tour Details</SectionTitle>
      <FieldPair label="Tour Name" value={d.tour_name as string} />
      <Row>
        <FieldPair label="Operator" value={d.tour_operator as string} />
        <FieldPair label="Guide"    value={d.guide_name as string} />
      </Row>
      <Row>
        <FieldPair label="Date"     value={d.tour_date as string} />
        <FieldPair label="Time"     value={d.tour_time as string} />
      </Row>
      <Row>
        <FieldPair label="Duration"    value={d.duration as string} />
        <FieldPair label="Booking Ref" value={d.booking_reference as string} />
      </Row>
      <GoldBox title="📍 Meeting Point" text={(d.meeting_point as string) ?? '—'} />
      {d.pickup_included === 'yes' && (
        <GoldBox title="🚗 Pickup Included" text={`${d.pickup_address ?? ''} — ${d.pickup_time ?? ''}`} />
      )}
      {incl.length > 0 && (
        <><SectionTitle>What&apos;s Included</SectionTitle>{incl.map((t, i) => <CheckItem key={i} text={t} />)}</>
      )}
      {bring.length > 0 && (
        <><SectionTitle>What to Bring</SectionTitle>{bring.map((t, i) => <CheckItem key={i} text={t} />)}</>
      )}
      {d.emergency_contact && <GoldBox title="Emergency Contact" text={d.emergency_contact as string} />}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsSection />
    </>
  )
}

function TransferPreview({ d }: { d: Record<string, unknown> }) {
  return (
    <>
      <SectionTitle>Passenger</SectionTitle>
      <Row>
        <FieldPair label="Name"       value={d.client_name as string} />
        <FieldPair label="Passengers" value={d.num_passengers as string} />
      </Row>
      <FieldPair label="Passenger Names" value={d.passenger_names as string} />
      <SectionTitle>Transfer</SectionTitle>
      <Row>
        <FieldPair label="Company" value={d.transfer_company as string} />
        <FieldPair label="Vehicle" value={d.vehicle_type as string} />
      </Row>
      <Row>
        <FieldPair label="Driver"       value={d.driver_name as string} />
        <FieldPair label="Driver Phone" value={d.driver_phone as string} />
      </Row>
      <SectionTitle>Journey</SectionTitle>
      <GoldBox title={`⏰ Pickup: ${d.pickup_time ?? ''} on ${d.pickup_date ?? ''}`} text={`From: ${d.pickup_location ?? '—'}`} />
      <FieldPair label="Drop-off" value={d.dropoff_location as string} />
      <Row>
        <FieldPair label="Flight"      value={d.flight_number as string} />
        <FieldPair label="Booking Ref" value={d.booking_reference as string} />
      </Row>
      {d.special_instructions && <GoldBox title="Special Instructions" text={d.special_instructions as string} />}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsSection />
    </>
  )
}

function VisaPreview({ d }: { d: Record<string, unknown> }) {
  const docs = (d.documents_to_bring as string ?? '').split('\n').filter(Boolean)
  return (
    <>
      <SectionTitle>Applicant</SectionTitle>
      <Row>
        <FieldPair label="Full Name" value={d.client_name as string} />
        <FieldPair label="Passport"  value={d.passport_number as string} />
      </Row>
      <Row>
        <FieldPair label="Visa Type"  value={d.visa_type as string} />
        <FieldPair label="Reference"  value={d.reference_number as string} />
      </Row>
      <SectionTitle>Appointment</SectionTitle>
      <div className="rounded-xl p-4 text-center mb-3" style={{ backgroundColor: '#F3F4F6' }}>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">APPOINTMENT DATE &amp; TIME</div>
        <div className="text-xl font-black" style={{ color: NAVY }}>{d.appointment_date as string}</div>
        <div className="text-base font-bold mt-1" style={{ color: GOLD }}>{d.appointment_time as string}</div>
      </div>
      <FieldPair label="Location"    value={d.appointment_location as string} />
      <FieldPair label="VFS Address" value={d.vfs_address as string} />
      <Row>
        <FieldPair label="Contact" value={d.contact_person as string} />
        <FieldPair label="Phone"   value={d.contact_phone as string} />
      </Row>
      <RedBox
        title="⚠ IMPORTANT — Please Read Before Your Appointment"
        text={'• Please arrive at least 15 minutes before your appointment time.\n• Bring all required documents listed below.\n• Mobile phones may need to be stored. Check VFS rules.\n• This letter must be presented at the VFS centre.'}
      />
      {docs.length > 0 && (
        <><SectionTitle>Documents to Bring</SectionTitle>{docs.map((t, i) => <CheckItem key={i} text={t} />)}</>
      )}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsSection />
    </>
  )
}

function PackagePreview({ d }: { d: Record<string, unknown> }) {
  const inclusions = (d.inclusions as Record<string, { included: boolean; note?: string }>) ?? {}
  const LABELS: Record<string, string> = {
    flights: 'Return Flights', visa: 'Visa Processing', hotel: 'Hotel Accommodation',
    transfers: 'Airport Transfers', tours: 'Tour Experiences',
    insurance: 'Travel Insurance', esim: 'eSIM Connectivity',
  }
  const paid    = Number(d.amount_paid  ?? 0)
  const total   = Number(d.total_value  ?? 0)
  const balance = total - paid

  return (
    <>
      <SectionTitle>Traveller Details</SectionTitle>
      <Row>
        <FieldPair label="Lead Traveller" value={d.client_name as string} />
        <FieldPair label="Travellers"     value={d.num_travellers as string} />
      </Row>
      <FieldPair label="Traveller Names" value={d.traveller_names as string} />
      <SectionTitle>Package</SectionTitle>
      <FieldPair label="Package Name" value={d.package_name as string} />
      <Row>
        <FieldPair label="Destination" value={d.destination as string} />
        <FieldPair label="Reference"   value={d.package_reference as string} />
      </Row>
      <Row>
        <FieldPair label="Travel From" value={d.travel_from as string} />
        <FieldPair label="Travel To"   value={d.travel_to as string} />
      </Row>
      <SectionTitle>What&apos;s Included</SectionTitle>
      {Object.entries(inclusions).map(([key, val]) =>
        val.included ? (
          <div key={key} className="flex items-start gap-2 mb-1.5">
            <span className="text-xs font-bold flex-shrink-0" style={{ color: GOLD }}>✓</span>
            <div>
              <span className="text-xs font-semibold" style={{ color: NAVY }}>{LABELS[key] ?? key}</span>
              {val.note && <span className="text-[10px] text-gray-400 ml-1">— {val.note}</span>}
            </div>
          </div>
        ) : null
      )}
      <SectionTitle>Payment</SectionTitle>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F3F4F6' }}>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Total Value</div>
          <div className="text-base font-black" style={{ color: NAVY }}>{String(d.currency ?? 'USD')} {total.toFixed(2)}</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F3F4F6' }}>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Amount Paid</div>
          <div className="text-base font-black text-green-600">{String(d.currency ?? 'USD')} {paid.toFixed(2)}</div>
        </div>
      </div>
      {balance > 0 && (
        <GoldBox
          title={`Balance Due: ${d.currency ?? 'USD'} ${balance.toFixed(2)}`}
          text={`Payment due by: ${d.payment_due_date ?? '—'}. Contact us to arrange payment.`}
        />
      )}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsSection />
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface TicketPreviewData {
  ticket_type:      string
  ticket_reference: string
  [key: string]:    unknown
}

export function TicketPreview({ data }: { data: TicketPreviewData }) {
  const type = data.ticket_type
  const ref  = data.ticket_reference || 'WLZ-PREVIEW'
  const d    = data as Record<string, unknown>

  return (
    <div className="rounded-xl overflow-hidden shadow-lg text-sm font-sans" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="px-7 py-5 flex items-center justify-between" style={{ backgroundColor: NAVY }}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" className="h-8 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div className="text-[9px] tracking-[0.25em] uppercase mt-1" style={{ color: GOLD }}>YOUR JOURNEY. OUR EXPERTISE.</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="px-2.5 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: GOLD, color: NAVY }}>
            REF: {ref}
          </div>
          {type && (
            <div className="px-2 py-0.5 rounded-full text-[9px] tracking-wider" style={{ border: `1px solid ${GOLD}`, color: GOLD }}>
              {TYPE_LABELS[type] ?? type.toUpperCase()}
            </div>
          )}
        </div>
      </div>
      {/* Gold bar */}
      <div className="h-1" style={{ backgroundColor: GOLD }} />

      {/* Body */}
      <div className="bg-white px-7 py-5">
        {!type && (
          <div className="text-center py-10 text-gray-400">
            <div className="text-4xl mb-3">🎫</div>
            <p className="text-sm">Select a ticket type to see the preview</p>
          </div>
        )}
        {type === 'flight'   && <FlightPreview   d={d} />}
        {type === 'hotel'    && <HotelPreview    d={d} />}
        {type === 'tour'     && <TourPreview     d={d} />}
        {type === 'transfer' && <TransferPreview d={d} />}
        {type === 'visa'     && <VisaPreview     d={d} />}
        {type === 'package'  && <PackagePreview  d={d} />}
      </div>

      {/* Footer */}
      <div className="px-7 py-4 border-t border-gray-100" style={{ backgroundColor: '#F3F4F6' }}>
        <div className="flex items-center justify-between">
          <div className="text-[9px] text-gray-400">WhatsApp: +44 7398 753797 · contact@walztravels.com · walztravels.com</div>
          <div className="text-[9px] font-bold" style={{ color: GOLD }}>Powered by Jade</div>
        </div>
      </div>
    </div>
  )
}
