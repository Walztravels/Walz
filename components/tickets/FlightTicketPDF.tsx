// @ts-nocheck — @react-pdf/renderer child type constraints differ from standard React
/**
 * FlightTicketPDF — Emirates-style A4 flight ticket in @react-pdf/renderer
 * Modelled on the industry-standard boarding-pass / itinerary receipt format.
 * All content comes from FlightTicketEmailProps — zero hardcoded data.
 */

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Line, Svg, Image,
} from '@react-pdf/renderer'
import type { FlightTicketEmailProps, FlightLeg, Passenger, PricingBreakdown } from '@/types/flight-ticket'
import { WALZ_LOGO_BASE64 } from '@/lib/assets/walz-logo-base64'

// Embedded base64 PNG — no network request needed during PDF render
const LOGO_SRC = WALZ_LOGO_BASE64

// ── Brand ─────────────────────────────────────────────────────────────────────
const NAVY   = '#0B1F3A'
const GOLD   = '#C9A84C'
const GOLD_L = '#F7F4EF'
const GREY   = '#6B7280'
const LGREY  = '#F3F4F6'
const MID    = '#374151'
const WHITE  = '#FFFFFF'
const GREEN  = '#16A34A'

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: WHITE,
    paddingBottom: 56,
  },

  // ── Page header (repeats on every page) ──────────────────────────────────
  pageHeader: {
    backgroundColor: WHITE,
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomColor: LGREY,
    borderBottomWidth: 1,
  },
  logoBlock: { flexDirection: 'column' },
  logoName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 0.5 },
  logoTag:  { fontSize: 7,  color: GOLD, letterSpacing: 2.5, marginTop: 2 },
  titleBlock: { alignItems: 'center', flex: 1, paddingTop: 4 },
  titleText: { fontSize: 22, color: NAVY, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 },
  titleSub:  { fontSize: 8,  color: GREY, marginTop: 2 },
  ticketNumBlock: { alignItems: 'flex-end' },
  ticketNumLabel: { fontSize: 7, color: GREY, marginBottom: 2 },
  ticketNumValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY },

  // ── Gold bar ─────────────────────────────────────────────────────────────
  goldBar: { height: 3, backgroundColor: GOLD },

  // ── Passenger info bar ───────────────────────────────────────────────────
  paxBar: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomColor: LGREY,
    borderBottomWidth: 1,
  },
  paxLabel: { fontSize: 8, color: GREY, marginBottom: 2 },
  paxName:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase' },
  paxValue: { fontSize: 9, color: MID },

  // ── Booking reference box ────────────────────────────────────────────────
  refBox: {
    marginHorizontal: 32,
    marginTop: 10,
    backgroundColor: GOLD_L,
    borderColor: GOLD,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  refLabel: { fontSize: 8, color: GREY },
  refValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 1 },
  refPNR:   { fontSize: 8, color: GREY, marginTop: 2 },

  // ── Check-in timeline bar ────────────────────────────────────────────────
  timelineOuter: {
    marginHorizontal: 32,
    marginTop: 12,
    marginBottom: 4,
    flexDirection: 'row',
    gap: 2,
  },
  timelineCell: {
    flex: 1,
    backgroundColor: LGREY,
    borderRadius: 4,
    padding: 8,
    alignItems: 'center',
  },
  timelineIcon:  { fontSize: 14, marginBottom: 3 },
  timelineMain:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'center' },
  timelineSub:   { fontSize: 7, color: GREY, textAlign: 'center', marginTop: 2, lineHeight: 1.4 },

  // ── Section heading ──────────────────────────────────────────────────────
  sectionOuter: { marginHorizontal: 32, marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  sectionSub:   { fontSize: 7.5, color: GREY, textAlign: 'right' },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },

  // ── Direction banner (dark navy) ─────────────────────────────────────────
  dirBanner: {
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 4,
    marginBottom: 1,
  },
  dirArrow: { fontSize: 10, color: GOLD },
  dirText:  { fontSize: 9, color: WHITE, fontFamily: 'Helvetica-Bold' },
  dirCity:  { fontSize: 9, color: GOLD, fontFamily: 'Helvetica-Bold' },

  // ── Leg sub-header ───────────────────────────────────────────────────────
  legHeader: {
    backgroundColor: LGREY,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  legHeaderText: { fontSize: 7.5, color: GREY },

  // ── Leg card ─────────────────────────────────────────────────────────────
  legCard: {
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 10,
    overflow: 'hidden',
  },

  // ── Leg body (two-column) ────────────────────────────────────────────────
  legBody: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 0,
  },

  // Left column: flight info + times
  legLeft: { flex: 55, flexDirection: 'column', gap: 0 },
  legRight:{ flex: 45, flexDirection: 'column', paddingLeft: 12, borderLeftColor: '#E5E7EB', borderLeftWidth: 1 },

  // Left column rows
  flightNumBig: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY },
  cabinSmall:   { fontSize: 8, color: GREY, marginTop: 1 },
  fareSmall:    { fontSize: 7.5, color: GREY },

  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  timeDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: NAVY },
  timeLine: { width: 24, height: 1.5, backgroundColor: GOLD },
  timePlaneDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  timePlaneText: { fontSize: 7, color: NAVY },
  timeLabel:  { fontSize: 8, color: GREY, marginTop: 2 },
  timeBig:    { fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY, lineHeight: 1 },
  timeDateSm: { fontSize: 7.5, color: GREY, marginTop: 1 },

  statusBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  statusText: { fontSize: 7.5, color: GREEN, fontFamily: 'Helvetica-Bold' },

  checkinBox: {
    backgroundColor: LGREY,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  checkinLabel: { fontSize: 7, color: GREY },
  checkinTime:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },

  // Right column (city names)
  cityName:    { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: -0.5 },
  airportName: { fontSize: 7.5, color: GREY, marginTop: 2, lineHeight: 1.4 },
  terminalBadge: {
    backgroundColor: NAVY,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  terminalText: { fontSize: 6.5, color: WHITE, fontFamily: 'Helvetica-Bold' },
  cityDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },

  // Baggage + validity row
  legFooter: {
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: LGREY,
  },
  legFooterText: { fontSize: 7.5, color: GREY },
  baggageText:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: NAVY },

  // ── Passengers list ──────────────────────────────────────────────────────
  paxTable: {
    marginHorizontal: 32,
    marginTop: 8,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  paxTableHead: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  paxTableHeadText: { fontSize: 7.5, color: WHITE, fontFamily: 'Helvetica-Bold', flex: 1 },
  paxRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopColor: '#F3F4F6',
    borderTopWidth: 1,
  },
  paxRowAlt: { backgroundColor: LGREY },
  paxCell:   { flex: 1, fontSize: 8, color: NAVY },
  paxCellGrey: { flex: 1, fontSize: 8, color: GREY },

  // ── Pricing table ────────────────────────────────────────────────────────
  priceTable: {
    marginHorizontal: 32,
    marginTop: 8,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  priceHead: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  priceHeadText: { fontSize: 8, color: WHITE, fontFamily: 'Helvetica-Bold', flex: 1 },
  priceRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopColor: '#F3F4F6',
    borderTopWidth: 1,
  },
  priceRowAlt: { backgroundColor: LGREY },
  priceLabel: { flex: 1, fontSize: 8, color: MID },
  priceValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, width: 80, textAlign: 'right' },
  priceTotalRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopColor: GOLD,
    borderTopWidth: 1.5,
    backgroundColor: GOLD_L,
  },
  priceTotalLabel: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  priceTotalValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, width: 80, textAlign: 'right' },

  // ── Agent message box ────────────────────────────────────────────────────
  msgBox: {
    marginHorizontal: 32,
    marginTop: 10,
    backgroundColor: GOLD_L,
    borderColor: GOLD,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  msgTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  msgText:  { fontSize: 8.5, color: '#78650A', lineHeight: 1.6 },

  // ── Important notices ────────────────────────────────────────────────────
  noticeBox: {
    marginHorizontal: 32,
    marginTop: 8,
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#166534', marginBottom: 4 },
  noticeText:  { fontSize: 8, color: '#166534', lineHeight: 1.5 },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: NAVY,
    paddingHorizontal: 32,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft:  { fontSize: 7.5, color: 'rgba(255,255,255,0.6)' },
  footerRight: { fontSize: 7.5, color: GOLD, fontFamily: 'Helvetica-Bold' },
})

