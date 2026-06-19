import React from 'react'
import type { FlightTicketEmailProps, FlightLeg } from '@/types/flight-ticket'

// Helper to format date like "Mon 15 Jan 2025"
function fmtDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    })
  } catch { return iso }
}

// Sub-component: renders one flight leg as an email-safe table card
function LegCard({ leg, isLast }: { leg: FlightLeg; isLast: boolean }) {
  return (
    <div style={{ marginBottom: isLast ? 0 : 12 }}>
      {/* Main 3-column table: departure | center info | arrival */}
      <table width="100%" cellPadding={0} cellSpacing={0} border={0} style={{
        background: '#ffffff',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        borderCollapse: 'separate',
        padding: 20,
      }}>
        <tbody>
          <tr>
            {/* LEFT: departure */}
            <td width="33%" style={{ verticalAlign: 'top', paddingRight: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0B1F3A', lineHeight: 1, fontFamily: 'Arial, sans-serif' }}>{leg.departureTime}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3A', marginTop: 4, fontFamily: 'Arial, sans-serif' }}>{leg.departureCode}</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>{leg.departureCity}</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>{leg.departureAirport}</div>
              <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'Arial, sans-serif' }}>{leg.departureCountry}</div>
              {leg.departureTerminal && (
                <div style={{ fontSize: 11, color: '#C9A84C', marginTop: 4, fontWeight: 600, fontFamily: 'Arial, sans-serif' }}>Terminal {leg.departureTerminal}</div>
              )}
            </td>

            {/* CENTER: duration / flight info */}
            <td width="34%" style={{ verticalAlign: 'middle', textAlign: 'center', padding: '0 12px' }}>
              <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'Arial, sans-serif' }}>{leg.duration}</div>
              <div style={{ borderTop: '1px solid #D1D5DB', margin: '8px 0' }} />
              <div style={{ fontSize: 20, color: '#0B1F3A', fontFamily: 'Arial, sans-serif' }}>✈</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A', marginTop: 6, fontFamily: 'Arial, sans-serif' }}>{leg.flightNumber}</div>
              {leg.aircraft && <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'Arial, sans-serif' }}>{leg.aircraft}</div>}
              {leg.operatedBy && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>Operated by {leg.operatedBy}</div>}
            </td>

            {/* RIGHT: arrival */}
            <td width="33%" style={{ verticalAlign: 'top', textAlign: 'right', paddingLeft: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0B1F3A', lineHeight: 1, fontFamily: 'Arial, sans-serif' }}>
                {leg.arrivalTime}
                {leg.arrivalNextDay && (
                  <sup style={{ fontSize: 11, color: '#C9A84C', fontWeight: 600, marginLeft: 3 }}>+1</sup>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3A', marginTop: 4, fontFamily: 'Arial, sans-serif' }}>{leg.arrivalCode}</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>{leg.arrivalCity}</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>{leg.arrivalAirport}</div>
              <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'Arial, sans-serif' }}>{leg.arrivalCountry}</div>
              {leg.arrivalTerminal && (
                <div style={{ fontSize: 11, color: '#C9A84C', marginTop: 4, fontWeight: 600, fontFamily: 'Arial, sans-serif' }}>Terminal {leg.arrivalTerminal}</div>
              )}
            </td>
          </tr>

          {/* Bottom row: pills */}
          <tr>
            <td colSpan={3} style={{ paddingTop: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-block', background: '#F3F4F6', borderRadius: 20, padding: '4px 10px', fontSize: 11, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                  {leg.cabinClass}
                </span>
                <span style={{ display: 'inline-block', background: '#F3F4F6', borderRadius: 20, padding: '4px 10px', fontSize: 11, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                  🧳 {leg.baggage}
                </span>
                {leg.seat && (
                  <span style={{ display: 'inline-block', background: '#F3F4F6', borderRadius: 20, padding: '4px 10px', fontSize: 11, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                    Seat {leg.seat}
                  </span>
                )}
                {leg.mealPreference && (
                  <span style={{ display: 'inline-block', background: '#F3F4F6', borderRadius: 20, padding: '4px 10px', fontSize: 11, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                    🍽 {leg.mealPreference}
                  </span>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Connection banner — only if connectionTime and not last leg */}
      {!isLast && leg.connectionTime && (
        <div style={{
          background: '#C9A84C',
          borderRadius: 6,
          padding: '8px 16px',
          margin: '6px 0',
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: '#0B1F3A',
          fontFamily: 'Arial, sans-serif',
        }}>
          ⏱ Connection: {leg.connectionTime} in {leg.arrivalCity}
        </div>
      )}
    </div>
  )
}

// Sub-component: renders a section of flights (outbound or inbound)
function FlightSection({
  legs,
  label,
}: {
  legs: FlightLeg[]
  label: string
}) {
  if (!legs.length) return null
  const first = legs[0]
  const last  = legs[legs.length - 1]
  return (
    <div style={{ marginBottom: 0 }}>
      {/* Section header */}
      <div style={{
        background: '#0B1F3A',
        padding: '16px 32px',
        borderRadius: '8px 8px 0 0',
      }}>
        <div style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>{label}</div>
        <div style={{ fontSize: 16, color: '#ffffff', fontWeight: 700, marginTop: 4, fontFamily: 'Arial, sans-serif' }}>
          {first.departureCity} → {last.arrivalCity}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>
          {fmtDate(first.departureDate)}
        </div>
      </div>
      {/* Leg cards */}
      <div style={{ background: '#F9FAFB', padding: '16px 32px', borderRadius: '0 0 8px 8px', border: '1px solid #E5E7EB', borderTop: 'none' }}>
        {legs.map((leg, i) => (
          <LegCard key={i} leg={leg} isLast={i === legs.length - 1} />
        ))}
      </div>
    </div>
  )
}

export function FlightTicketEmail({
  reference, pnr, issueDate, issuedBy,
  title, firstName, lastName, email, phone,
  outbound, inbound, tripType,
  passengers, pricing, agentMessage,
}: FlightTicketEmailProps) {

  const fullName = [title, firstName, lastName].filter(Boolean).join(' ')

  return (
    <html>
      <body style={{ margin: 0, padding: 0, background: '#F0F2F5', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <table width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ background: '#F0F2F5' }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '32px 16px' }}>
                <table width="650" cellPadding={0} cellSpacing={0} border={0} style={{ maxWidth: 650, width: '100%' }}>
                  <tbody>

                    {/* ── BLOCK 1: HEADER ──────────────────────────────────── */}
                    <tr>
                      <td style={{ background: '#0B1F3A', padding: '24px 32px', borderRadius: '12px 12px 0 0' }}>
                        <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
                          <tbody>
                            <tr>
                              <td>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', letterSpacing: -0.5, fontFamily: 'Arial, sans-serif' }}>WALZ TRAVELS</div>
                                <div style={{ fontSize: 9, color: '#C9A84C', letterSpacing: 3, textTransform: 'uppercase', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>YOUR JOURNEY. OUR EXPERTISE.</div>
                              </td>
                              <td align="right">
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Arial, sans-serif' }}>walztravels.com</div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    {/* Gold bar */}
                    <tr>
                      <td style={{ height: 3, background: '#C9A84C' }} />
                    </tr>

                    {/* ── BLOCK 2: CONFIRMATION HERO ────────────────────────── */}
                    <tr>
                      <td style={{ background: '#ffffff', padding: '40px 32px 32px' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#0B1F3A', marginBottom: 24, fontFamily: 'Arial, sans-serif' }}>
                          ✈ Flight Booking Confirmation
                        </div>

                        {/* Reference pills */}
                        <table width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ marginBottom: 28 }}>
                          <tbody>
                            <tr>
                              <td width="48%" style={{ paddingRight: 8 }}>
                                <div style={{ background: '#F7F4EF', border: '1px solid #E8D98B', borderRadius: 10, padding: '14px 18px' }}>
                                  <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: 'Arial, sans-serif' }}>Booking Reference (PNR)</div>
                                  <div style={{ fontSize: 20, fontWeight: 800, color: '#C9A84C', letterSpacing: 2, fontFamily: 'Arial, sans-serif' }}>{pnr || reference}</div>
                                </div>
                              </td>
                              <td width="4%" />
                              <td width="48%">
                                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 18px' }}>
                                  <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: 'Arial, sans-serif' }}>Booking Status</div>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: '#059669', fontFamily: 'Arial, sans-serif' }}>✅ Confirmed</div>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div style={{ fontSize: 16, color: '#0B1F3A', marginBottom: 12, fontFamily: 'Arial, sans-serif' }}>
                          Dear {fullName},
                        </div>
                        <div style={{ fontSize: 14, color: '#555555', lineHeight: 1.6, marginBottom: 20, fontFamily: 'Arial, sans-serif' }}>
                          Your flight booking has been confirmed by Walz Travels. Please keep this document with you throughout your journey as you may be required to present it at check-in and immigration.
                        </div>

                        {/* Meta info */}
                        <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
                          <tbody>
                            <tr>
                              <td style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'Arial, sans-serif', paddingRight: 24 }}>
                                <strong style={{ color: '#374151' }}>Issued:</strong> {issueDate}
                              </td>
                              <td style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'Arial, sans-serif', paddingRight: 24 }}>
                                <strong style={{ color: '#374151' }}>Ref:</strong> {reference}
                              </td>
                              {issuedBy && (
                                <td style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'Arial, sans-serif' }}>
                                  <strong style={{ color: '#374151' }}>Agent:</strong> {issuedBy}
                                </td>
                              )}
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* ── BLOCK 3: QUICK ACTIONS ────────────────────────────── */}
                    <tr>
                      <td style={{ background: '#F8F9FA', padding: '20px 32px', borderTop: '1px solid #E5E7EB' }}>
                        <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
                          <tbody>
                            <tr>
                              {[
                                { icon: '📋', label: 'Manage', sub: 'Booking', href: 'https://www.walztravels.com/portal/dashboard' },
                                { icon: '📅', label: 'Add to', sub: 'Calendar', href: `https://www.walztravels.com/api/tickets/calendar?ref=${reference}` },
                                { icon: '💬', label: 'WhatsApp', sub: 'Support', href: 'https://wa.me/447398753797' },
                                { icon: '🌐', label: 'View', sub: 'Online', href: 'https://www.walztravels.com' },
                              ].map(({ icon, label, sub, href }) => (
                                <td key={label} align="center" style={{ padding: '0 6px' }}>
                                  <a href={href} style={{ display: 'block', textDecoration: 'none' }}>
                                    <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0B1F3A', fontFamily: 'Arial, sans-serif' }}>{label}</div>
                                    <div style={{ fontSize: 10, color: '#6B7280', fontFamily: 'Arial, sans-serif' }}>{sub}</div>
                                    <div style={{ marginTop: 8, background: '#0B1F3A', color: '#C9A84C', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, display: 'inline-block', fontFamily: 'Arial, sans-serif' }}>
                                      {label}
                                    </div>
                                  </a>
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* ── BLOCK 3B: FLIGHT TRACKER ─────────────────────────── */}
                    {outbound.length > 0 && (
                      <tr>
                        <td style={{ background: '#EFF6FF', padding: '16px 32px', borderTop: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 12, fontFamily: 'Arial, sans-serif', letterSpacing: 1 }}>
                            ✈ LIVE FLIGHT TRACKER
                          </div>
                          {[...outbound, ...inbound].map((leg, i) => {
                            const fn = (leg.flightNumber ?? '').replace(/\s/g, '')
                            const faUrl  = `https://www.flightaware.com/live/flight/${fn}`
                            const fr24Url = `https://www.flightradar24.com/${fn}`
                            return (
                              <table key={i} width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ marginBottom: i < outbound.length + inbound.length - 1 ? 10 : 0, background: '#ffffff', borderRadius: 8, border: '1px solid #BFDBFE', padding: 0 }}>
                                <tbody>
                                  <tr>
                                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A', fontFamily: 'Arial, sans-serif' }}>
                                        {leg.flightNumber} &nbsp;·&nbsp; {leg.departureCode} → {leg.arrivalCode}
                                      </div>
                                      <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'Arial, sans-serif', marginTop: 2 }}>
                                        {leg.departureCity} → {leg.arrivalCity} &nbsp;·&nbsp; {leg.departureDate} {leg.departureTime}
                                      </div>
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                      <a href={faUrl} style={{ display: 'inline-block', background: '#1D4ED8', color: '#ffffff', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 5, textDecoration: 'none', fontFamily: 'Arial, sans-serif', marginRight: 6 }}>
                                        FlightAware
                                      </a>
                                      <a href={fr24Url} style={{ display: 'inline-block', background: '#F97316', color: '#ffffff', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 5, textDecoration: 'none', fontFamily: 'Arial, sans-serif' }}>
                                        Radar24
                                      </a>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            )
                          })}
                        </td>
                      </tr>
                    )}

                    {/* ── BLOCK 4: SERVICES STRIP ──────────────────────────── */}
                    <tr>
                      <td style={{ background: '#0B1F3A', padding: '24px 32px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 16, fontFamily: 'Arial, sans-serif' }}>Complete Your Journey</div>
                        <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
                          <tbody>
                            <tr>
                              {[
                                { icon: '🚗', label: 'Airport Transfer', btn: 'Book Transfer', href: 'https://www.walztravels.com/transfers' },
                                { icon: '📶', label: 'Jade eSIM', btn: 'Stay Connected', href: 'https://www.walztravels.com/esim' },
                                { icon: '🏨', label: 'Hotels', btn: 'Book Hotel', href: 'https://www.walztravels.com/hotels' },
                                { icon: '🗺️', label: 'Tours', btn: 'Explore', href: 'https://www.walztravels.com/tours' },
                                { icon: '🛡️', label: 'Insurance', btn: 'Get Covered', href: 'https://www.walztravels.com/insurance' },
                              ].map(({ icon, label, btn, href }) => (
                                <td key={label} align="center" style={{ padding: '0 3px', verticalAlign: 'top' }}>
                                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 8px', border: '1px solid rgba(201,168,76,0.2)' }}>
                                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: 8, fontFamily: 'Arial, sans-serif' }}>{label}</div>
                                    <a href={href} style={{ display: 'block', background: '#C9A84C', color: '#0B1F3A', fontSize: 9, fontWeight: 700, padding: '5px 6px', borderRadius: 5, textDecoration: 'none', fontFamily: 'Arial, sans-serif' }}>
                                      {btn}
                                    </a>
                                  </div>
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* ── BLOCK 5: OUTBOUND FLIGHTS ─────────────────────────── */}
                    {outbound.length > 0 && (
                      <tr>
                        <td style={{ padding: '24px 32px 0', background: '#ffffff' }}>
                          <FlightSection legs={outbound} label="Outbound Flight" />
                        </td>
                      </tr>
                    )}

                    {/* ── BLOCK 6: INBOUND FLIGHTS ──────────────────────────── */}
                    {tripType === 'return' && inbound.length > 0 && (
                      <tr>
                        <td style={{ padding: '16px 32px 0', background: '#ffffff' }}>
                          <FlightSection legs={inbound} label="Inbound Flight" />
                        </td>
                      </tr>
                    )}

                    {/* ── BLOCK 7: PASSENGER DETAILS ────────────────────────── */}
                    {passengers.length > 0 && (
                      <tr>
                        <td style={{ background: '#ffffff', padding: '24px 32px 0' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3A', marginBottom: 16, fontFamily: 'Arial, sans-serif' }}>Passenger Details</div>
                          <table width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                            <thead>
                              <tr style={{ background: '#0B1F3A' }}>
                                <th style={{ padding: '10px 14px', fontSize: 10, color: '#C9A84C', textAlign: 'left', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>Passenger</th>
                                <th style={{ padding: '10px 14px', fontSize: 10, color: '#C9A84C', textAlign: 'left', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>E-Ticket</th>
                                <th style={{ padding: '10px 14px', fontSize: 10, color: '#C9A84C', textAlign: 'left', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>Class</th>
                                <th style={{ padding: '10px 14px', fontSize: 10, color: '#C9A84C', textAlign: 'left', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>Seat</th>
                                <th style={{ padding: '10px 14px', fontSize: 10, color: '#C9A84C', textAlign: 'left', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>Meal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {passengers.map((p, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#F9FAFB' }}>
                                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#0B1F3A', fontFamily: 'Arial, sans-serif' }}>
                                    {[p.title, p.firstName, p.lastName].filter(Boolean).join(' ')}
                                  </td>
                                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>{p.eTicketNumber || 'N/A'}</td>
                                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>{p.cabinClass}</td>
                                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>{p.seat || 'TBC'}</td>
                                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>{p.meal || 'Standard'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── BLOCK 8: PRICING ──────────────────────────────────── */}
                    {pricing && (
                      <tr>
                        <td style={{ background: '#ffffff', padding: '24px 32px 0' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3A', marginBottom: 16, fontFamily: 'Arial, sans-serif' }}>Price Breakdown</div>
                          <table width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ border: '1px solid #E5E7EB', borderRadius: 8 }}>
                            <tbody>
                              {[
                                { label: `Base Fare (per passenger)`, amount: pricing.baseFare },
                                { label: `Taxes & Fees (per passenger)`, amount: pricing.taxes },
                                ...(pricing.carrierFees ? [{ label: 'Carrier Fees', amount: pricing.carrierFees }] : []),
                                ...(pricing.lineItems ?? []),
                              ].map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#374151', fontFamily: 'Arial, sans-serif' }}>{row.label}</td>
                                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#374151', textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>{pricing.currency} {row.amount.toFixed(2)}</td>
                                </tr>
                              ))}
                              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#0B1F3A', fontFamily: 'Arial, sans-serif' }}>Total per Passenger</td>
                                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#0B1F3A', textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>{pricing.currency} {pricing.total.toFixed(2)}</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                                <td style={{ padding: '10px 16px', fontSize: 13, color: '#6B7280', fontFamily: 'Arial, sans-serif' }}>Number of Passengers</td>
                                <td style={{ padding: '10px 16px', fontSize: 13, color: '#6B7280', textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>{pricing.passengerCount}</td>
                              </tr>
                              {/* Gold divider row */}
                              <tr>
                                <td colSpan={2} style={{ height: 3, background: '#C9A84C' }} />
                              </tr>
                              <tr style={{ background: '#F7F4EF' }}>
                                <td style={{ padding: '16px', fontSize: 14, fontWeight: 800, color: '#0B1F3A', fontFamily: 'Arial, sans-serif' }}>GRAND TOTAL</td>
                                <td style={{ padding: '16px', fontSize: 24, fontWeight: 800, color: '#C9A84C', textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>{pricing.currencySymbol}{pricing.grandTotal.toFixed(2)}</td>
                              </tr>
                            </tbody>
                          </table>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, fontFamily: 'Arial, sans-serif' }}>
                            * Amounts shown in {pricing.currency}. Service arranged by Walz Travels.
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── BLOCK 9: IMPORTANT INFO ───────────────────────────── */}
                    <tr>
                      <td style={{ background: '#F8F9FA', padding: '24px 32px', borderTop: '1px solid #E5E7EB' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0B1F3A', marginBottom: 12, fontFamily: 'Arial, sans-serif' }}>Important Information</div>
                        {[
                          'Arrive at least 3 hours before your international flight',
                          'Carry this confirmation at all times during travel',
                          'Check visa and entry requirements for your destination before travel',
                          'Baggage allowance may differ for connecting flights — confirm with the airline directly',
                          'For changes contact Walz Travels immediately on WhatsApp: +44 7398 753797',
                        ].map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                            <span style={{ color: '#C9A84C', fontSize: 12, marginTop: 1, flexShrink: 0 }}>•</span>
                            <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, fontFamily: 'Arial, sans-serif' }}>{item}</span>
                          </div>
                        ))}
                      </td>
                    </tr>

                    {/* ── BLOCK 10: AGENT MESSAGE ───────────────────────────── */}
                    {agentMessage && (
                      <tr>
                        <td style={{ background: '#ffffff', padding: '0 32px 24px' }}>
                          <div style={{ borderLeft: '4px solid #C9A84C', paddingLeft: 16, marginTop: 16 }}>
                            <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: 'Arial, sans-serif' }}>Message from your Walz Travels advisor</div>
                            <div style={{ fontSize: 14, color: '#374151', fontStyle: 'italic', lineHeight: 1.6, fontFamily: 'Arial, sans-serif' }}>{agentMessage}</div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── BLOCK 11: FOOTER ──────────────────────────────────── */}
                    <tr>
                      <td style={{ background: '#0B1F3A', padding: '32px 32px 24px', borderRadius: '0 0 12px 12px' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', fontFamily: 'Arial, sans-serif' }}>WALZ TRAVELS</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, letterSpacing: 1, fontFamily: 'Arial, sans-serif' }}>THE WALZ TRAVELS INC</div>

                        {/* Contact row */}
                        <table width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ marginTop: 20, marginBottom: 20 }}>
                          <tbody>
                            <tr>
                              <td style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Arial, sans-serif', paddingRight: 16 }}>📞 +1 984 388 0110</td>
                              <td style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Arial, sans-serif', paddingRight: 16 }}>💬 +44 7398 753797</td>
                              <td style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Arial, sans-serif', paddingRight: 16 }}>✉️ contact@walztravels.com</td>
                              <td style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Arial, sans-serif' }}>🌐 walztravels.com</td>
                            </tr>
                          </tbody>
                        </table>

                        {/* Social links */}
                        <div style={{ marginBottom: 20 }}>
                          {[
                            { label: 'Instagram', href: 'https://instagram.com/walz_travels' },
                            { label: 'Facebook',  href: 'https://facebook.com/walztravels' },
                            { label: 'LinkedIn',  href: 'https://linkedin.com/company/walztravels' },
                            { label: 'X',         href: 'https://x.com/walztravels' },
                          ].map(({ label, href }, i) => (
                            <React.Fragment key={label}>
                              <a href={href} style={{ fontSize: 11, color: '#C9A84C', textDecoration: 'none', fontFamily: 'Arial, sans-serif' }}>{label}</a>
                              {i < 3 && <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 8px' }}>|</span>}
                            </React.Fragment>
                          ))}
                        </div>

                        {/* Gold divider */}
                        <div style={{ height: 1, background: '#C9A84C', opacity: 0.3, marginBottom: 20 }} />

                        {/* Legal */}
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, fontFamily: 'Arial, sans-serif' }}>
                          This booking confirmation was prepared by Walz Travels acting as your travel agent. The terms and conditions of the operating carrier(s) apply to your booking. Walz Travels is not responsible for flight changes or cancellations made by the airline.
                          <br /><br />
                          © 2026 THE WALZ TRAVELS INC. All rights reserved.
                          <br />
                          Do not reply to this email. For support contact Jade on WhatsApp: +44 7398 753797
                        </div>
                      </td>
                    </tr>

                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
