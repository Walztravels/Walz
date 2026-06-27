// @ts-nocheck — @react-pdf/renderer has strict child type definitions
// that differ from standard React types. The component renders correctly at runtime.

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Svg, Rect, Image,
} from '@react-pdf/renderer'
import type { FlightLeg, Passenger, PricingBreakdown } from '@/types/flight-ticket'

// ── Brand colours ─────────────────────────────────────────────────────────────
const NAVY  = '#0B1F3A'
const NAVY2 = '#0F2B4A'   // slightly lighter for return card header
const GOLD  = '#C9A84C'
const GREY  = '#6B7280'
const LGREY = '#F3F4F6'
const WHITE = '#FFFFFF'
const RED   = '#DC2626'

// ── Global page styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: WHITE,
    paddingBottom: 60,
  },
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 32,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft:  { flexDirection: 'column' },
  brandTag:    { color: GOLD, fontSize: 8, letterSpacing: 2, marginTop: 4 },
  headerRight: { alignItems: 'flex-end' },
  refBadge: {
    backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 4,
  },
  refText:  { color: NAVY, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  typeBadge: {
    borderColor: GOLD, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, marginTop: 4,
  },
  typeText: { color: GOLD, fontSize: 7, letterSpacing: 1 },
  goldBar:  { height: 3, backgroundColor: GOLD },
  body:     { paddingHorizontal: 28, paddingTop: 16 },
  // Section heading
  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 8, marginTop: 16,
    paddingBottom: 4, borderBottomColor: GOLD, borderBottomWidth: 1,
  },
  // Two-col grid
  row:   { flexDirection: 'row', marginBottom: 6 },
  col:   { flex: 1 },
  fieldLabel:       { fontSize: 8,  color: GREY,  marginBottom: 2 },
  fieldValue:       { fontSize: 10, color: NAVY,  fontFamily: 'Helvetica-Bold' },
  fieldValueNormal: { fontSize: 10, color: NAVY },
  // Route (used in hotel/other bodies only)
  routeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: LGREY, borderRadius: 6, padding: 14, marginVertical: 10,
  },
  routeCity:  { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY },
  routeCode:  { fontSize: 11, color: GREY },
  routeArrow: { fontSize: 18, color: GOLD },
  // Gold info box
  goldBox: {
    backgroundColor: '#FFFBF0', borderColor: GOLD, borderWidth: 1,
    borderRadius: 6, padding: 12, marginVertical: 8,
  },
  goldBoxTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  goldBoxText:  { fontSize: 9, color: '#78650A', lineHeight: 1.5 },
  // Red warning box
  redBox: {
    backgroundColor: '#FFF5F5', borderColor: RED, borderWidth: 1,
    borderRadius: 6, padding: 12, marginVertical: 8,
  },
  redBoxTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 4 },
  redBoxText:  { fontSize: 9, color: RED, lineHeight: 1.5 },
  // Checklist item
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  checkMark: { fontSize: 9, color: GOLD, fontFamily: 'Helvetica-Bold', marginRight: 6 },
  checkText: { fontSize: 9, color: NAVY, flex: 1 },
  // Big highlight (hotel/package)
  bigHighlight: {
    backgroundColor: LGREY, borderRadius: 8, padding: 16,
    alignItems: 'center', marginVertical: 8,
  },
  bigLabel: { fontSize: 8, color: GREY, marginBottom: 4 },
  bigValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY },
  // Divider
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: LGREY,
    paddingHorizontal: 32, paddingVertical: 14,
    borderTopColor: '#E5E7EB', borderTopWidth: 1,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:  { fontSize: 7.5, color: GREY },
  footerBrand: { fontSize: 7.5, color: GOLD, fontFamily: 'Helvetica-Bold' },
  // Passenger pill (for additional passengers)
  passengerBox: {
    backgroundColor: LGREY, borderRadius: 6, padding: 8,
    marginBottom: 6, flexDirection: 'row',
  },
  passengerNum: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GOLD, marginRight: 12 },
})

// ── Boarding-pass specific styles ─────────────────────────────────────────────
const bp = StyleSheet.create({
  // Passenger strip
  passengerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    backgroundColor: '#FAFAFA',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  paxLabel: {
    fontSize: 7,
    color: GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  paxName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  paxDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    alignSelf: 'stretch',
    marginHorizontal: 14,
  },
  paxPassport: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    letterSpacing: 1,
    marginBottom: 2,
  },
  paxRef: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GOLD,
    letterSpacing: 1,
  },
  // Boarding-pass card
  card: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  // Card header strip
  cardHeader: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  airlineName: {
    color: WHITE,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    flex: 1,
  },
  dirBadge: {
    backgroundColor: GOLD,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 10,
  },
  dirText: {
    color: NAVY,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
  },
  flightNum: {
    color: WHITE,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  // Route container
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  iataCode: {
    fontSize: 34,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  cityLabel: {
    fontSize: 9,
    color: GREY,
    marginTop: 2,
  },
  timeLabel: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 7,
  },
  dateLabel: {
    fontSize: 8,
    color: GREY,
    marginTop: 2,
  },
  routeCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  durationLabel: {
    fontSize: 8,
    color: GREY,
    marginTop: 4,
  },
  stopBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 4,
  },
  stopBadgeText: {
    fontSize: 7,
    color: '#92400E',
    fontFamily: 'Helvetica-Bold',
  },
  stopDirectText: {
    fontSize: 8,
    color: '#9CA3AF',
    marginTop: 4,
  },
  // Details strip
  detailsStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  detailDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    alignSelf: 'stretch',
  },
  detailLbl: {
    fontSize: 7,
    color: GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  detailVal: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  detailValGold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GOLD,
  },
  // PNR + barcode row
  pnrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  pnrLbl: {
    fontSize: 7,
    color: GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  pnrVal: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    letterSpacing: 3,
  },
  // Tear-off divider
  tearoff: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  tearoffLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  tearoffLabel: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    backgroundColor: '#F9FAFB',
  },
  tearoffLabelText: {
    fontSize: 7,
    color: '#9CA3AF',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  )
}