// ── Helper: format date nicely ────────────────────────────────────────────────
function formatDate(d: string): string {
  if (!d) return ''
  // If already like "10Nov2025" or "10 Nov 2025", just return
  // If YYYY-MM-DD parse it
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${parseInt(m[3])} ${months[parseInt(m[2]) - 1]} ${m[1]}`
  }
  return d
}

// ── LegCard ───────────────────────────────────────────────────────────────────
function LegCard({
  leg, legIndex, totalLegs, direction,
}: {
  leg: FlightLeg
  legIndex: number
  totalLegs: number
  direction: string
}) {
  const checkinDate = leg.departureDate  // use departure date as checkin date baseline
  const checkinTime = leg.departureTime  // placeholder if not provided

  return (
    <View style={s.legCard}>
      {/* Direction banner */}
      <View style={s.dirBanner}>
        <Text style={s.dirArrow}>→</Text>
        <Text style={s.dirText}>Departing » From </Text>
        <Text style={s.dirCity}>{leg.departureCity}, {leg.departureCountry}</Text>
      </View>

      {/* Leg sub-header */}
      <View style={s.legHeader}>
        <Text style={s.legHeaderText}>
          Leg {legIndex + 1} of {totalLegs}  |  {leg.departureCity} ({leg.departureCode}) to {leg.arrivalCity} ({leg.arrivalCode})  |  Operated by {leg.operatedBy ?? leg.airline}
        </Text>
      </View>

      {/* Two-column body */}
      <View style={s.legBody}>
        {/* LEFT — flight number, times, status */}
        <View style={s.legLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={s.flightNumBig}>{leg.flightNumber}</Text>
              <Text style={s.cabinSmall}>{leg.cabinClass}</Text>
              {leg.aircraft ? <Text style={s.fareSmall}>{leg.aircraft}</Text> : null}
            </View>
            {/* Check-in box */}
            <View style={s.checkinBox}>
              <Text style={s.checkinLabel}>Check-in by</Text>
              <Text style={s.checkinTime}>{formatDate(checkinDate)}</Text>
            </View>
          </View>

          {/* Departure time */}
          <View style={{ marginTop: 12 }}>
            <Text style={s.timeLabel}>Departure</Text>
            <Text style={s.timeBig}>{leg.departureTime}</Text>
            <Text style={s.timeDateSm}>{formatDate(leg.departureDate)}</Text>
          </View>

          {/* Status */}
          <View style={s.statusBadge}>
            <Text style={s.statusText}>✓  Confirmed</Text>
          </View>

          {/* Arrival time */}
          <View style={{ marginTop: 10 }}>
            <Text style={s.timeLabel}>Arrival</Text>
            <Text style={s.timeBig}>{leg.arrivalTime}</Text>
            <Text style={s.timeDateSm}>
              {formatDate(leg.arrivalDate)}{leg.arrivalNextDay ? '  (+1)' : ''}
            </Text>
          </View>

          {leg.duration ? (
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 7.5, color: GREY }}>Duration: {leg.duration}</Text>
            </View>
          ) : null}
        </View>

        {/* RIGHT — city names & airports */}
        <View style={s.legRight}>
          {/* Departure city */}
          <Text style={s.cityName}>{leg.departureCity.toUpperCase()}</Text>
          <Text style={s.airportName}>Departing {leg.departureCode}, {leg.departureAirport}</Text>
          {leg.departureTerminal ? (
            <View style={s.terminalBadge}>
              <Text style={s.terminalText}>{leg.departureTerminal}</Text>
            </View>
          ) : null}

          <View style={s.cityDivider} />

          {/* Arrival city */}
          <Text style={s.cityName}>{leg.arrivalCity.toUpperCase()}</Text>
          <Text style={s.airportName}>Arriving {leg.arrivalCode}, {leg.arrivalAirport}</Text>
          {leg.arrivalTerminal ? (
            <View style={s.terminalBadge}>
              <Text style={s.terminalText}>{leg.arrivalTerminal}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Footer: validity + baggage */}
      <View style={s.legFooter}>
        <Text style={s.legFooterText}>
          Coupon validity: not before {formatDate(leg.departureDate)} / not after {formatDate(leg.departureDate)}
        </Text>
        <Text style={s.baggageText}>Baggage: {leg.baggage}</Text>
      </View>
    </View>
  )
}

// ── Check-in timeline ─────────────────────────────────────────────────────────
function CheckInTimeline() {
  const cells = [
    { icon: '✈', main: 'Check in 3 hrs\nbefore', sub: 'Up to 4 hrs for full\ntravel requirements' },
    { icon: '⏰', main: '90 minutes\nbefore take-off', sub: 'Go through\npassport control' },
    { icon: '🚶', main: '60 minutes\nbefore take-off', sub: 'Be ready at gate\n(Premium / Economy)' },
    { icon: '💺', main: '45 minutes\nbefore take-off', sub: 'Be ready at gate\n(First / Business)' },
  ]
  return (
    <View style={s.timelineOuter}>
      {cells.map((c, i) => (
        <View key={i} style={s.timelineCell}>
          <Text style={s.timelineIcon}>{c.icon}</Text>
          <Text style={s.timelineMain}>{c.main}</Text>
          <Text style={s.timelineSub}>{c.sub}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Page header (fixed, repeats on every page) ────────────────────────────────
function PageHeader({ pnr, reference }: { pnr: string; reference: string }) {
  return (
    <>
      <View style={s.pageHeader} fixed>
        {/* Logo */}
        <View style={s.logoBlock}>
          <Image src={LOGO_SRC} style={{ width: 40, height: 40 }} />
          <Text style={s.logoTag}>YOUR JOURNEY. OUR EXPERTISE.</Text>
        </View>

        {/* Centre title */}
        <View style={s.titleBlock}>
          <Text style={s.titleText}>Flight Ticket</Text>
          <Text style={s.titleSub}>Scan ticket number at self check-in</Text>
        </View>

        {/* Ticket number */}
        <View style={s.ticketNumBlock}>
          <Text style={s.ticketNumLabel}>Ticket number</Text>
          <Text style={s.ticketNumValue}>{reference}</Text>
          {pnr && pnr !== reference ? (
            <>
              <Text style={[s.ticketNumLabel, { marginTop: 4 }]}>PNR</Text>
              <Text style={s.ticketNumValue}>{pnr}</Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={s.goldBar} fixed />
    </>
  )
}

// ── Footer (fixed, repeats on every page) ─────────────────────────────────────
function Footer({ reference }: { reference: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerLeft}>
        Walz Travels  ·  contact@walztravels.com  ·  walztravels.com  ·  WhatsApp UK: +44 7398 753797  ·  Ref: {reference}
      </Text>
      <Text style={s.footerRight}>Powered by Jade — Walz Travels AI</Text>
    </View>
  )
}

// ── Passengers table ──────────────────────────────────────────────────────────
function PassengersTable({ passengers }: { passengers: Passenger[] }) {
  if (!passengers || passengers.length === 0) return null
  return (
    <View style={s.paxTable}>
      <View style={s.paxTableHead}>
        <Text style={[s.paxTableHeadText, { flex: 2 }]}>Passenger Name</Text>
        <Text style={s.paxTableHeadText}>Ticket Number</Text>
        <Text style={s.paxTableHeadText}>Class</Text>
        <Text style={s.paxTableHeadText}>Seat</Text>
        <Text style={s.paxTableHeadText}>Meal</Text>
      </View>
      {passengers.map((p, i) => (
        <View key={i} style={[s.paxRow, i % 2 === 1 ? s.paxRowAlt : {}]}>
          <Text style={[s.paxCell, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>
            {[p.title, p.lastName?.toUpperCase(), p.firstName].filter(Boolean).join(' / ')}
          </Text>
          <Text style={s.paxCellGrey}>{p.eTicketNumber ?? '—'}</Text>
          <Text style={s.paxCell}>{p.cabinClass ?? '—'}</Text>
          <Text style={s.paxCell}>{p.seat ?? '—'}</Text>
          <Text style={s.paxCell}>{p.meal ?? '—'}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Pricing table ─────────────────────────────────────────────────────────────
function PricingTable({ pricing }: { pricing: PricingBreakdown }) {
  const sym = pricing.currencySymbol ?? pricing.currency
  const rows: [string, string][] = [
    ['Base Fare', `${sym}${pricing.baseFare.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    ['Taxes & Fees', `${sym}${pricing.taxes.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
  ]
  if (pricing.carrierFees) {
    rows.push(['Carrier Fees', `${sym}${pricing.carrierFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}`])
  }
  if (pricing.lineItems) {
    pricing.lineItems.forEach(li => rows.push([li.label, `${sym}${li.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]))
  }
  rows.push(['Per Person', `${sym}${pricing.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`])

  return (
    <View style={s.priceTable}>
      <View style={s.priceHead}>
        <Text style={s.priceHeadText}>Fare Information</Text>
        <Text style={[s.priceHeadText, { textAlign: 'right' }]}>Passengers: {pricing.passengerCount}</Text>
      </View>
      {rows.map(([label, value], i) => (
        <View key={i} style={[s.priceRow, i % 2 === 1 ? s.priceRowAlt : {}]}>
          <Text style={s.priceLabel}>{label}</Text>
          <Text style={s.priceValue}>{value}</Text>
        </View>
      ))}
      <View style={s.priceTotalRow}>
        <Text style={s.priceTotalLabel}>Total Fare (All passengers)</Text>
        <Text style={s.priceTotalValue}>
          {sym}{pricing.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
      </View>
    </View>
  )
}

