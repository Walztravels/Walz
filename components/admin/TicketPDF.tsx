// @ts-nocheck — @react-pdf/renderer has strict child type definitions
// that differ from standard React types. The component renders correctly at runtime.

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Svg, Rect, Image,
} from '@react-pdf/renderer'

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
          <Image src="https://www.walztravels.com/walz-logo-white.png" style={{ height: 28, objectFit: 'contain' }} />
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

// ── Flight body — dual-leg boarding pass ──────────────────────────────────────
function FlightBody({ d }: { d: Record<string, unknown> }) {
  const str  = (v: unknown) => String(v || '')
  const num  = (v: unknown) => Number(v ?? 0)
  const pax  = (d.additional_passengers as unknown[]) ?? []

  const hasReturn = !!(d.return_date || d.return_flight)

  return (
    <View style={s.body}>
      {/* Passenger strip */}
      <PassengerStrip
        name={str(d.client_name)}
        passport={str(d.passport_number)}
        bookingRef={str(d.booking_reference || d.pnr)}
      />

      {/* Outbound leg */}
      <LegCard
        direction="OUTBOUND"
        shade={NAVY}
        airline={str(d.airline)}
        flightNumber={str(d.flight_number)}
        fromCode={str(d.from_code)}
        fromCity={str(d.from_city)}
        toCode={str(d.to_code)}
        toCity={str(d.to_city)}
        departureDate={str(d.departure_date)}
        departureTime={str(d.departure_time)}
        arrivalDate={str(d.arrival_date)}
        arrivalTime={str(d.arrival_time)}
        duration={str(d.duration)}
        stops={num(d.stops)}
        cabin={str(d.cabin_class)}
        seat={str(d.seat_number)}
        baggage={str(d.baggage_allowance)}
        pnr={str(d.pnr)}
      />

      {/* Return leg */}
      {hasReturn && (
        <>
          <TearoffDivider />
          <LegCard
            direction="RETURN"
            shade={NAVY2}
            airline={str(d.return_airline || d.airline)}
            flightNumber={str(d.return_flight)}
            fromCode={str(d.to_code)}
            fromCity={str(d.to_city)}
            toCode={str(d.from_code)}
            toCity={str(d.from_city)}
            departureDate={str(d.return_date)}
            departureTime={str(d.return_time)}
            arrivalDate={str(d.return_arrival_date)}
            arrivalTime={str(d.return_arrival_time)}
            duration={str(d.return_duration)}
            stops={num(d.return_stops)}
            cabin={str(d.cabin_class)}
            seat={str(d.return_seat_number || d.seat_number)}
            baggage={str(d.baggage_allowance)}
            pnr={str(d.return_pnr || d.pnr)}
          />
        </>
      )}

      {/* Additional passengers */}
      {pax.length > 0 && (
        <>
          <SectionTitle>All Passengers</SectionTitle>
          {pax.map((p: unknown, i: number) => {
            const px = p as Record<string, string>
            return (
              <View key={i} style={s.passengerBox}>
                <Text style={s.passengerNum}>{i + 1}</Text>
                <View>
                  <Text style={s.fieldValue}>{px.name}</Text>
                  <Text style={s.fieldLabel}>Passport: {px.passport}  ·  Seat: {px.seat}</Text>
                </View>
              </View>
            )
          })}
        </>
      )}

      {d.message && <GoldBox title="Message from Walz Travels" text={str(d.message)} />}
    </View>
  )
}

// ── Hotel body ────────────────────────────────────────────────────────────────
function HotelBody({ d }: { d: Record<string, unknown> }) {
  return (
    <View style={s.body}>
      <SectionTitle>Guest Details</SectionTitle>
      <FieldRow pairs={[['Guest Name', d.client_name as string], ['Number of Guests', d.num_guests as string]]} />
      {d.guest_names && <Field label="Guest Names" value={d.guest_names as string} />}

      <SectionTitle>Hotel Information</SectionTitle>
      <Field label="Hotel Name"  value={d.hotel_name    as string} />
      <Field label="Address"     value={d.hotel_address as string} />
      <FieldRow pairs={[['Hotel Phone', d.hotel_phone as string], ['Hotel Email', d.hotel_email as string]]} />

      <SectionTitle>Stay Details</SectionTitle>
      <View style={s.row}>
        <View style={[s.bigHighlight, { flex: 1 }]}>
          <Text style={s.bigLabel}>CHECK IN</Text>
          <Text style={s.bigValue}>{d.checkin_date as string}</Text>
          <Text style={[s.fieldLabel, { marginTop: 4 }]}>From {d.checkin_time ?? '14:00'}</Text>
        </View>
        <View style={[s.bigHighlight, { flex: 1, marginLeft: 16 }]}>
          <Text style={s.bigLabel}>CHECK OUT</Text>
          <Text style={s.bigValue}>{d.checkout_date as string}</Text>
          <Text style={[s.fieldLabel, { marginTop: 4 }]}>By {d.checkout_time ?? '12:00'}</Text>
        </View>
      </View>
      <FieldRow pairs={[['Nights', d.num_nights as string], ['Room Type', d.room_type as string], ['Rooms', d.num_rooms as string]]} />
      <GoldBox title="Confirmation Number" text={d.confirmation_number as string ?? '—'} />
      {d.special_requests && <GoldBox title="Special Requests"       text={d.special_requests as string} />}
      {d.message           && <GoldBox title="Message from Walz Travels" text={d.message as string} />}
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
