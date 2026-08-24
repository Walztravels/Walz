import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const NAVY  = '#0B1F3A'
const GOLD  = '#C9A84C'
const GREY  = '#6b7280'
const LIGHT = '#f9fafb'
const WHITE = '#ffffff'

const s = StyleSheet.create({
  page:      { backgroundColor: WHITE, fontFamily: 'Helvetica', fontSize: 9, color: '#1f2937', paddingBottom: 40 },
  cover:     { backgroundColor: NAVY, height: '100%', padding: 50, flexDirection: 'column' },
  coverTitle:   { fontSize: 26, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 6 },
  coverRef:     { fontSize: 11, color: GOLD, marginBottom: 32, letterSpacing: 1 },
  coverDivider: { height: 2, backgroundColor: GOLD, marginBottom: 32, width: 60 },
  coverFor:     { fontSize: 10, color: '#94a3b8', marginBottom: 4 },
  coverClient:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 32 },
  coverValid:   { fontSize: 9, color: '#64748b' },
  coverFooter:  { position: 'absolute', bottom: 40, left: 50, right: 50, borderTopWidth: 1, borderTopColor: '#1e3a5f', paddingTop: 12 },
  coverFooterTxt: { fontSize: 8, color: '#475569' },

  // Section
  secHeader: { backgroundColor: NAVY, color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 10, padding: '8 16', letterSpacing: 0.5 },
  content:   { padding: '12 16', backgroundColor: WHITE },

  // Row utilities
  row:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 5 },
  label:     { fontSize: 8, color: GREY, width: '35%' },
  value:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827', flex: 1 },

  // Price summary
  priceLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  priceLabel: { fontSize: 9, color: GREY },
  priceVal:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 2, borderTopColor: NAVY, marginTop: 4 },
  totalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  totalVal:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: GOLD },

  // Flight
  airlineBand: { backgroundColor: LIGHT, padding: '8 12', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  airlineName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  badge:       { backgroundColor: GOLD, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  badgeTxt:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY },

  segRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  segCode:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, width: 40 },
  segCity:  { fontSize: 8, color: GREY, width: 70 },
  segArrow: { fontSize: 10, color: GOLD, marginHorizontal: 8 },
  segTime:  { fontSize: 8, color: '#374151' },

  condGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: '8 12' },
  condBox:  { width: '30%', backgroundColor: LIGHT, borderRadius: 3, padding: 6 },
  condKey:  { fontSize: 7, color: GREY, marginBottom: 2 },
  condVal:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1f2937' },

  // Hotel
  hotelName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY },
  stars:     { fontSize: 10, color: GOLD },

  // Items table
  tblHead:  { flexDirection: 'row', backgroundColor: NAVY, padding: '5 10' },
  tblHCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE },
  tblRow:   { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', padding: '5 10' },
  tblCell:  { fontSize: 8, color: '#374151' },

  // Footer
  footer:    { position: 'absolute', bottom: 20, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: GREY },
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Segment {
  segmentOrder: number
  originCode: string; originCity?: string; departureAt: string
  destinationCode: string; destinationCity?: string; arrivalAt: string
  flightNumber?: string; durationMinutes?: number; stops: number
}
interface FlightOption {
  id: string; label?: string; isRecommended: boolean; sortOrder: number
  airline: string; airlineCode?: string; tripType: string; cabinClass: string
  isRefundable: boolean; changesAllowed: boolean; changeFee?: string
  seatIncluded: boolean; mealIncluded: boolean
  personalItem?: string; cabinBaggage?: string; checkedBaggage?: string
  sellingPriceMinor: number; currency: string; clientNote?: string
  segments: Segment[]
}
interface HotelOption {
  id: string; label?: string; isRecommended: boolean
  hotelName: string; starRating?: number; city?: string; country?: string
  description?: string; checkIn: string; checkOut: string; nights: number
  rooms: number; adults: number; children: number; roomType?: string; mealPlan?: string
  breakfastIncluded: boolean; isRefundable: boolean; amenities: string[]
  sellingPriceMinor: number; currency: string; clientNote?: string
}
interface QuoteItem {
  id: string; type: string; title: string
  sellingPriceMinor: number; currency: string; showPriceToClient: boolean
  clientNote?: string
}
export interface QuoteProposalPDFProps {
  reference: string
  title: string
  clientName: string
  clientEmail: string
  currency: string
  validUntil: string
  description?: string
  totalMinor: number
  depositMinor?: number
  depositPercentage?: number
  flightOptions: FlightOption[]
  hotelOptions: HotelOption[]
  items: QuoteItem[]
  staffName: string
  selectedFlightOptionId?: string
  selectedHotelOptionId?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$' }
function fmt(minor: number, currency: string) {
  const sym = SYM[currency.toUpperCase()] ?? currency + ' '
  return `${sym}${(minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(s: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(s))
}
function fmtTime(s: string) {
  return new Intl.DateTimeFormat('en-GB', { timeStyle: 'short' }).format(new Date(s))
}
function fmtDuration(mins?: number) {
  if (!mins) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}
function stars(n?: number) {
  if (!n) return ''
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
function cabinLabel(c: string) {
  return ({ ECONOMY: 'Economy', PREMIUM_ECONOMY: 'Prem. Economy', BUSINESS: 'Business', FIRST: 'First Class' })[c] ?? c
}

// ── PDF Component ─────────────────────────────────────────────────────────────

export function QuoteProposalPDF(props: QuoteProposalPDFProps) {
  const {
    reference, title, clientName, clientEmail, currency, validUntil,
    description, totalMinor, depositMinor, depositPercentage,
    flightOptions, hotelOptions, items, staffName,
    selectedFlightOptionId, selectedHotelOptionId,
  } = props

  // For PDFs: show selected option (if any), else show recommended, else all
  const showFlight = selectedFlightOptionId
    ? flightOptions.filter(f => f.id === selectedFlightOptionId)
    : flightOptions.some(f => f.isRecommended)
      ? flightOptions.filter(f => f.isRecommended)
      : flightOptions

  const showHotel = selectedHotelOptionId
    ? hotelOptions.filter(h => h.id === selectedHotelOptionId)
    : hotelOptions.some(h => h.isRecommended)
      ? hotelOptions.filter(h => h.isRecommended)
      : hotelOptions

  const visibleItems = items.filter(i => i.showPriceToClient)

  return (
    <Document title={`${reference} — ${title}`} author="Walz Travels">

      {/* Cover page */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={[s.coverRef, { marginBottom: 8 }]}>WALZ TRAVELS</Text>
          <Text style={s.coverTitle}>{title}</Text>
          <Text style={s.coverRef}>{reference}</Text>
          <View style={s.coverDivider} />
          <Text style={s.coverFor}>Prepared for</Text>
          <Text style={s.coverClient}>{clientName}</Text>
          <Text style={s.coverValid}>Valid until {fmtDate(validUntil)}</Text>

          <View style={{ marginTop: 32 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: GOLD }}>
              {fmt(totalMinor, currency)}
            </Text>
            <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 4 }}>Total Investment</Text>
          </View>

          <View style={s.coverFooter}>
            <Text style={s.coverFooterTxt}>Walz Travels · walztravels.com · bookings@walztravels.com</Text>
            <Text style={[s.coverFooterTxt, { marginTop: 4 }]}>Prepared by {staffName}</Text>
          </View>
        </View>
      </Page>

      {/* Proposal content */}
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={{ backgroundColor: NAVY, padding: '16 20', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 11 }}>Walz Travels</Text>
          <Text style={{ color: GOLD, fontSize: 9 }}>{reference}</Text>
        </View>

        {/* Client & intro */}
        <View style={s.content}>
          {description && (
            <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.5, marginBottom: 12 }}>{description}</Text>
          )}
          <View style={s.row}>
            <Text style={s.label}>Client</Text>
            <Text style={s.value}>{clientName} · {clientEmail}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Valid Until</Text>
            <Text style={s.value}>{fmtDate(validUntil)}</Text>
          </View>
        </View>

        {/* Flight Options */}
        {showFlight.map((fo) => (
          <View key={fo.id} wrap={false}>
            <Text style={s.secHeader}>Flight — {fo.label ?? cabinLabel(fo.cabinClass)}</Text>
            <View style={s.airlineBand}>
              <View>
                <Text style={s.airlineName}>{fo.airline}{fo.airlineCode ? ` (${fo.airlineCode})` : ''}</Text>
                <Text style={{ fontSize: 8, color: GREY }}>{cabinLabel(fo.cabinClass)} · {fo.tripType}</Text>
              </View>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: GOLD }}>{fmt(fo.sellingPriceMinor, fo.currency)}</Text>
            </View>

            {fo.segments.map((seg, si) => (
              <View key={si} style={s.segRow}>
                <Text style={s.segCode}>{seg.originCode}</Text>
                <Text style={s.segCity}>{seg.originCity ?? ''}</Text>
                <Text style={s.segTime}>{fmtTime(seg.departureAt)}</Text>
                <Text style={s.segArrow}> → </Text>
                <Text style={s.segCode}>{seg.destinationCode}</Text>
                <Text style={s.segCity}>{seg.destinationCity ?? ''}</Text>
                <Text style={s.segTime}>{fmtTime(seg.arrivalAt)}</Text>
                {seg.flightNumber && <Text style={{ fontSize: 7, color: GREY, marginLeft: 8 }}>{seg.flightNumber}</Text>}
                {seg.durationMinutes && <Text style={{ fontSize: 7, color: GREY, marginLeft: 4 }}>· {fmtDuration(seg.durationMinutes)}</Text>}
              </View>
            ))}

            <View style={s.condGrid}>
              <View style={s.condBox}><Text style={s.condKey}>Refundable</Text><Text style={s.condVal}>{fo.isRefundable ? 'Yes' : 'No'}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Changes</Text><Text style={s.condVal}>{fo.changesAllowed ? (fo.changeFee ?? 'Yes') : 'No'}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Seat</Text><Text style={s.condVal}>{fo.seatIncluded ? 'Included' : 'Not included'}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Meal</Text><Text style={s.condVal}>{fo.mealIncluded ? 'Included' : 'Not included'}</Text></View>
              {fo.cabinBaggage && <View style={s.condBox}><Text style={s.condKey}>Cabin bag</Text><Text style={s.condVal}>{fo.cabinBaggage}</Text></View>}
              {fo.checkedBaggage && <View style={s.condBox}><Text style={s.condKey}>Hold bag</Text><Text style={s.condVal}>{fo.checkedBaggage}</Text></View>}
            </View>
            {fo.clientNote && (
              <View style={{ padding: '6 12', backgroundColor: '#fffbeb' }}>
                <Text style={{ fontSize: 8, color: '#92400e' }}>Note: {fo.clientNote}</Text>
              </View>
            )}
          </View>
        ))}

        {/* Hotel Options */}
        {showHotel.map((ho) => (
          <View key={ho.id} wrap={false}>
            <Text style={s.secHeader}>Hotel — {ho.label ?? ho.hotelName}</Text>
            <View style={s.airlineBand}>
              <View>
                <Text style={s.hotelName}>{ho.hotelName}</Text>
                {ho.starRating && <Text style={s.stars}>{stars(ho.starRating)}</Text>}
                {(ho.city || ho.country) && (
                  <Text style={{ fontSize: 8, color: GREY }}>{[ho.city, ho.country].filter(Boolean).join(', ')}</Text>
                )}
              </View>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: GOLD }}>{fmt(ho.sellingPriceMinor, ho.currency)}</Text>
            </View>

            <View style={s.condGrid}>
              <View style={s.condBox}><Text style={s.condKey}>Check-in</Text><Text style={s.condVal}>{fmtDate(ho.checkIn)}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Check-out</Text><Text style={s.condVal}>{fmtDate(ho.checkOut)}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Nights</Text><Text style={s.condVal}>{ho.nights}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Rooms · Guests</Text><Text style={s.condVal}>{ho.rooms} room · {ho.adults} adults{ho.children ? ` + ${ho.children} ch` : ''}</Text></View>
              {ho.roomType && <View style={s.condBox}><Text style={s.condKey}>Room type</Text><Text style={s.condVal}>{ho.roomType}</Text></View>}
              <View style={s.condBox}><Text style={s.condKey}>Breakfast</Text><Text style={s.condVal}>{ho.breakfastIncluded ? 'Included' : 'Not included'}</Text></View>
              <View style={s.condBox}><Text style={s.condKey}>Refundable</Text><Text style={s.condVal}>{ho.isRefundable ? 'Yes' : 'No'}</Text></View>
              {ho.mealPlan && <View style={s.condBox}><Text style={s.condKey}>Meal plan</Text><Text style={s.condVal}>{ho.mealPlan}</Text></View>}
            </View>

            {ho.clientNote && (
              <View style={{ padding: '6 12', backgroundColor: '#fffbeb' }}>
                <Text style={{ fontSize: 8, color: '#92400e' }}>Note: {ho.clientNote}</Text>
              </View>
            )}
          </View>
        ))}

        {/* Additional items */}
        {visibleItems.length > 0 && (
          <View wrap={false}>
            <Text style={s.secHeader}>Additional Services</Text>
            <View style={s.tblHead}>
              <Text style={[s.tblHCell, { flex: 1 }]}>Service</Text>
              <Text style={[s.tblHCell, { width: 60 }]}>Type</Text>
              <Text style={[s.tblHCell, { width: 70, textAlign: 'right' }]}>Amount</Text>
            </View>
            {visibleItems.map((item) => (
              <View key={item.id} style={s.tblRow}>
                <Text style={[s.tblCell, { flex: 1 }]}>{item.title}</Text>
                <Text style={[s.tblCell, { width: 60, color: GREY }]}>{item.type}</Text>
                <Text style={[s.tblCell, { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {item.showPriceToClient ? fmt(item.sellingPriceMinor, item.currency) : 'Incl.'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Price summary */}
        <View style={{ padding: '12 16', backgroundColor: LIGHT, margin: '16 0 0' }} wrap={false}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 8 }}>Price Summary</Text>
          {showFlight[0] && (
            <View style={s.priceLine}>
              <Text style={s.priceLabel}>Flights</Text>
              <Text style={s.priceVal}>{fmt(showFlight[0].sellingPriceMinor, showFlight[0].currency)}</Text>
            </View>
          )}
          {showHotel[0] && (
            <View style={s.priceLine}>
              <Text style={s.priceLabel}>Hotel</Text>
              <Text style={s.priceVal}>{fmt(showHotel[0].sellingPriceMinor, showHotel[0].currency)}</Text>
            </View>
          )}
          {visibleItems.filter(i => i.showPriceToClient).map((item) => (
            <View key={item.id} style={s.priceLine}>
              <Text style={s.priceLabel}>{item.title}</Text>
              <Text style={s.priceVal}>{fmt(item.sellingPriceMinor, item.currency)}</Text>
            </View>
          ))}
          {depositMinor && (
            <View style={s.priceLine}>
              <Text style={s.priceLabel}>Deposit required{depositPercentage ? ` (${depositPercentage}%)` : ''}</Text>
              <Text style={s.priceVal}>{fmt(depositMinor, currency)}</Text>
            </View>
          )}
          <View style={s.totalLine}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalVal}>{fmt(totalMinor, currency)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Walz Travels · walztravels.com</Text>
          <Text style={s.footerTxt}>{reference}</Text>
        </View>
      </Page>
    </Document>
  )
}