function FieldRow({ pairs }: { pairs: [string, string | undefined | null][] }) {
  const visible = pairs.filter(([, v]) => v)
  if (visible.length === 0) return null
  return (
    <View style={s.row}>
      {visible.map(([l, v], i) => (
        <View key={i} style={[s.col, i > 0 ? { marginLeft: 16 } : {}]}>
          <Text style={s.fieldLabel}>{l}</Text>
          <Text style={s.fieldValue}>{v ?? '—'}</Text>
        </View>
      ))}
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>
}

function GoldBox({ title, text }: { title: string; text: string }) {
  return (
    <View style={s.goldBox}>
      <Text style={s.goldBoxTitle}>{title}</Text>
      <Text style={s.goldBoxText}>{text}</Text>
    </View>
  )
}

function CheckItem({ text }: { text: string }) {
  return (
    <View style={s.checkRow}>
      <Text style={s.checkMark}>✓</Text>
      <Text style={s.checkText}>{text}</Text>
    </View>
  )
}

function Footer({ reference }: { reference: string }) {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerRow}>
        <Text style={s.footerText}>WhatsApp: +44 7398 753797  ·  contact@walztravels.com  ·  walztravels.com</Text>
        <Text style={s.footerBrand}>Powered by Jade — Walz Travels AI</Text>
      </View>
      <View style={[s.footerRow, { marginTop: 4 }]}>
        <Text style={s.footerText}>Ref: {reference}</Text>
        <Text style={s.footerText}>This document is auto-generated by Walz Travels</Text>
      </View>
    </View>
  )
}

// ── Barcode SVG (visual-only, seeded from PNR) ────────────────────────────────
function BarcodeSVG({ value }: { value: string }) {
  const seed = (value || 'WALZ000').repeat(3)
  const bars: Array<{ x: number; w: number; dark: boolean }> = []
  let x = 0
  for (let i = 0; i < 55; i++) {
    const code = seed.charCodeAt(i % seed.length)
    const w = (code % 3) + 1
    bars.push({ x, w, dark: i % 2 === 0 })
    x += w + 0.7
  }
  const totalW = Math.max(x, 1)
  return (
    <Svg width={130} height={32} viewBox={`0 0 ${totalW} 32`}>
      {bars.filter(b => b.dark).map((b, i) => (
        <Rect key={i} x={String(b.x)} y="2" width={String(b.w)} height="28" fill={NAVY} />
      ))}
    </Svg>
  )
}

// ── Passenger strip ───────────────────────────────────────────────────────────
function PassengerStrip({
  name, passport, bookingRef,
}: { name?: string; passport?: string; bookingRef?: string }) {
  if (!name && !passport) return null
  return (
    <View style={bp.passengerStrip}>
      <View style={{ flex: 1 }}>
        <Text style={bp.paxLabel}>Passenger</Text>
        <Text style={bp.paxName}>{(name || 'PASSENGER').toUpperCase()}</Text>
      </View>
      {passport && (
        <>
          <View style={bp.paxDivider} />
          <View>
            <Text style={bp.paxLabel}>Passport No.</Text>
            <Text style={bp.paxPassport}>{passport.toUpperCase()}</Text>
          </View>
        </>
      )}
      {bookingRef && (
        <>
          <View style={bp.paxDivider} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={bp.paxLabel}>Booking Ref</Text>
            <Text style={bp.paxRef}>{bookingRef.toUpperCase()}</Text>
          </View>
        </>
      )}
    </View>
  )
}

// ── Tear-off divider ──────────────────────────────────────────────────────────
function TearoffDivider() {
  return (
    <View style={bp.tearoff}>
      <View style={bp.tearoffLine} />
      <View style={bp.tearoffLabel}>
        <Text style={bp.tearoffLabelText}>- - RETURN FLIGHT - -</Text>
      </View>
      <View style={bp.tearoffLine} />
    </View>
  )
}

