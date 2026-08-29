import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const NAVY  = '#0B1F3A'
const GOLD  = '#C9A84C'
const GREY  = '#6b7280'
const LIGHT = '#f8f7f4'
const WHITE = '#ffffff'

const s = StyleSheet.create({
  page: { backgroundColor: WHITE, fontFamily: 'Helvetica', fontSize: 9, color: '#1f2937' },

  // ── Cover page ──────────────────────────────────────────────────────────────
  cover:         { backgroundColor: NAVY, minHeight: '100%', padding: 60, flexDirection: 'column', justifyContent: 'flex-end' },
  coverEyebrow:  { fontSize: 8, color: GOLD, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20 },
  coverTitle:    { fontSize: 30, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 10, lineHeight: 1.2 },
  coverDivider:  { width: 48, height: 2, backgroundColor: GOLD, marginBottom: 20 },
  coverSub:      { fontSize: 11, color: '#94a3b8', marginBottom: 6 },
  coverRef:      { fontSize: 8, color: '#64748b', letterSpacing: 1, marginBottom: 50 },
  coverFor:      { fontSize: 8, color: '#94a3b8', marginBottom: 4 },
  coverClient:   { fontSize: 16, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 2 },
  coverFooter:   { borderTopWidth: 1, borderTopColor: '#1e3a5f', paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  coverFooterL:  { fontSize: 8, color: WHITE, fontFamily: 'Helvetica-Bold' },
  coverFooterR:  { fontSize: 7, color: '#64748b' },

  // ── Content pages ───────────────────────────────────────────────────────────
  content:   { padding: '30 40 60 40' },
  footer:    { position: 'absolute', bottom: 18, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: GREY },

  // ── Section headers ─────────────────────────────────────────────────────────
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GOLD, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 10 },
  sectionDivider: { height: 1, backgroundColor: '#e5e7eb', marginBottom: 14 },

  // ── Trip at a glance ────────────────────────────────────────────────────────
  glanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  glanceBox: { backgroundColor: LIGHT, borderRadius: 4, padding: '8 12', minWidth: 90, flex: 1 },
  glanceKey: { fontSize: 7, color: GREY, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  glanceVal: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },

  // ── Overview ────────────────────────────────────────────────────────────────
  overviewText: { fontSize: 9.5, color: '#374151', lineHeight: 1.6, marginBottom: 14 },

  // ── Flight cards ────────────────────────────────────────────────────────────
  flightCard:  { backgroundColor: LIGHT, borderRadius: 5, marginBottom: 8, overflow: 'hidden' },
  flightHead:  { backgroundColor: NAVY, flexDirection: 'row', justifyContent: 'space-between', padding: '7 12', alignItems: 'center' },
  flightAirline: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },
  flightClass: { fontSize: 8, color: '#94a3b8' },
  flightBody:  { padding: '10 12' },
  flightRoute: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  flightCode:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY, width: 45 },
  flightCity:  { fontSize: 7.5, color: GREY, marginTop: 2 },
  flightArrow: { fontSize: 14, color: GOLD, marginHorizontal: 6 },
  flightMeta:  { flexDirection: 'row', gap: 16 },
  flightMetaItem: { flexDirection: 'column' },
  flightMetaKey:  { fontSize: 7, color: GREY, marginBottom: 2 },
  flightMetaVal:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#1f2937' },
  flightPrice: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GOLD, textAlign: 'right' },

  // ── Hotel cards ─────────────────────────────────────────────────────────────
  hotelCard: { backgroundColor: LIGHT, borderRadius: 5, marginBottom: 8, padding: '12 14' },
  hotelName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 3 },
  hotelLoc:  { fontSize: 8.5, color: GREY, marginBottom: 8 },
  hotelRow:  { flexDirection: 'row', gap: 20, flexWrap: 'wrap', marginBottom: 4 },
  hotelKey:  { fontSize: 7.5, color: GREY, marginBottom: 2 },
  hotelVal:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#1f2937' },
  hotelPrice: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GOLD },

  // ── Day by day ──────────────────────────────────────────────────────────────
  dayCard:    { marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dayBadge:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dayNum:     { backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },
  dayNumTxt:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE },
  dayDate:    { fontSize: 8, color: GREY },
  dayTitle:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 3 },
  dayCity:    { fontSize: 8, color: GREY, marginBottom: 6 },
  dayDesc:    { fontSize: 8.5, color: '#374151', lineHeight: 1.5, marginBottom: 6 },
  dayActWrap: { marginLeft: 8 },
  dayActItem: { fontSize: 8.5, color: '#374151', marginBottom: 3 },

  // ── Inclusions ──────────────────────────────────────────────────────────────
  incRow: { flexDirection: 'row', gap: 4, marginBottom: 3, alignItems: 'flex-start' },
  incBullet: { width: 6, height: 6, backgroundColor: GOLD, borderRadius: 3, marginTop: 1.5, flexShrink: 0 },
  incText: { fontSize: 8.5, color: '#374151', flex: 1 },
  exclBullet: { width: 6, height: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 3, marginTop: 1.5, flexShrink: 0 },

  // ── Price table ─────────────────────────────────────────────────────────────
  priceLine:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  priceLabel: { fontSize: 9, color: '#374151' },
  priceVal:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  totalLine:  { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 2, borderTopColor: NAVY, marginTop: 4 },
  totalLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY },
  totalVal:   { fontSize: 14, fontFamily: 'Helvetica-Bold', color: GOLD },

  // ── Contact strip ───────────────────────────────────────────────────────────
  contactStrip: { backgroundColor: NAVY, borderRadius: 5, padding: '14 18', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  contactLabel: { fontSize: 8, color: '#94a3b8', marginBottom: 3 },
  contactVal:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: WHITE },
  contactCTA:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GOLD },

  // ── Acceptance section ──────────────────────────────────────────────────────
  acceptBanner:  { backgroundColor: '#f0fdf4', borderRadius: 5, padding: '12 16', marginTop: 16, borderWidth: 1, borderColor: '#86efac' },
  acceptTitle:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#15803d', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  acceptRow:     { flexDirection: 'row', marginBottom: 4 },
  acceptKey:     { fontSize: 8, color: '#6b7280', width: 90 },
  acceptVal:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1f2937', flex: 1 },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦' }
