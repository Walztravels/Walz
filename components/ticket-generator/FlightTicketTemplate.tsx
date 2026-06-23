'use client'

import { useState, useEffect } from 'react'
import type { FlightLeg, Passenger, PricingBreakdown } from '@/types/flight-ticket'

// ── Data types ────────────────────────────────────────────────────────────────

export interface FlightTicketTemplateData {
  pnr: string
  tripType: 'one-way' | 'return'
  outbound: FlightLeg[]
  inbound: FlightLeg[]
  passengers: Passenger[]
  includePricing: boolean
  pricing: PricingBreakdown
}

interface ClientInfo {
  name: string
  email: string
  phone: string
}

export interface FlightTicketTemplateProps {
  flightTicket: FlightTicketTemplateData
  client: ClientInfo
  reference: string
  bookingDate: string
  agentMessage?: string
  mode: 'preview' | 'print'
}

// ── Logo hook — converts /walz-logo.png to a base64 data URL so it
//    renders correctly in window.print() and html2pdf without CORS issues ──────

function useLogoBase64() {
  const [logoSrc, setLogoSrc] = useState('/walz-logo.png')

  useEffect(() => {
    fetch('/walz-logo.png')
      .then(r => r.blob())
      .then(
        blob =>
          new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          }),
      )
      .then(base64 => setLogoSrc(base64))
      .catch(() => {})
  }, [])

  return logoSrc
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 8, background: '#f3f4f6',
      color: '#374151', padding: '2px 7px', borderRadius: 3, fontWeight: 500,
      marginRight: 4, marginBottom: 3,
    }}>
      {children}
    </span>
  )
}

// PDF-safe service tag — inline-block + marginRight instead of inline-flex + gap
function SvcTag({ icon, label }: { icon: string; label: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9,
      color: '#4b5563', background: '#f3f4f6', border: '1px solid #e5e7eb',
      padding: '3px 9px', borderRadius: 4,
      marginRight: 6, marginBottom: 4,
    }}>
      {icon}&nbsp;{label}
    </span>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 8, color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#0a1628', margin: 0 }}>{value || '—'}</p>
    </div>
  )
}

function PriceLine({
  label, value, currency, bold = false,
}: { label: string; value: string; currency: string; bold?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 1 }}>
      <tbody>
        <tr>
          <td style={{ fontSize: bold ? 11 : 10, fontWeight: bold ? 700 : 400, color: bold ? '#0a1628' : '#6b7280', padding: '2px 0' }}>
            {label}
          </td>
          <td style={{ fontSize: bold ? 11 : 10, fontWeight: bold ? 700 : 400, color: bold ? '#0a1628' : '#374151', fontFamily: 'monospace', textAlign: 'right', padding: '2px 0' }}>
            {currency} {value}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// ── LegSection — table layout for PDF/print compatibility ─────────────────────