// ── Main document ─────────────────────────────────────────────────────────────
export function FlightTicketPDF(props: FlightTicketEmailProps) {
  const {
    reference, pnr, issueDate, issuedBy,
    title, firstName, lastName, email, phone,
    outbound, inbound, tripType, passengers, pricing, agentMessage,
  } = props

  const fullName = [title, lastName?.toUpperCase(), firstName].filter(Boolean).join('/')
  const allLegs  = [...(outbound ?? []), ...(inbound ?? [])]
  const totalLegs = allLegs.length

  return (
    <Document
      title={`Walz Travels — Flight Ticket — ${pnr ?? reference}`}
      author="Walz Travels"
      subject={`Flight itinerary reference ${reference}`}
    >
      <Page size="A4" style={s.page}>
        <PageHeader pnr={pnr} reference={reference} />

        {/* ── Passenger info bar ─────────────────────────────────────── */}
        <View style={s.paxBar}>
          <View>
            <Text style={s.paxLabel}>Passenger name</Text>
            <Text style={s.paxName}>{fullName || '—'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.paxLabel}>Issued by / Date</Text>
            <Text style={s.paxValue}>{issuedBy ?? 'Walz Travels'}</Text>
            <Text style={s.paxValue}>{issueDate}</Text>
          </View>
        </View>

        {/* ── Booking reference ──────────────────────────────────────── */}
        <View style={s.refBox}>
          <View style={{ flex: 1 }}>
            <Text style={s.refLabel}>Your booking reference</Text>
            <Text style={s.refValue}>{pnr ?? reference}</Text>
            {pnr && pnr !== reference ? (
              <Text style={s.refPNR}>Walz Ref: {reference}</Text>
            ) : null}
          </View>
          {email ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.refPNR}>{email}</Text>
              {phone ? <Text style={s.refPNR}>{phone}</Text> : null}
              <Text style={s.refPNR}>
                {tripType === 'return' ? 'Return' : 'One-Way'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Check-in timeline ──────────────────────────────────────── */}
        <CheckInTimeline />

        {/* ── Outbound legs ──────────────────────────────────────────── */}
        <View style={[s.sectionOuter, { marginTop: 16 }]}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Your travel information</Text>
            <Text style={s.sectionSub}>All times shown are local for each city</Text>
          </View>
        </View>

        <View style={{ marginHorizontal: 32, marginTop: 8 }}>
          {(outbound ?? []).map((leg, i) => (
            <LegCard
              key={i}
              leg={leg}
              legIndex={i}
              totalLegs={totalLegs}
              direction="outbound"
            />
          ))}
        </View>

        {/* ── Inbound legs ───────────────────────────────────────────── */}
        {inbound && inbound.length > 0 ? (
          <View style={{ marginHorizontal: 32 }}>
            {inbound.map((leg, i) => (
              <LegCard
                key={i}
                leg={leg}
                legIndex={outbound.length + i}
                totalLegs={totalLegs}
                direction="inbound"
              />
            ))}
          </View>
        ) : null}

        {/* ── Passengers ─────────────────────────────────────────────── */}
        {passengers && passengers.length > 0 ? (
          <>
            <View style={[s.sectionOuter, { marginTop: 12 }]}>
              <Text style={s.sectionTitle}>All Passengers</Text>
            </View>
            <PassengersTable passengers={passengers} />
          </>
        ) : null}

        {/* ── Pricing ────────────────────────────────────────────────── */}
        {pricing ? (
          <>
            <View style={[s.sectionOuter, { marginTop: 12 }]}>
              <Text style={s.sectionTitle}>Fare Information</Text>
            </View>
            <PricingTable pricing={pricing} />
          </>
        ) : null}

        {/* ── Agent message ──────────────────────────────────────────── */}
        {agentMessage ? (
          <View style={s.msgBox}>
            <Text style={s.msgTitle}>Message from Walz Travels</Text>
            <Text style={s.msgText}>{agentMessage}</Text>
          </View>
        ) : null}

        {/* ── WhatsApp CTA ───────────────────────────────────────────── */}
        <View style={s.noticeBox}>
          <Text style={s.noticeTitle}>Need help? We're available 24/7</Text>
          <Text style={s.noticeText}>
            WhatsApp UK: +44 7398 753797  ·  WhatsApp US/Canada: +1 555 710 7823
            {'\n'}Email: contact@walztravels.com  ·  Chat with Jade at walztravels.com
          </Text>
        </View>

        {/* ── Terms & Conditions ────────────────────────────────────── */}
        <View style={{
          marginHorizontal: 32, marginTop: 10,
          borderTopColor: '#E5E7EB', borderTopWidth: 1, paddingTop: 8,
        }}>
          <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 }}>
            Terms {'&'} Conditions
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              {[
                "1. Check in 2 hrs before domestic and 3 hrs before international flights. Late check-in is at the passenger's own risk.",
                "2. Baggage allowances are subject to airline policy. Excess charges are the passenger's responsibility.",
                "3. This ticket is non-transferable. The name on the ticket must match the passport at check-in.",
                "4. Cancellation and amendment fees apply. Contact Walz Travels at least 48 hrs before departure for changes.",
              ].map((t, i) => (
                <Text key={i} style={{ fontSize: 6.5, color: '#9CA3AF', lineHeight: 1.6, marginBottom: 2 }}>{t}</Text>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              {[
                "5. Walz Travels acts as an agent. We are not liable for delays, cancellations or service failures by airlines or third parties.",
                "6. Travel insurance is strongly recommended. Walz Travels is not responsible for medical emergencies or property loss.",
                "7. Passengers requiring special assistance must notify the airline at least 48 hrs before travel.",
                "8. By accepting this ticket, the passenger confirms acceptance of these terms. Full policy: walztravels.com/terms",
              ].map((t, i) => (
                <Text key={i} style={{ fontSize: 6.5, color: '#9CA3AF', lineHeight: 1.6, marginBottom: 2 }}>{t}</Text>
              ))}
            </View>
          </View>
        </View>

        <Footer reference={reference} />
      </Page>
    </Document>
  )
}