// ── Single boarding-pass leg card ─────────────────────────────────────────────
function LegCard({
  direction, shade, airline, flightNumber,
  fromCode, fromCity, toCode, toCity,
  departureDate, departureTime, arrivalDate, arrivalTime,
  duration, stops, cabin, seat, baggage, pnr,
}: {
  direction:     'OUTBOUND' | 'RETURN'
  shade:         string
  airline:       string
  flightNumber:  string
  fromCode:      string
  fromCity:      string
  toCode:        string
  toCity:        string
  departureDate: string
  departureTime: string
  arrivalDate:   string
  arrivalTime:   string
  duration:      string
  stops:         number
  cabin:         string
  seat:          string
  baggage:       string
  pnr:           string
}) {
  const safeStr = (v: unknown) => String(v || '')
  const stopsLabel = stops === 0 ? 'Non-stop' : stops === 1 ? '1 stop' : `${stops} stops`

  return (
    <View style={bp.card}>
      {/* ── Header strip ── */}
      <View style={[bp.cardHeader, { backgroundColor: shade }]}>
        <Text style={bp.airlineName}>{(airline || 'AIRLINE').toUpperCase()}</Text>
        <View style={bp.dirBadge}>
          <Text style={bp.dirText}>{direction}</Text>
        </View>
        <Text style={bp.flightNum}>{safeStr(flightNumber) || '—'}</Text>
      </View>

      {/* ── Route ── */}
      <View style={bp.routeContainer}>
        {/* From */}
        <View style={{ width: 96 }}>
          <Text style={bp.iataCode}>{safeStr(fromCode || '???').toUpperCase()}</Text>
          <Text style={bp.cityLabel}>{fromCity}</Text>
          <Text style={bp.timeLabel}>{departureTime}</Text>
          <Text style={bp.dateLabel}>{departureDate}</Text>
        </View>

        {/* Center */}
        <View style={bp.routeCenter}>
          {/* Arrow line */}
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#D1D5DB' }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginHorizontal: 4 }} />
            <View style={{ flex: 1, height: 1, backgroundColor: '#D1D5DB' }} />
          </View>
          <Text style={bp.durationLabel}>{duration || '—'}</Text>
          {stops > 0
            ? (
              <View style={bp.stopBadge}>
                <Text style={bp.stopBadgeText}>{stopsLabel}</Text>
              </View>
            )
            : <Text style={bp.stopDirectText}>{stopsLabel}</Text>
          }
        </View>

        {/* To */}
        <View style={{ width: 96, alignItems: 'flex-end' }}>
          <Text style={bp.iataCode}>{safeStr(toCode || '???').toUpperCase()}</Text>
          <Text style={bp.cityLabel}>{toCity}</Text>
          <Text style={bp.timeLabel}>{arrivalTime}</Text>
          <Text style={bp.dateLabel}>{arrivalDate}</Text>
        </View>
      </View>

      {/* ── Details strip ── */}
      <View style={bp.detailsStrip}>
        <View style={bp.detailItem}>
          <Text style={bp.detailLbl}>Class</Text>
          <Text style={bp.detailVal}>{safeStr(cabin) || 'ECONOMY'}</Text>
        </View>
        <View style={bp.detailDivider} />
        <View style={bp.detailItem}>
          <Text style={bp.detailLbl}>Seat</Text>
          <Text style={bp.detailValGold}>{safeStr(seat) || '—'}</Text>
        </View>
        <View style={bp.detailDivider} />
        <View style={[bp.detailItem, { flex: 2 }]}>
          <Text style={bp.detailLbl}>Baggage</Text>
          <Text style={bp.detailVal}>{safeStr(baggage) || '—'}</Text>
        </View>
      </View>

      {/* ── PNR + barcode ── */}
      <View style={bp.pnrRow}>
        <View>
          <Text style={bp.pnrLbl}>Booking Reference / PNR</Text>
          <Text style={bp.pnrVal}>{(safeStr(pnr) || '——————').toUpperCase()}</Text>
        </View>
        <BarcodeSVG value={pnr || 'WALZ000'} />
      </View>
    </View>
  )
}

// ── TYPE LABELS ───────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  flight:   'FLIGHT TICKET',
  hotel:    'HOTEL VOUCHER',
  tour:     'TOUR CONFIRMATION',
  transfer: 'TRANSFER VOUCHER',
  visa:     'VISA APPOINTMENT',
  package:  'HOLIDAY PACKAGE',
}