function LegSection({
  leg, index, total, direction,
}: { leg: FlightLeg; index: number; total: number; direction: 'outbound' | 'inbound' }) {
  return (
    <div style={{ borderBottom: index < total - 1 ? '1px dashed #e5e7eb' : 'none', padding: '16px 0' }}>

      {/* Leg header — table for horizontal layout */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'middle' }}>
              <span style={{ fontSize: 12, color: direction === 'inbound' ? '#c9a84c' : '#0a1628', marginRight: 6 }}>
                {direction === 'inbound' ? '↩' : '✈'}
              </span>
              <span style={{
                fontSize: 8, fontWeight: 700, color: '#6b7280',
                letterSpacing: '0.15em', textTransform: 'uppercase',
              }}>
                {direction === 'inbound' ? 'RETURN' : 'OUTBOUND'}
                {total > 1 && ` · FLIGHT ${index + 1} OF ${total}`}
              </span>
              {total > 1 && index > 0 && (
                <span style={{
                  fontSize: 8, background: '#fef3c7', color: '#92400e',
                  padding: '1px 6px', borderRadius: 3, fontWeight: 600, marginLeft: 6,
                  display: 'inline-block',
                }}>
                  CONNECTING
                </span>
              )}
            </td>
            <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
              <span style={{
                fontSize: 9, background: '#dcfce7', color: '#166534',
                padding: '2px 8px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.05em',
                display: 'inline-block',
              }}>
                ✓ CONFIRMED
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Flight info row — table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#0a1628', letterSpacing: '0.02em', margin: '0 0 2px' }}>
                {leg.flightNumber || '—'}
              </p>
              <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>
                {leg.airline}
                {leg.operatedBy && (
                  <span style={{ color: '#9ca3af' }}> · Operated by {leg.operatedBy}</span>
                )}
              </p>
            </td>
            <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
              {leg.aircraft && (
                <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 2px' }}>{leg.aircraft}</p>
              )}
              <p style={{ fontSize: 9, color: '#6b7280', margin: 0 }}>
                {leg.cabinClass}{leg.duration ? ` · ${leg.duration}` : ''}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Route display — TABLE layout (PDF-safe: no flexbox gap) */}
      <table style={{
        width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
        background: '#f8f9fb', borderRadius: 10,
      }}>
        <colgroup>
          <col style={{ width: '40%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <tbody>
          <tr>
            {/* Departure */}
            <td style={{ verticalAlign: 'top', padding: '14px 12px 14px 16px' }}>
              <p style={{
                fontSize: 34, fontWeight: 800, color: '#0a1628',
                letterSpacing: '-0.02em', lineHeight: 1, margin: '0 0 2px',
              }}>
                {leg.departureCode || '???'}
              </p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>
                {leg.departureCity}
              </p>
              <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 8px', lineHeight: 1.4 }}>
                {leg.departureAirport}
                {leg.departureTerminal ? ` · T${leg.departureTerminal}` : ''}
                {leg.departureCountry ? ` · ${leg.departureCountry}` : ''}
              </p>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 2px' }}>
                {fmtDate(leg.departureDate)}
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#0a1628', margin: 0, letterSpacing: '-0.01em' }}>
                {leg.departureTime || '--:--'}
              </p>
            </td>

            {/* Centre: duration + plane arrow — nested table for the line */}
            <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '0 4px' }}>
              <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 6px', textAlign: 'center' }}>
                {leg.duration || ''}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ borderBottom: '1.5px solid #c9a84c', padding: 0, height: 1 }} />
                    <td style={{ fontSize: 14, color: '#c9a84c', textAlign: 'center', padding: '0 2px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                      ✈
                    </td>
                    <td style={{ borderBottom: '1.5px solid #c9a84c', padding: 0, height: 1 }} />
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 8, color: '#c9a84c', margin: '4px 0 0', fontWeight: 600, textAlign: 'center' }}>
                {leg.departureCountry && leg.arrivalCountry && leg.departureCountry === leg.arrivalCountry
                  ? 'DOMESTIC' : 'INTL'}
              </p>
            </td>

            {/* Arrival */}
            <td style={{ verticalAlign: 'top', textAlign: 'right', padding: '14px 16px 14px 12px' }}>
              <p style={{
                fontSize: 34, fontWeight: 800, color: '#0a1628',
                letterSpacing: '-0.02em', lineHeight: 1, margin: '0 0 2px',
              }}>
                {leg.arrivalCode || '???'}
              </p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>
                {leg.arrivalCity}
              </p>
              <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 8px', lineHeight: 1.4 }}>
                {leg.arrivalAirport}
                {leg.arrivalTerminal ? ` · T${leg.arrivalTerminal}` : ''}
                {leg.arrivalCountry ? ` · ${leg.arrivalCountry}` : ''}
              </p>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 2px' }}>
                {fmtDate(leg.arrivalDate)}
                {leg.arrivalNextDay && (
                  <span style={{ fontSize: 8, color: '#c9a84c', fontWeight: 700, marginLeft: 3 }}>+1</span>
                )}
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#0a1628', margin: 0, letterSpacing: '-0.01em' }}>
                {leg.arrivalTime || '--:--'}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Service tags — inline-block (no flex gap) */}
      <div style={{ marginTop: 8 }}>
        {leg.baggage && <SvcTag icon="🧳" label={`Baggage: ${leg.baggage}`} />}
        {leg.mealPreference && <SvcTag icon="🍽" label={`Meal: ${leg.mealPreference}`} />}
        {leg.seat && <SvcTag icon="💺" label={`Seat: ${leg.seat}`} />}
      </div>

      {/* Connection banner */}
      {index < total - 1 && leg.connectionTime && (
        <div style={{
          background: 'linear-gradient(90deg, #c9a84c, #e8c05a)',
          borderRadius: 6, padding: '7px 14px', marginTop: 10,
          textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#0a1628',
        }}>
          ⏱ Connection: {leg.connectionTime} layover in {leg.arrivalCity}
        </div>
      )}
    </div>
  )
}

// ── Terms ─────────────────────────────────────────────────────────────────────