function sym(currency: string) { return SYM[currency?.toUpperCase()] ?? (currency + ' ') }
function fmtMoney(amount: number | null | undefined, currency: string) {
  if (amount == null) return ''
  return `${sym(currency)}${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtDate(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ItineraryPDFProps {
  referenceNumber: string
  title: string
  clientName?: string
  destination?: string
  startDate?: Date | null
  endDate?: Date | null
  duration?: number | null
  numberOfTravellers: number
  tripType?: string | null
  currency: string
  overview?: string | null
  totalPrice?: number | null
  deposit?: number | null
  coverImage?: string | null

  days: Array<{
    day: number; title: string; destination?: string
    description?: string; activities?: string[]
    meals?: string; accommodation?: string; clientNotes?: string
  }>
  flights: Array<{
    from?: string; to?: string; airline?: string; flightNumber?: string
    date?: string; time?: string; departureTime?: string; arrivalTime?: string
    class?: string; pnr?: string; cost?: number; stops?: number
  }>
  hotels: Array<{
    name?: string; location?: string; checkIn?: string; checkOut?: string
    roomType?: string; nights?: number; cost?: number; mealPlan?: string
  }>
  transfers?: Array<{
    type?: string; from?: string; to?: string; date?: string; vehicle?: string; cost?: number
  }>
  tours?: Array<{
    name?: string; location?: string; date?: string; duration?: string; provider?: string; cost?: number
  }>
  inclusions?: string[]
  exclusions?: string[]
  priceBreakdown?: Array<{ item: string; description?: string; cost: number }>

  // Contact (from BUSINESS config)
  contactWhatsApp?: string
  contactEmail?: string
  contactWebsite?: string

  // GA6: acceptance details — only present for approved itineraries
  acceptedBy?: string
  acceptedAt?: string
  acceptedTotal?: number | null
}

// ── PDF Component ─────────────────────────────────────────────────────────────

export function ItineraryPDF(p: ItineraryPDFProps) {
  const hasDays      = p.days.length > 0
  const hasFlights   = p.flights.length > 0
  const hasHotels    = p.hotels.length > 0
  const hasTransfers = (p.transfers ?? []).length > 0
  const hasTours     = (p.tours ?? []).length > 0
  const hasPrice     = p.priceBreakdown && p.priceBreakdown.length > 0

  const pageFooter = (
    <View style={s.footer} fixed>
      <Text style={s.footerTxt}>Walz Travels · {p.referenceNumber}</Text>
      <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )

  return (
    <Document title={p.title} author="Walz Travels">

      {/* ── Cover page ──────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.cover}>
        <View style={{ flex: 1 }} />
        <Text style={s.coverEyebrow}>Travel Itinerary</Text>
        <Text style={s.coverTitle}>{p.title}</Text>
        <View style={s.coverDivider} />
        {p.destination && <Text style={s.coverSub}>📍  {p.destination}</Text>}
        {(p.startDate || p.endDate) && (
          <Text style={s.coverSub}>
            {p.startDate ? fmtDate(p.startDate) : ''}
            {p.startDate && p.endDate ? '  –  ' : ''}
            {p.endDate ? fmtDate(p.endDate) : ''}
          </Text>
        )}
        <Text style={s.coverRef}>{p.referenceNumber}</Text>
        {p.clientName && (
          <>
            <Text style={s.coverFor}>Prepared exclusively for</Text>
            <Text style={s.coverClient}>{p.clientName}</Text>
          </>
        )}
        <View style={{ height: 40 }} />
        <View style={s.coverFooter}>
          <Text style={s.coverFooterL}>WALZ TRAVELS</Text>
          <Text style={s.coverFooterR}>walztravels.com</Text>
        </View>
      </Page>

      {/* ── Trip summary + overview ──────────────────────────────────────────── */}
      <Page size="A4" style={s.content}>
        <View>
          <Text style={s.sectionLabel}>Your Journey</Text>
          <Text style={s.sectionTitle}>{p.title}</Text>
          <View style={s.sectionDivider} />

          {/* Glance cards */}
          <View style={s.glanceRow}>
            {p.destination && (
              <View style={s.glanceBox}>
                <Text style={s.glanceKey}>Destination</Text>
                <Text style={s.glanceVal}>{p.destination}</Text>
              </View>
            )}
            {p.startDate && (
              <View style={s.glanceBox}>
                <Text style={s.glanceKey}>Departure</Text>
                <Text style={s.glanceVal}>{fmtDate(p.startDate)}</Text>
              </View>
            )}
            {p.endDate && (
              <View style={s.glanceBox}>
                <Text style={s.glanceKey}>Return</Text>
                <Text style={s.glanceVal}>{fmtDate(p.endDate)}</Text>
              </View>
            )}
            {p.duration && (
              <View style={s.glanceBox}>
                <Text style={s.glanceKey}>Duration</Text>
                <Text style={s.glanceVal}>{p.duration} nights</Text>
              </View>
            )}
            {p.numberOfTravellers > 0 && (
              <View style={s.glanceBox}>
                <Text style={s.glanceKey}>Travellers</Text>
                <Text style={s.glanceVal}>{p.numberOfTravellers}{p.tripType ? ` · ${p.tripType}` : ''}</Text>
              </View>
            )}
          </View>

          {p.overview && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 14 }]}>Overview</Text>
              <View style={s.sectionDivider} />
              <Text style={s.overviewText}>{p.overview}</Text>
            </>
          )}

          {/* Inclusions / exclusions */}
          {(p.inclusions ?? []).length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 14 }]}>What's Included</Text>
              <View style={s.sectionDivider} />
              {(p.inclusions ?? []).map((inc, i) => (
                <View key={i} style={s.incRow}>
                  <View style={s.incBullet} />
                  <Text style={s.incText}>{inc}</Text>
                </View>
              ))}
            </>
          )}
          {(p.exclusions ?? []).length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 14 }]}>Not Included</Text>
              <View style={s.sectionDivider} />
              {(p.exclusions ?? []).map((exc, i) => (
                <View key={i} style={s.incRow}>
                  <View style={s.exclBullet} />
                  <Text style={s.incText}>{exc}</Text>
                </View>
              ))}
            </>
          )}
        </View>
        {pageFooter}
      </Page>

      {/* ── Flights ─────────────────────────────────────────────────────────── */}
      {hasFlights && (
        <Page size="A4" style={s.content}>
          <Text style={s.sectionLabel}>Getting There</Text>
          <Text style={s.sectionTitle}>Flights</Text>
          <View style={s.sectionDivider} />
          {p.flights.map((f, i) => (
            <View key={i} style={s.flightCard} wrap={false}>
              <View style={s.flightHead}>
                <Text style={s.flightAirline}>{f.airline || 'Flight'}{f.flightNumber ? `  ·  ${f.flightNumber}` : ''}</Text>
                <Text style={s.flightClass}>{f.class || ''}</Text>
              </View>
              <View style={s.flightBody}>
                <View style={s.flightRoute}>
                  <View>
                    <Text style={s.flightCode}>{f.from || '—'}</Text>
                    {f.time && <Text style={s.flightCity}>{f.departureTime || f.time}</Text>}
                  </View>
                  <Text style={s.flightArrow}> → </Text>
                  <View>
                    <Text style={s.flightCode}>{f.to || '—'}</Text>
                    {f.arrivalTime && <Text style={s.flightCity}>{f.arrivalTime}</Text>}
                  </View>
                </View>
                <View style={s.flightMeta}>
                  {f.date && (
                    <View style={s.flightMetaItem}>
                      <Text style={s.flightMetaKey}>Date</Text>
                      <Text style={s.flightMetaVal}>{f.date}</Text>
                    </View>
                  )}
                  {f.stops !== undefined && (
                    <View style={s.flightMetaItem}>
                      <Text style={s.flightMetaKey}>Stops</Text>
                      <Text style={s.flightMetaVal}>{f.stops === 0 ? 'Direct' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`}</Text>
                    </View>
                  )}
                  {f.pnr && (
                    <View style={s.flightMetaItem}>
                      <Text style={s.flightMetaKey}>PNR</Text>
                      <Text style={s.flightMetaVal}>{f.pnr}</Text>
                    </View>
                  )}
                  {f.cost != null && (
                    <View style={[s.flightMetaItem, { marginLeft: 'auto' }]}>
                      <Text style={s.flightPrice}>{fmtMoney(f.cost, p.currency)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
          {pageFooter}
        </Page>
      )}

      {/* ── Hotels ──────────────────────────────────────────────────────────── */}
      {hasHotels && (
        <Page size="A4" style={s.content}>
          <Text style={s.sectionLabel}>Where You'll Stay</Text>
          <Text style={s.sectionTitle}>Accommodation</Text>
          <View style={s.sectionDivider} />
          {p.hotels.map((h, i) => (
            <View key={i} style={s.hotelCard} wrap={false}>
              <Text style={s.hotelName}>{h.name || 'Hotel'}</Text>
              {h.location && <Text style={s.hotelLoc}>{h.location}</Text>}
              <View style={s.hotelRow}>
                {h.checkIn && (
                  <View>
                    <Text style={s.hotelKey}>Check-in</Text>
                    <Text style={s.hotelVal}>{h.checkIn}</Text>
                  </View>
                )}
                {h.checkOut && (
                  <View>
                    <Text style={s.hotelKey}>Check-out</Text>
                    <Text style={s.hotelVal}>{h.checkOut}</Text>
                  </View>
                )}
                {h.nights != null && (
                  <View>
                    <Text style={s.hotelKey}>Nights</Text>
                    <Text style={s.hotelVal}>{h.nights}</Text>
                  </View>
                )}
                {h.roomType && (
                  <View>
                    <Text style={s.hotelKey}>Room</Text>
                    <Text style={s.hotelVal}>{h.roomType}</Text>
                  </View>
                )}
                {h.mealPlan && (
                  <View>
                    <Text style={s.hotelKey}>Meals</Text>
                    <Text style={s.hotelVal}>{h.mealPlan}</Text>
                  </View>
                )}
              </View>
              {h.cost != null && <Text style={s.hotelPrice}>{fmtMoney(h.cost, p.currency)}</Text>}
            </View>
          ))}
          {pageFooter}
        </Page>
      )}

      {/* ── Transfers + Tours ────────────────────────────────────────────────── */}
      {(hasTransfers || hasTours) && (
        <Page size="A4" style={s.content}>
          {hasTransfers && (
            <>
              <Text style={s.sectionLabel}>Getting Around</Text>
              <Text style={s.sectionTitle}>Transfers</Text>
              <View style={s.sectionDivider} />
              {(p.transfers ?? []).map((t, i) => (
                <View key={i} style={[s.hotelCard, { marginBottom: 8 }]} wrap={false}>
                  <Text style={s.hotelName}>{t.type || 'Transfer'}</Text>
                  <Text style={s.hotelLoc}>{t.from}{t.from && t.to ? ' → ' : ''}{t.to}</Text>
                  <View style={s.hotelRow}>
                    {t.date && <View><Text style={s.hotelKey}>Date</Text><Text style={s.hotelVal}>{t.date}</Text></View>}
                    {t.vehicle && <View><Text style={s.hotelKey}>Vehicle</Text><Text style={s.hotelVal}>{t.vehicle}</Text></View>}
                  </View>
                  {t.cost != null && <Text style={s.hotelPrice}>{fmtMoney(t.cost, p.currency)}</Text>}
                </View>
              ))}
            </>
          )}
          {hasTours && (
            <>
              <Text style={[s.sectionLabel, { marginTop: hasTransfers ? 20 : 0 }]}>Experiences</Text>
              <Text style={s.sectionTitle}>Tours & Activities</Text>
              <View style={s.sectionDivider} />
              {(p.tours ?? []).map((t, i) => (
                <View key={i} style={[s.hotelCard, { marginBottom: 8 }]} wrap={false}>
                  <Text style={s.hotelName}>{t.name || 'Activity'}</Text>
                  {t.location && <Text style={s.hotelLoc}>{t.location}</Text>}
                  <View style={s.hotelRow}>
                    {t.date && <View><Text style={s.hotelKey}>Date</Text><Text style={s.hotelVal}>{t.date}</Text></View>}
                    {t.duration && <View><Text style={s.hotelKey}>Duration</Text><Text style={s.hotelVal}>{t.duration}</Text></View>}
                    {t.provider && <View><Text style={s.hotelKey}>Provider</Text><Text style={s.hotelVal}>{t.provider}</Text></View>}
                  </View>
                  {t.cost != null && <Text style={s.hotelPrice}>{fmtMoney(t.cost, p.currency)}</Text>}
                </View>
              ))}
            </>
          )}
          {pageFooter}
        </Page>
      )}

      {/* ── Day by day ──────────────────────────────────────────────────────── */}
      {hasDays && (
        <Page size="A4" style={s.content}>
          <Text style={s.sectionLabel}>Your Journey Day by Day</Text>
          <Text style={s.sectionTitle}>Itinerary</Text>
          <View style={s.sectionDivider} />
          {p.days.map((d, i) => (
            <View key={i} style={s.dayCard} wrap={false}>
              <View style={s.dayBadge}>
                <View style={s.dayNum}><Text style={s.dayNumTxt}>Day {d.day}</Text></View>
                {d.destination && <Text style={s.dayDate}>{d.destination}</Text>}
              </View>
              <Text style={s.dayTitle}>{d.title}</Text>
              {d.description && <Text style={s.dayDesc}>{d.description}</Text>}
              {(d.activities ?? []).length > 0 && (
                <View style={s.dayActWrap}>
                  {(d.activities ?? []).map((a, j) => (
                    <Text key={j} style={s.dayActItem}>· {a}</Text>
                  ))}
                </View>
              )}
              {(d.meals || d.accommodation) && (
                <View style={{ flexDirection: 'row', gap: 20, marginTop: 6 }}>
                  {d.meals && (
                    <View><Text style={s.hotelKey}>Meals</Text><Text style={s.hotelVal}>{d.meals}</Text></View>
                  )}
                  {d.accommodation && (
                    <View><Text style={s.hotelKey}>Accommodation</Text><Text style={s.hotelVal}>{d.accommodation}</Text></View>
                  )}
                </View>
              )}
              {d.clientNotes && (
                <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 6, fontStyle: 'italic' }}>{d.clientNotes}</Text>
              )}
            </View>
          ))}
          {pageFooter}
        </Page>
      )}

      {/* ── Price summary ────────────────────────────────────────────────────── */}
      {(hasPrice || p.totalPrice != null) && (
        <Page size="A4" style={s.content}>
          <Text style={s.sectionLabel}>Your Trip Investment</Text>
          <Text style={s.sectionTitle}>Pricing Summary</Text>
          <View style={s.sectionDivider} />

          {hasPrice && (p.priceBreakdown ?? []).map((row, i) => (
            <View key={i} style={s.priceLine}>
              <Text style={s.priceLabel}>{row.item}{row.description ? ` · ${row.description}` : ''}</Text>
              <Text style={s.priceVal}>{fmtMoney(row.cost, p.currency)}</Text>
            </View>
          ))}

          {p.totalPrice != null && (
            <View style={s.totalLine}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalVal}>{fmtMoney(p.totalPrice, p.currency)}</Text>
            </View>
          )}

          {p.deposit != null && (
            <View style={[s.priceLine, { marginTop: 10 }]}>
              <Text style={s.priceLabel}>Deposit due</Text>
              <Text style={s.priceVal}>{fmtMoney(p.deposit, p.currency)}</Text>
            </View>
          )}

          {/* Acceptance confirmation — only present for approved itineraries */}
          {p.acceptedBy && (
            <View style={s.acceptBanner}>
              <Text style={s.acceptTitle}>Proposal Accepted</Text>
              <View style={s.acceptRow}>
                <Text style={s.acceptKey}>Accepted by</Text>
                <Text style={s.acceptVal}>{p.acceptedBy}</Text>
              </View>
              {p.acceptedAt && (
                <View style={s.acceptRow}>
                  <Text style={s.acceptKey}>Accepted on</Text>
                  <Text style={s.acceptVal}>{fmtDate(p.acceptedAt)}</Text>
                </View>
              )}
              {p.acceptedTotal != null && (
                <View style={s.acceptRow}>
                  <Text style={s.acceptKey}>Accepted total</Text>
                  <Text style={[s.acceptVal, { color: '#15803d', fontFamily: 'Helvetica-Bold' }]}>{fmtMoney(p.acceptedTotal, p.currency)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Contact strip */}
          <View style={s.contactStrip}>
            <View>
              {p.contactWhatsApp && (
                <>
                  <Text style={s.contactLabel}>WhatsApp</Text>
                  <Text style={s.contactVal}>{p.contactWhatsApp}</Text>
                </>
              )}
            </View>
            <View>
              {p.contactEmail && (
                <>
                  <Text style={s.contactLabel}>Email</Text>
                  <Text style={s.contactVal}>{p.contactEmail}</Text>
                </>
              )}
            </View>
            <View>
              <Text style={s.contactLabel}>Website</Text>
              <Text style={s.contactCTA}>{p.contactWebsite || 'walztravels.com'}</Text>
            </View>
          </View>
          {pageFooter}
        </Page>
      )}

    </Document>
  )
}