// ── Header ────────────────────────────────────────────────────────────────────
function TicketHeader({ type, reference }: { type: string; reference: string }) {
  return (
    <>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src="data:image/png;base64,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" style={{ height: 36, width: 36, objectFit: 'contain' }} />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 4, marginBottom: 2 }}>WALZ TRAVELS</Text>
          <Text style={s.brandTag}>YOUR JOURNEY. OUR EXPERTISE.</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.refBadge}>
            <Text style={s.refText}>REF: {reference}</Text>
          </View>
          <View style={s.typeBadge}>
            <Text style={s.typeText}>{TYPE_LABELS[type] ?? type.toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <View style={s.goldBar} />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKET BODY VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Terms & Conditions PDF section ───────────────────────────────────────────

function TermsPDFSection() {
  return (
    <View style={{ marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Terms {'&'} Conditions
      </Text>
      <Text style={{ fontSize: 7, color: '#9CA3AF', lineHeight: 1.6 }}>
        {'1. This document is issued by Walz Travels Ltd and serves as confirmation of your travel arrangements. Please carry this document with your valid passport and any required visas.\n'}
        {'2. Passengers must check in at least 2 hours before departure for domestic flights and 3 hours for international flights. Walz Travels is not liable for missed flights due to late check-in.\n'}
        {'3. Baggage allowances are subject to airline policy. Excess baggage charges are the passenger\'s responsibility. Please verify allowances with the operating airline before travel.\n'}
        {'4. Cancellation and amendment policies vary by ticket type. Please contact Walz Travels at least 48 hours before departure to discuss changes. Change fees may apply.\n'}
        {'5. Walz Travels acts as an agent for airlines, hotels and other travel suppliers. We are not liable for delays, cancellations, overbooking, or service failures by third-party suppliers.\n'}
        {'6. Travel insurance is strongly recommended. Walz Travels is not responsible for losses from medical emergencies, trip interruptions or personal property loss.\n'}
        {'7. By proceeding with this booking, the passenger confirms acceptance of these terms. Full terms at walztravels.com/terms · support@walztravels.com'}
      </Text>
    </View>
  )
}

// ── Flight body — multi-leg boarding pass ─────────────────────────────────────
function FlightBody({ d }: { d: Record<string, unknown> }) {
  const str      = (v: unknown) => String(v || '')
  const outbound = (d.outbound   as FlightLeg[]) ?? []
  const inbound  = (d.inbound    as FlightLeg[]) ?? []
  const passengers = (d.passengers as Passenger[]) ?? []
  const tripType = d.tripType as string
  const pnr      = str(d.pnr)
  const pricing  = d.pricing as PricingBreakdown | undefined

  const hasLegs = outbound.length > 0

  // ── Legacy single-leg fallback ───────────────────────────────────────────
  if (!hasLegs) {
    const hasReturn = !!(d.return_date || d.return_flight)
    return (
      <View style={s.body}>
        <PassengerStrip name={str(d.client_name)} passport={str(d.passport_number)} bookingRef={str(d.booking_reference || d.pnr)} />
        <LegCard direction="OUTBOUND" shade={NAVY} airline={str(d.airline)} flightNumber={str(d.flight_number)} fromCode={str(d.from_code)} fromCity={str(d.from_city)} toCode={str(d.to_code)} toCity={str(d.to_city)} departureDate={str(d.departure_date)} departureTime={str(d.departure_time)} arrivalDate={str(d.arrival_date)} arrivalTime={str(d.arrival_time)} duration={str(d.duration)} stops={0} cabin={str(d.cabin_class)} seat={str(d.seat_number)} baggage={str(d.baggage_allowance)} pnr={pnr} />
        {hasReturn && (
          <>
            <TearoffDivider />
            <LegCard direction="RETURN" shade={NAVY2} airline={str(d.return_airline || d.airline)} flightNumber={str(d.return_flight)} fromCode={str(d.to_code)} fromCity={str(d.to_city)} toCode={str(d.from_code)} toCity={str(d.from_city)} departureDate={str(d.return_date)} departureTime={str(d.return_time)} arrivalDate={str(d.return_arrival_date)} arrivalTime={str(d.return_arrival_time)} duration={str(d.return_duration)} stops={0} cabin={str(d.cabin_class)} seat={str(d.return_seat_number || d.seat_number)} baggage={str(d.baggage_allowance)} pnr={pnr} />
          </>
        )}
        {d.message && <GoldBox title="Message from Walz Travels" text={str(d.message)} />}

        {/* Additional passengers when provided in legacy mode */}
        {passengers.length > 0 && (
          <>
            <SectionTitle>All Passengers</SectionTitle>
            {passengers.map((pax: Passenger, i: number) => (
              <View key={i} style={[s.passengerBox, { alignItems: 'center' }]}>
                <Text style={s.passengerNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldValue}>{pax.title} {pax.firstName} {pax.lastName}</Text>
                  <Text style={s.fieldLabel}>
                    {pax.cabinClass}{pax.seat ? ` · Seat ${pax.seat}` : ''}{pax.meal ? ` · ${pax.meal}` : ''}
                  </Text>
                </View>
                {pax.eTicketNumber && (
                  <Text style={{ fontSize: 8, color: GREY, letterSpacing: 0.5 }}>E-Ticket: {pax.eTicketNumber}</Text>
                )}
              </View>
            ))}
          </>
        )}

        <TermsPDFSection />
      </View>
    )
  }

  // ── Multi-leg rendering ──────────────────────────────────────────────────
  return (
    <View style={s.body}>
      {/* Primary passenger strip */}
      {passengers.length > 0 ? (
        <PassengerStrip
          name={`${passengers[0].title} ${passengers[0].firstName} ${passengers[0].lastName}`}
          passport={passengers[0].eTicketNumber ?? ''}
          bookingRef={pnr}
        />
      ) : (
        <PassengerStrip name={str(d.client_name)} passport={str(d.passport_number)} bookingRef={pnr} />
      )}

      {/* Outbound legs */}
      {outbound.map((leg: FlightLeg, i: number) => (
        <React.Fragment key={i}>
          {i > 0 && <TearoffDivider />}
          <LegCard
            direction={outbound.length > 1 ? `OUT ${i + 1}/${outbound.length}` : 'OUTBOUND'}
            shade={NAVY}
            airline={leg.airline}
            flightNumber={leg.flightNumber}
            fromCode={leg.departureCode}
            fromCity={leg.departureCity}
            toCode={leg.arrivalCode}
            toCity={leg.arrivalCity}
            departureDate={leg.departureDate}
            departureTime={leg.departureTime}
            arrivalDate={leg.arrivalDate}
            arrivalTime={leg.arrivalTime}
            duration={leg.duration}
            stops={0}
            cabin={leg.cabinClass}
            seat={leg.seat ?? ''}
            baggage={leg.baggage}
            pnr={pnr}
          />
          {(leg.baggage || leg.mealPreference || leg.operatedBy) && (
            <View style={{ flexDirection: 'row', marginTop: 2, marginBottom: 8, paddingHorizontal: 4, gap: 16 }}>
              {leg.baggage && <Text style={{ fontSize: 8, color: GREY }}>Baggage: {leg.baggage}</Text>}
              {leg.mealPreference && <Text style={{ fontSize: 8, color: GREY }}>Meal: {leg.mealPreference}</Text>}
              {leg.operatedBy && <Text style={{ fontSize: 8, color: GREY }}>Operated by: {leg.operatedBy}</Text>}
            </View>
          )}
        </React.Fragment>
      ))}

      {/* Inbound / return legs */}
      {tripType === 'return' && inbound.length > 0 && (
        <>
          <TearoffDivider />
          {inbound.map((leg: FlightLeg, i: number) => (
            <React.Fragment key={i}>
              {i > 0 && <TearoffDivider />}
              <LegCard
                direction={inbound.length > 1 ? `RET ${i + 1}/${inbound.length}` : 'RETURN'}
                shade={NAVY2}
                airline={leg.airline}
                flightNumber={leg.flightNumber}
                fromCode={leg.departureCode}
                fromCity={leg.departureCity}
                toCode={leg.arrivalCode}
                toCity={leg.arrivalCity}
                departureDate={leg.departureDate}
                departureTime={leg.departureTime}
                arrivalDate={leg.arrivalDate}
                arrivalTime={leg.arrivalTime}
                duration={leg.duration}
                stops={0}
                cabin={leg.cabinClass}
                seat={leg.seat ?? ''}
                baggage={leg.baggage}
                pnr={pnr}
              />
              {(leg.baggage || leg.mealPreference) && (
                <View style={{ flexDirection: 'row', marginTop: 2, marginBottom: 8, paddingHorizontal: 4, gap: 16 }}>
                  {leg.baggage && <Text style={{ fontSize: 8, color: GREY }}>Baggage: {leg.baggage}</Text>}
                  {leg.mealPreference && <Text style={{ fontSize: 8, color: GREY }}>Meal: {leg.mealPreference}</Text>}
                </View>
              )}
            </React.Fragment>
          ))}
        </>
      )}

      {/* All passengers */}
      {passengers.length > 0 && (
        <>
          <SectionTitle>All Passengers</SectionTitle>
          {passengers.map((pax: Passenger, i: number) => (
            <View key={i} style={[s.passengerBox, { alignItems: 'center' }]}>
              <Text style={s.passengerNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldValue}>{pax.title} {pax.firstName} {pax.lastName}</Text>
                <Text style={s.fieldLabel}>
                  {pax.cabinClass}{pax.seat ? ` · Seat ${pax.seat}` : ''}{pax.meal ? ` · ${pax.meal}` : ''}
                </Text>
              </View>
              {pax.eTicketNumber && (
                <Text style={{ fontSize: 8, color: GREY, letterSpacing: 0.5 }}>E-Ticket: {pax.eTicketNumber}</Text>
              )}
            </View>
          ))}
        </>
      )}

      {/* Pricing breakdown */}
      {pricing && pricing.grandTotal > 0 && (
        <>
          <SectionTitle>Pricing</SectionTitle>
          <View style={s.goldBox}>
            <View style={[s.row, { marginBottom: 3 }]}>
              <Text style={[s.fieldLabel, { flex: 1 }]}>Base fare (per pax)</Text>
              <Text style={s.fieldValue}>{pricing.currencySymbol}{pricing.baseFare.toFixed(2)}</Text>
            </View>
            <View style={[s.row, { marginBottom: 3 }]}>
              <Text style={[s.fieldLabel, { flex: 1 }]}>Taxes {'&'} fees</Text>
              <Text style={s.fieldValue}>{pricing.currencySymbol}{pricing.taxes.toFixed(2)}</Text>
            </View>
            {pricing.carrierFees ? (
              <View style={[s.row, { marginBottom: 3 }]}>
                <Text style={[s.fieldLabel, { flex: 1 }]}>Carrier fees</Text>
                <Text style={s.fieldValue}>{pricing.currencySymbol}{pricing.carrierFees.toFixed(2)}</Text>
              </View>
            ) : null}
            <View style={[s.row, { borderTopWidth: 1, borderTopColor: GOLD, paddingTop: 6, marginTop: 3 }]}>
              <Text style={[s.fieldValue, { flex: 1 }]}>Grand Total ({pricing.passengerCount} pax)</Text>
              <Text style={[s.fieldValue, { color: GOLD }]}>{pricing.currencySymbol}{pricing.grandTotal.toFixed(2)}</Text>
            </View>
          </View>
        </>
      )}

      {d.message && <GoldBox title="Message from Walz Travels" text={str(d.message)} />}
      <TermsPDFSection />
    </View>
  )
}

// ── Hotel body ────────────────────────────────────────────────────────────────
function HotelBody({ d }: { d: Record<string, unknown> }) {
  const stars      = d.star_rating ? Number(d.star_rating) : 0
  const amenities  = (d.amenities as string[] | undefined) ?? []
  const fullAddr   = [d.hotel_address, d.city, d.postcode, d.country].filter(Boolean).join(', ')
  const cancPolicy = d.cancellation_policy as string | undefined
  const cancColor  = cancPolicy === 'Free cancellation' ? '#16A34A' : cancPolicy === 'Non-refundable' ? '#DC2626' : cancPolicy === 'Partially refundable' ? '#D97706' : NAVY
  const cancBg     = cancPolicy === 'Free cancellation' ? '#F0FDF4' : cancPolicy === 'Non-refundable' ? '#FEF2F2' : cancPolicy === 'Partially refundable' ? '#FFFBEB' : LGREY

  return (
    <View style={s.body}>

      {/* Confirmed banner */}
      <View style={{ backgroundColor: '#F0FDF4', borderRadius: 6, padding: 10, marginBottom: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#16A34A', letterSpacing: 1 }}>
          BOOKING CONFIRMED{d.confirmation_number ? `  ·  Conf: ${d.confirmation_number}` : ''}
        </Text>
      </View>

      {/* Hotel identity */}
      <SectionTitle>Hotel</SectionTitle>
      <Field label="Hotel Name" value={d.hotel_name as string} />
      {stars > 0 && (
        <Text style={[s.fieldValue, { color: '#C9A84C', marginBottom: 6 }]}>
          {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
        </Text>
      )}
      {fullAddr && <Field label="Address" value={fullAddr} />}
      <FieldRow pairs={[['Phone', d.hotel_phone as string], ['Email', d.hotel_email as string]]} />
      {d.hotel_website && <Field label="Website" value={d.hotel_website as string} />}

      {/* Stay */}
      <SectionTitle>Stay Details</SectionTitle>
      <View style={s.row}>
        <View style={[s.bigHighlight, { flex: 1 }]}>
          <Text style={s.bigLabel}>CHECK IN</Text>
          <Text style={s.bigValue}>{d.checkin_date as string}</Text>
          <Text style={[s.fieldLabel, { marginTop: 4 }]}>From {d.checkin_time ?? '14:00'}</Text>
        </View>
        <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE, backgroundColor: NAVY, borderRadius: 20, padding: 4 }}>
            {d.num_nights ? `${d.num_nights}N` : '—'}
          </Text>
        </View>
        <View style={[s.bigHighlight, { flex: 1 }]}>
          <Text style={s.bigLabel}>CHECK OUT</Text>
          <Text style={s.bigValue}>{d.checkout_date as string}</Text>
          <Text style={[s.fieldLabel, { marginTop: 4 }]}>By {d.checkout_time ?? '12:00'}</Text>
        </View>
      </View>
      <FieldRow pairs={[['Rooms', d.num_rooms as string], ['Room Type', d.room_type as string], ['Bed Type', d.bed_type as string]]} />
      <FieldRow pairs={[['Board Basis', d.board_basis as string], ['Meal Plan', d.meal_plan as string]]} />

      {/* Guest */}
      <SectionTitle>Guest Details</SectionTitle>
      <FieldRow pairs={[['Lead Guest', d.client_name as string], ['Guests', d.num_guests as string]]} />
      {d.guest_names    && <Field label="Guest Names"          value={d.guest_names as string} />}
      {d.loyalty_number && <Field label="Loyalty / Rewards No." value={d.loyalty_number as string} />}

      {/* Rate */}
      {(d.total_price || d.cancellation_policy) && (
        <>
          <SectionTitle>Rate &amp; Cancellation</SectionTitle>
          {d.total_price && (
            <FieldRow pairs={[['Total Price', `${d.currency ?? 'GBP'} ${d.total_price}`], ['Rate', d.rate_description as string]]} />
          )}
          {cancPolicy && (
            <View style={{ backgroundColor: cancBg, borderRadius: 6, padding: 10, marginVertical: 6, borderColor: cancColor, borderWidth: 1 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: cancColor }}>{cancPolicy}</Text>
              {d.cancellation_deadline && (
                <Text style={{ fontSize: 9, color: GREY, marginTop: 2 }}>Deadline: {d.cancellation_deadline as string}</Text>
              )}
            </View>
          )}
        </>
      )}

      {/* Amenities */}
      {amenities.length > 0 && (
        <>
          <SectionTitle>Amenities</SectionTitle>
          <Text style={{ fontSize: 9, color: NAVY, lineHeight: 1.6 }}>{amenities.join('  ·  ')}</Text>
        </>
      )}

      {d.special_requests && <GoldBox title="Special Requests"        text={d.special_requests as string} />}
      {d.message           && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsPDFSection />
    </View>
  )
}

// ── Tour body ─────────────────────────────────────────────────────────────────
function TourBody({ d }: { d: Record<string, unknown> }) {
  const included = (d.what_included as string ?? '').split('\n').filter(Boolean)
  const toBring  = (d.what_to_bring as string ?? '').split('\n').filter(Boolean)
  return (
    <View style={s.body}>
      <SectionTitle>Guest Details</SectionTitle>
      <FieldRow pairs={[['Guest Name', d.client_name as string], ['Guests', d.num_guests as string]]} />
      {d.guest_names && <Field label="Guest Names" value={d.guest_names as string} />}

      <SectionTitle>Tour Details</SectionTitle>
      <Field label="Tour Name" value={d.tour_name as string} />
      <FieldRow pairs={[['Operator', d.tour_operator as string], ['Guide', d.guide_name as string]]} />
      <FieldRow pairs={[['Date', d.tour_date as string], ['Time', d.tour_time as string]]} />
      <FieldRow pairs={[['Duration', d.duration as string], ['Booking Ref', d.booking_reference as string]]} />
      <GoldBox title="Meeting Point" text={d.meeting_point as string ?? '—'} />
      {d.pickup_included === 'yes' && (
        <GoldBox title="Pickup Included" text={`${d.pickup_address ?? ''} — ${d.pickup_time ?? ''}`} />
      )}
      {included.length > 0 && (
        <>
          <SectionTitle>What's Included</SectionTitle>
          {included.map((t, i) => <CheckItem key={i} text={t} />)}
        </>
      )}
      {toBring.length > 0 && (
        <>
          <SectionTitle>What to Bring</SectionTitle>
          {toBring.map((t, i) => <CheckItem key={i} text={t} />)}
        </>
      )}
      {d.emergency_contact && <GoldBox title="Emergency Contact" text={d.emergency_contact as string} />}
      {d.message           && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsPDFSection />
    </View>
  )
}

// ── Transfer body ─────────────────────────────────────────────────────────────
function TransferBody({ d }: { d: Record<string, unknown> }) {
  return (
    <View style={s.body}>
      <SectionTitle>Passenger Details</SectionTitle>
      <FieldRow pairs={[['Passenger', d.client_name as string], ['Passengers', d.num_passengers as string]]} />
      {d.passenger_names && <Field label="Passenger Names" value={d.passenger_names as string} />}

      <SectionTitle>Transfer Details</SectionTitle>
      <FieldRow pairs={[['Company', d.transfer_company as string], ['Vehicle', d.vehicle_type as string]]} />
      <FieldRow pairs={[['Driver', d.driver_name as string], ['Driver Phone', d.driver_phone as string]]} />

      <SectionTitle>Journey</SectionTitle>
      <GoldBox title={`Pickup: ${d.pickup_time ?? ''} on ${d.pickup_date ?? ''}`} text={`From: ${d.pickup_location ?? '—'}`} />
      <Field label="Drop-off Location" value={d.dropoff_location as string} />
      <FieldRow pairs={[['Flight Number', d.flight_number as string], ['Booking Ref', d.booking_reference as string]]} />
      {d.special_instructions && <GoldBox title="Special Instructions" text={d.special_instructions as string} />}
      {d.message              && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsPDFSection />
    </View>
  )
}

// ── Visa body ─────────────────────────────────────────────────────────────────
function VisaBody({ d }: { d: Record<string, unknown> }) {
  const docs = (d.documents_to_bring as string ?? '').split('\n').filter(Boolean)
  return (
    <View style={s.body}>
      <SectionTitle>Applicant Details</SectionTitle>
      <FieldRow pairs={[['Full Name', d.client_name as string], ['Passport Number', d.passport_number as string]]} />
      <FieldRow pairs={[['Visa Type', d.visa_type as string], ['Reference Number', d.reference_number as string]]} />

      <SectionTitle>Appointment Details</SectionTitle>
      <View style={[s.bigHighlight, { marginVertical: 10 }]}>
        <Text style={s.bigLabel}>APPOINTMENT DATE & TIME</Text>
        <Text style={s.bigValue}>{d.appointment_date as string}</Text>
        <Text style={[s.fieldValue, { color: GOLD, marginTop: 4 }]}>{d.appointment_time as string}</Text>
      </View>
      <Field label="Appointment Location" value={d.appointment_location as string} />
      <Field label="VFS Centre Address"   value={d.vfs_address as string} />
      <FieldRow pairs={[['Contact Person', d.contact_person as string], ['Contact Phone', d.contact_phone as string]]} />
      <View style={s.redBox}>
        <Text style={s.redBoxTitle}>IMPORTANT — Please Read Before Your Appointment</Text>
        <Text style={s.redBoxText}>
          • Please arrive at least 15 minutes before your appointment time.{'\n'}
          • Bring all required documents listed below in the correct order.{'\n'}
          • Mobile phones may need to be stored. Check VFS rules before arrival.{'\n'}
          • This letter must be presented at the VFS centre.
        </Text>
      </View>
      {docs.length > 0 && (
        <>
          <SectionTitle>Documents to Bring</SectionTitle>
          {docs.map((t, i) => <CheckItem key={i} text={t} />)}
        </>
      )}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsPDFSection />
    </View>
  )
}

// ── Package body ──────────────────────────────────────────────────────────────
function PackageBody({ d }: { d: Record<string, unknown> }) {
  const inclusions = (d.inclusions as Record<string, { included: boolean; note?: string }>) ?? {}
  const INCLUSION_LABELS: Record<string, string> = {
    flights:   'Return Flights',
    visa:      'Visa Processing',
    hotel:     'Hotel Accommodation',
    transfers: 'Airport Transfers',
    tours:     'Tour Experiences',
    insurance: 'Travel Insurance',
    esim:      'eSIM Connectivity',
  }
  const paid    = Number(d.amount_paid  ?? 0)
  const total   = Number(d.total_value  ?? 0)
  const balance = total - paid

  return (
    <View style={s.body}>
      <SectionTitle>Traveller Details</SectionTitle>
      <FieldRow pairs={[['Lead Traveller', d.client_name as string], ['Travellers', d.num_travellers as string]]} />
      {d.traveller_names && <Field label="Traveller Names" value={d.traveller_names as string} />}

      <SectionTitle>Package Details</SectionTitle>
      <Field label="Package Name" value={d.package_name as string} />
      <FieldRow pairs={[['Destination', d.destination as string], ['Reference', d.package_reference as string]]} />
      <FieldRow pairs={[['Travel From', d.travel_from as string], ['Travel To', d.travel_to as string]]} />

      <SectionTitle>What's Included</SectionTitle>
      {Object.entries(inclusions).map(([key, val]) => {
        if (!val.included) return null
        return (
          <View key={key} style={s.checkRow}>
            <Text style={s.checkMark}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.checkText}>{INCLUSION_LABELS[key] ?? key}</Text>
              {val.note ? <Text style={[s.checkText, { color: GREY, fontSize: 8 }]}>{val.note}</Text> : null}
            </View>
          </View>
        )
      })}

      <SectionTitle>Payment Summary</SectionTitle>
      <View style={s.row}>
        <View style={[s.bigHighlight, { flex: 1 }]}>
          <Text style={s.bigLabel}>TOTAL VALUE</Text>
          <Text style={s.bigValue}>{d.currency ?? 'USD'} {total.toFixed(2)}</Text>
        </View>
        <View style={[s.bigHighlight, { flex: 1, marginLeft: 16 }]}>
          <Text style={s.bigLabel}>AMOUNT PAID</Text>
          <Text style={[s.bigValue, { color: '#16A34A' }]}>{d.currency ?? 'USD'} {paid.toFixed(2)}</Text>
        </View>
      </View>
      {balance > 0 && (
        <GoldBox
          title={`Balance Due: ${d.currency ?? 'USD'} ${balance.toFixed(2)}`}
          text={`Payment due by: ${d.payment_due_date ?? '—'}. Contact us to arrange payment.`}
        />
      )}
      {d.message && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
      <TermsPDFSection />
    </View>
  )
}

// ── Main document ─────────────────────────────────────────────────────────────

export interface TicketData {
  ticket_type:      string
  ticket_reference: string
  client_name?:     string
  client_email?:    string
  [key: string]:    unknown
}

export function TicketPDFDocument({ data }: { data: TicketData }) {
  const ref  = data.ticket_reference
  const type = data.ticket_type
  const d    = { client_name: data.client_name, client_email: data.client_email, ...data } as Record<string, unknown>

  return (
    <Document
      title={`Walz Travels — ${TYPE_LABELS[type] ?? type} — ${ref}`}
      author="Walz Travels"
      subject={`Travel document reference ${ref}`}
    >
      <Page size="A4" style={s.page}>
        <TicketHeader type={type} reference={ref} />

        {type === 'flight'   && <FlightBody   d={d} />}
        {type === 'hotel'    && <HotelBody    d={d} />}
        {type === 'tour'     && <TourBody     d={d} />}
        {type === 'transfer' && <TransferBody d={d} />}
        {type === 'visa'     && <VisaBody     d={d} />}
        {type === 'package'  && <PackageBody  d={d} />}

        <Footer reference={ref} />
      </Page>
    </Document>
  )
}