const TERMS = [
  "1. Check in 2 hrs before domestic and 3 hrs before international flights. Late check-in is at the passenger's own risk.",
  "2. Baggage allowances are as stated on this ticket and subject to airline policy. Excess charges are the passenger's responsibility.",
  '3. This ticket is non-transferable. The name on the ticket must match the passport presented at check-in.',
  '4. Cancellation and amendment fees apply per fare rules. Contact Walz Travels at least 48 hrs before departure for changes.',
  '5. Walz Travels acts as an agent. We are not liable for delays, cancellations or service failures by airlines or third parties.',
  '6. Travel insurance is strongly recommended. Walz Travels is not responsible for medical emergencies or personal property loss.',
  '7. Passengers requiring special assistance must notify the airline at least 48 hrs before travel.',
  '8. By accepting this ticket, the passenger confirms full acceptance of these terms. Full policy: walztravels.com/terms',
]

// ── Main Template ─────────────────────────────────────────────────────────────

export function FlightTicketTemplate({
  flightTicket, client, reference, bookingDate, agentMessage,
}: FlightTicketTemplateProps) {
  const { pnr, tripType, outbound, inbound, passengers, includePricing, pricing } = flightTicket
  const logoSrc = useLogoBase64()

  return (
    <div
      id="ticket-print-area"
      style={{
        fontFamily: "'Inter', Arial, sans-serif",
        width: '100%',
        background: '#ffffff',
        color: '#0a1628',
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0a1628' }}>
        <tbody>
          <tr>
            <td style={{ padding: '18px 28px', verticalAlign: 'middle' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt="Walz Travels"
                style={{ height: 32, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }}
              />
              <p style={{
                color: 'rgba(255,255,255,0.45)', fontSize: 9, letterSpacing: '0.15em',
                margin: '5px 0 0', textTransform: 'uppercase',
              }}>
                YOUR JOURNEY. OUR EXPERTISE.
              </p>
            </td>
            <td style={{ padding: '18px 28px', textAlign: 'right', verticalAlign: 'middle' }}>
              <p style={{ color: '#c9a84c', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', margin: '0 0 5px' }}>
                REF: {reference}
              </p>
              <span style={{
                display: 'inline-block', background: '#c9a84c', color: '#0a1628',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '3px 10px', borderRadius: 4,
              }}>
                ✈ FLIGHT TICKET
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Amber gradient stripe */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #b8870e, #f0c040, #b8870e)' }} />

      {/* ── PASSENGER DETAILS — table grid ─────────────────────────────────── */}
      {passengers.length > 0 && (
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #ebebeb', background: '#f8f9fb' }}>
          <p style={{
            fontSize: 9, fontWeight: 700, color: '#6b7280', letterSpacing: '0.15em',
            textTransform: 'uppercase', margin: '0 0 10px',
          }}>
            Passenger Details
          </p>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '8px 0' }}>
            <tbody>
              <tr>
                {passengers.slice(0, 2).map((pax, i) => (
                  <td key={i} style={{
                    verticalAlign: 'top',
                    width: passengers.length === 1 ? '100%' : '50%',
                    background: '#fff', border: '1px solid #e5e7eb',
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                      <tbody>
                        <tr>
                          <td style={{ fontSize: 13, fontWeight: 700, color: '#0a1628', verticalAlign: 'middle' }}>
                            {pax.title} {pax.firstName} {pax.lastName}
                          </td>
                          <td style={{ textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap', paddingLeft: 6 }}>
                            <span style={{
                              fontSize: 9, color: '#6b7280', background: '#f3f4f6',
                              padding: '2px 6px', borderRadius: 3,
                            }}>
                              PAX {i + 1}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {pax.eTicketNumber && (
                      <p style={{
                        fontSize: 10, color: '#374151', fontFamily: 'monospace',
                        fontWeight: 600, margin: '0 0 6px',
                      }}>
                        E-Ticket: {pax.eTicketNumber}
                      </p>
                    )}
                    <div style={{ marginTop: 4 }}>
                      {pax.cabinClass && <Pill>{pax.cabinClass}</Pill>}
                      {pax.seat && <Pill>💺 Seat {pax.seat}</Pill>}
                      {pax.meal && <Pill>🍽 {pax.meal}</Pill>}
                      {pax.passport && <Pill>PP: {pax.passport}</Pill>}
                      {pax.nationality && <Pill>{pax.nationality}</Pill>}
                      {pax.dob && <Pill>DOB: {pax.dob}</Pill>}
                      {pax.frequentFlyer && <Pill>FF: {pax.frequentFlyer}</Pill>}
                    </div>
                  </td>
                ))}
              </tr>
              {/* Extra passengers beyond first 2 row */}
              {passengers.length > 2 && (
                <tr>
                  {passengers.slice(2, 4).map((pax, i) => (
                    <td key={i} style={{
                      verticalAlign: 'top', width: '50%',
                      background: '#fff', border: '1px solid #e5e7eb',
                      borderRadius: 8, padding: '10px 14px',
                    }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#0a1628', margin: '0 0 4px' }}>
                        {pax.title} {pax.firstName} {pax.lastName}
                      </p>
                      {pax.eTicketNumber && (
                        <p style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace', fontWeight: 600, margin: '0 0 4px' }}>
                          E-Ticket: {pax.eTicketNumber}
                        </p>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── OUTBOUND FLIGHTS ───────────────────────────────────────────────── */}
      {outbound.length > 0 && (
        <div style={{ padding: '0 28px' }}>
          <div style={{ padding: '12px 0 0' }}>
            <p style={{
              fontSize: 9, fontWeight: 700, color: '#6b7280',
              letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0,
            }}>
              ✈ OUTBOUND FLIGHT{outbound.length > 1 ? 'S' : ''}
            </p>
          </div>
          {outbound.map((leg, i) => (
            <LegSection key={i} leg={leg} index={i} total={outbound.length} direction="outbound" />
          ))}
        </div>
      )}

      {/* ── RETURN FLIGHTS ─────────────────────────────────────────────────── */}
      {tripType === 'return' && inbound.length > 0 && (
        <>
          <div style={{ margin: '0 28px', borderTop: '2px solid #c9a84c', paddingTop: 14 }}>
            <p style={{
              fontSize: 9, fontWeight: 700, color: '#c9a84c',
              letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0,
            }}>
              ↩ RETURN FLIGHT{inbound.length > 1 ? 'S' : ''}
            </p>
          </div>
          <div style={{ padding: '0 28px' }}>
            {inbound.map((leg, i) => (
              <LegSection key={i} leg={leg} index={i} total={inbound.length} direction="inbound" />
            ))}
          </div>
        </>
      )}

      {/* ── BOOKING SUMMARY — table grid ───────────────────────────────────── */}
      <div style={{
        margin: '12px 28px', background: '#f8f9fb',
        border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px',
      }}>
        <p style={{
          fontSize: 9, fontWeight: 700, color: '#6b7280',
          letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px',
        }}>
          Booking Summary
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: '33%', padding: '3px 8px 3px 0', verticalAlign: 'top' }}>
                <SummaryItem label="Airline PNR" value={pnr} />
              </td>
              <td style={{ width: '33%', padding: '3px 8px', verticalAlign: 'top' }}>
                <SummaryItem label="Trip Type" value={tripType === 'return' ? 'Round Trip' : 'One Way'} />
              </td>
              <td style={{ width: '33%', padding: '3px 0 3px 8px', verticalAlign: 'top' }}>
                <SummaryItem label="Passengers" value={passengers.length.toString() || '1'} />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '3px 8px 3px 0', verticalAlign: 'top' }}>
                <SummaryItem label="Walz Ref" value={reference} />
              </td>
              <td style={{ padding: '3px 8px', verticalAlign: 'top' }}>
                <SummaryItem label="Booking Date" value={fmtDate(bookingDate)} />
              </td>
              <td style={{ padding: '3px 0 3px 8px', verticalAlign: 'top' }}>
                <SummaryItem label="Issued By" value="Walz Travels Ltd" />
              </td>
            </tr>
          </tbody>
        </table>
        {(client.name || client.email || client.phone) && (
          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 10, paddingTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  {client.name && (
                    <td style={{ width: '33%', padding: '3px 8px 3px 0', verticalAlign: 'top' }}>
                      <SummaryItem label="Lead Passenger" value={client.name} />
                    </td>
                  )}
                  {client.email && (
                    <td style={{ width: '33%', padding: '3px 8px', verticalAlign: 'top' }}>
                      <SummaryItem label="Email" value={client.email} />
                    </td>
                  )}
                  {client.phone && (
                    <td style={{ width: '33%', padding: '3px 0 3px 8px', verticalAlign: 'top' }}>
                      <SummaryItem label="Phone / WhatsApp" value={client.phone} />
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── PRICING BREAKDOWN ──────────────────────────────────────────────── */}
      {includePricing && pricing && pricing.grandTotal > 0 && (
        <div style={{ margin: '0 28px 12px', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#0a1628', padding: '8px 16px' }}>
            <p style={{
              fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0,
            }}>
              Fare Breakdown
            </p>
          </div>
          <div style={{ padding: '10px 16px' }}>
            <PriceLine label="Base Fare (per passenger)" value={pricing.baseFare.toFixed(2)} currency={pricing.currency} />
            <PriceLine label="Taxes & Charges (per passenger)" value={pricing.taxes.toFixed(2)} currency={pricing.currency} />
            {pricing.carrierFees ? (
              <PriceLine label="Carrier Fees" value={pricing.carrierFees.toFixed(2)} currency={pricing.currency} />
            ) : null}
            {(pricing.lineItems ?? []).map((li, i) => (
              <PriceLine key={i} label={li.label} value={li.amount.toFixed(2)} currency={pricing.currency} />
            ))}
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6 }}>
              <PriceLine
                label={`TOTAL — ${pricing.passengerCount} passenger${pricing.passengerCount !== 1 ? 's' : ''}`}
                value={pricing.grandTotal.toFixed(2)}
                currency={pricing.currency}
                bold
              />
            </div>
          </div>
        </div>
      )}

      {/* ── AGENT MESSAGE ──────────────────────────────────────────────────── */}
      {agentMessage && (
        <div style={{
          margin: '0 28px 12px', background: '#fffbeb',
          border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px',
        }}>
          <p style={{
            fontSize: 9, fontWeight: 700, color: '#92400e',
            letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px',
          }}>
            Message from Walz Travels
          </p>
          <p style={{ fontSize: 10, color: '#78350f', lineHeight: 1.6, margin: 0 }}>{agentMessage}</p>
        </div>
      )}

      {/* ── BEFORE YOU FLY — table grid ────────────────────────────────────── */}
      <div style={{
        margin: '0 28px 12px', background: '#f0fdf4',
        border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px',
      }}>
        <p style={{
          fontSize: 9, fontWeight: 700, color: '#166534',
          letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px',
        }}>
          📋 Before You Fly
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Arrive at the airport at least 3 hours before international departure',
                'Carry a printed or digital copy of this ticket at all times'],
              ['Ensure your passport is valid for at least 6 months beyond your travel date',
                'Check visa requirements for your destination and all transit countries'],
              ['For any changes or issues contact Walz Travels on WhatsApp: +44 7398 753797',
                'Baggage allowances may differ per leg — confirm with each airline'],
            ].map(([left, right], i) => (
              <tr key={i}>
                <td style={{ width: '50%', padding: '1px 8px 1px 0', verticalAlign: 'top', fontSize: 8.5, color: '#166534', lineHeight: 1.5 }}>
                  • {left}
                </td>
                <td style={{ width: '50%', padding: '1px 0 1px 8px', verticalAlign: 'top', fontSize: 8.5, color: '#166534', lineHeight: 1.5 }}>
                  • {right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── TERMS & CONDITIONS — table grid ────────────────────────────────── */}
      <div style={{ margin: '0 28px 12px', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <p style={{
          fontSize: 8, fontWeight: 700, color: '#9ca3af',
          letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 6px',
        }}>
          Terms &amp; Conditions
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              [TERMS[0], TERMS[4]],
              [TERMS[1], TERMS[5]],
              [TERMS[2], TERMS[6]],
              [TERMS[3], TERMS[7]],
            ].map(([left, right], i) => (
              <tr key={i}>
                <td style={{ width: '50%', padding: '1px 8px 1px 0', verticalAlign: 'top', fontSize: 7.5, color: '#9ca3af', lineHeight: 1.65 }}>
                  {left}
                </td>
                <td style={{ width: '50%', padding: '1px 0 1px 8px', verticalAlign: 'top', fontSize: 7.5, color: '#9ca3af', lineHeight: 1.65 }}>
                  {right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER — table layout ───────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0a1628' }}>
        <tbody>
          <tr>
            <td style={{ padding: '14px 28px', verticalAlign: 'middle' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt="Walz Travels"
                style={{ height: 22, width: 'auto', display: 'inline-block', filter: 'brightness(0) invert(1)', verticalAlign: 'middle', marginRight: 12 }}
              />
              <span style={{ display: 'inline-block', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 12, verticalAlign: 'middle' }}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, margin: '0 0 2px' }}>
                  WhatsApp UK: +44 7398 753797
                </p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, margin: 0 }}>
                  contact@walztravels.com · walztravels.com
                </p>
              </span>
            </td>
            <td style={{ padding: '14px 28px', textAlign: 'right', verticalAlign: 'middle' }}>
              <p style={{ color: '#c9a84c', fontSize: 9, fontWeight: 600, margin: 0 }}>
                Powered by Jade ◆
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
