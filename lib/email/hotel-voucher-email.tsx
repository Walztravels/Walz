import React from 'react'

// ── Brand ─────────────────────────────────────────────────────────────────────

const NAVY  = '#0B1F3A'
const GOLD  = '#C9A84C'
const GREEN = '#16A34A'
const GREEN_BG = '#F0FDF4'
const AMBER = '#D97706'
const AMBER_BG = '#FFFBEB'
const GREY  = '#6B7280'
const LGREY = '#F3F4F6'
const WHITE = '#FFFFFF'
const RED   = '#DC2626'
const RED_BG = '#FEF2F2'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HotelVoucherEmailProps {
  ticket_reference:     string
  issue_date?:          string
  client_name:          string
  client_email?:        string
  hotel_name:           string
  hotel_address?:       string
  hotel_phone?:         string
  hotel_email?:         string
  hotel_website?:       string
  star_rating?:         number
  city?:                string
  country?:             string
  checkin_date:         string
  checkin_time?:        string
  checkout_date:        string
  checkout_time?:       string
  num_nights?:          string
  num_rooms?:           string
  room_type?:           string
  bed_type?:            string
  board_basis?:         string
  num_guests?:          string
  guest_names?:         string
  confirmation_number?: string
  total_price?:         string
  currency?:            string
  cancellation_policy?: string
  cancellation_deadline?: string
  amenities?:           string[]
  special_requests?:    string
  agent_message?:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

function cancellationColor(policy?: string): string {
  switch (policy) {
    case 'Free cancellation':    return GREEN
    case 'Non-refundable':       return RED
    case 'Partially refundable': return AMBER
    default:                     return NAVY
  }
}

function cancellationBg(policy?: string): string {
  switch (policy) {
    case 'Free cancellation':    return GREEN_BG
    case 'Non-refundable':       return RED_BG
    case 'Partially refundable': return AMBER_BG
    default:                     return LGREY
  }
}

// ── Email Template ────────────────────────────────────────────────────────────

export function HotelVoucherEmail(p: HotelVoucherEmailProps) {
  const fullAddress = [p.hotel_address, p.city, p.country].filter(Boolean).join(', ')

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F1F5F9', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: '#F1F5F9', padding: '24px 0' }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="600" cellPadding={0} cellSpacing={0} style={{ maxWidth: 600, width: '100%', backgroundColor: WHITE, borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }}>

                  {/* HEADER */}
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: NAVY, padding: '24px 32px' }}>
                        <table width="100%" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td>
                                <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width={120} style={{ display: 'block', height: 'auto' }} />
                                <div style={{ fontSize: 9, color: GOLD, letterSpacing: '3px', marginTop: 3, textTransform: 'uppercase' }}>
                                  YOUR JOURNEY. OUR EXPERTISE.
                                </div>
                              </td>
                              <td align="right">
                                <div style={{ display: 'inline-block', backgroundColor: GOLD, color: NAVY, fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 4 }}>
                                  REF: {p.ticket_reference}
                                </div>
                                <br />
                                <div style={{ color: '#94A3B8', fontSize: 9, marginTop: 6 }}>
                                  🏨 HOTEL VOUCHER
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* GOLD STRIP */}
                    <tr>
                      <td style={{ height: 3, backgroundColor: GOLD }} />
                    </tr>

                    {/* CONFIRMED BANNER */}
                    <tr>
                      <td style={{ backgroundColor: GREEN_BG, padding: '12px 32px', textAlign: 'center', borderBottom: '1px solid #86EFAC' }}>
                        <span style={{ color: GREEN, fontWeight: 700, fontSize: 14, letterSpacing: '1.5px' }}>
                          ✓  BOOKING CONFIRMED
                        </span>
                        {p.confirmation_number && (
                          <span style={{ color: GREY, fontSize: 11, marginLeft: 16 }}>
                            Confirmation: {p.confirmation_number}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* GREETING */}
                    <tr>
                      <td style={{ padding: '24px 32px 0' }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: NAVY }}>
                          Dear {p.client_name},
                        </p>
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: GREY, lineHeight: 1.6 }}>
                          Your hotel booking is confirmed. Please find your hotel voucher details below.
                        </p>
                      </td>
                    </tr>

                    {/* HOTEL IDENTITY */}
                    <tr>
                      <td style={{ padding: '20px 32px 0' }}>
                        <div style={{ borderLeft: `4px solid ${GOLD}`, paddingLeft: 16 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>{p.hotel_name}</div>
                          {p.star_rating && p.star_rating > 0 && (
                            <div style={{ color: GOLD, fontSize: 14, marginTop: 2, letterSpacing: 2 }}>
                              {'★'.repeat(Math.min(5, p.star_rating))}{'☆'.repeat(5 - Math.min(5, p.star_rating))}
                            </div>
                          )}
                          {fullAddress && <div style={{ fontSize: 12, color: GREY, marginTop: 4 }}>{fullAddress}</div>}
                          <div style={{ marginTop: 6 }}>
                            {p.hotel_phone   && <span style={{ fontSize: 11, color: GREY, marginRight: 14 }}>📞 {p.hotel_phone}</span>}
                            {p.hotel_email   && <span style={{ fontSize: 11, color: GREY, marginRight: 14 }}>✉ {p.hotel_email}</span>}
                            {p.hotel_website && <a href={`https://${p.hotel_website.replace(/^https?:\/\//,'')}`} style={{ fontSize: 11, color: '#2563EB' }}>🌐 {p.hotel_website}</a>}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* DATE CARDS */}
                    <tr>
                      <td style={{ padding: '20px 32px 0' }}>
                        <table width="100%" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td width="44%" style={{ backgroundColor: LGREY, borderRadius: 8, padding: '16px', textAlign: 'center', border: `2px solid ${NAVY}` }}>
                                <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>CHECK IN</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>{fmtDate(p.checkin_date)}</div>
                                <div style={{ fontSize: 11, color: GREY, marginTop: 4 }}>From {p.checkin_time || '14:00'}</div>
                              </td>
                              <td width="12%" style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 8px' }}>
                                <div style={{ backgroundColor: NAVY, color: WHITE, borderRadius: '50%', width: 44, height: 44, lineHeight: '44px', textAlign: 'center', fontSize: 10, fontWeight: 700, margin: '0 auto' }}>
                                  {p.num_nights ? `${p.num_nights}N` : '—'}
                                </div>
                              </td>
                              <td width="44%" style={{ backgroundColor: LGREY, borderRadius: 8, padding: '16px', textAlign: 'center', border: `2px solid ${NAVY}` }}>
                                <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>CHECK OUT</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>{fmtDate(p.checkout_date)}</div>
                                <div style={{ fontSize: 11, color: GREY, marginTop: 4 }}>By {p.checkout_time || '12:00'}</div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* ROOM DETAILS */}
                    {(p.room_type || p.bed_type || p.num_rooms || p.board_basis || p.num_guests) && (
                      <tr>
                        <td style={{ padding: '20px 32px 0' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GREY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 }}>Room Details</div>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                                {p.room_type && <td style={{ padding: '10px 14px', width: '33%', borderRight: '1px solid #E5E7EB' }}>
                                  <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', marginBottom: 3 }}>Room Type</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{p.room_type}</div>
                                </td>}
                                {p.bed_type && <td style={{ padding: '10px 14px', width: '33%', borderRight: '1px solid #E5E7EB' }}>
                                  <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', marginBottom: 3 }}>Bed Type</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{p.bed_type}</div>
                                </td>}
                                {p.num_rooms && <td style={{ padding: '10px 14px', width: '33%' }}>
                                  <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', marginBottom: 3 }}>Rooms</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{p.num_rooms}</div>
                                </td>}
                              </tr>
                              {(p.board_basis || p.num_guests) && (
                                <tr>
                                  {p.board_basis && <td style={{ padding: '10px 14px', width: '33%', borderRight: '1px solid #E5E7EB' }}>
                                    <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', marginBottom: 3 }}>Board Basis</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{p.board_basis}</div>
                                  </td>}
                                  {p.num_guests && <td style={{ padding: '10px 14px', width: '33%' }}>
                                    <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', marginBottom: 3 }}>Guests</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{p.num_guests}</div>
                                  </td>}
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* CANCELLATION POLICY */}
                    {p.cancellation_policy && (
                      <tr>
                        <td style={{ padding: '20px 32px 0' }}>
                          <div style={{ backgroundColor: cancellationBg(p.cancellation_policy), border: `1px solid ${cancellationColor(p.cancellation_policy)}40`, borderRadius: 6, padding: '12px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: cancellationColor(p.cancellation_policy) }}>
                              {p.cancellation_policy === 'Free cancellation' ? '✓' : p.cancellation_policy === 'Non-refundable' ? '✕' : '!'}&nbsp;
                              {p.cancellation_policy}
                            </div>
                            {p.cancellation_deadline && (
                              <div style={{ fontSize: 11, color: GREY, marginTop: 4 }}>
                                Cancellation deadline: {fmtDate(p.cancellation_deadline)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* PRICING */}
                    {p.total_price && (
                      <tr>
                        <td style={{ padding: '16px 32px 0' }}>
                          <table width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: '#FFFBF0', border: `1px solid ${GOLD}`, borderRadius: 6 }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Total Price</div>
                                  <div style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{p.currency || 'GBP'} {p.total_price}</div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* AMENITIES */}
                    {p.amenities && p.amenities.length > 0 && (
                      <tr>
                        <td style={{ padding: '20px 32px 0' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GREY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>Amenities Included</div>
                          <div>
                            {p.amenities.map(a => (
                              <span key={a} style={{ display: 'inline-block', padding: '4px 10px', backgroundColor: LGREY, border: '1px solid #D1D5DB', borderRadius: 20, fontSize: 11, color: NAVY, marginRight: 6, marginBottom: 6 }}>
                                {a}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* SPECIAL REQUESTS */}
                    {p.special_requests && (
                      <tr>
                        <td style={{ padding: '20px 32px 0' }}>
                          <div style={{ backgroundColor: AMBER_BG, border: '1px solid #FCD34D', borderRadius: 6, padding: '12px 16px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5 }}>Special Requests</div>
                            <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.6 }}>{p.special_requests}</div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* AGENT MESSAGE */}
                    {p.agent_message && (
                      <tr>
                        <td style={{ padding: '20px 32px 0' }}>
                          <div style={{ backgroundColor: '#FFFBF0', border: `1px solid ${GOLD}`, borderRadius: 6, padding: '12px 16px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5 }}>
                              Message from Walz Travels
                            </div>
                            <div style={{ fontSize: 11, color: '#78650A', lineHeight: 1.6 }}>{p.agent_message}</div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* CTA BUTTON */}
                    <tr>
                      <td style={{ padding: '24px 32px', textAlign: 'center' }}>
                        <a
                          href="https://walztravels.com/portal"
                          style={{
                            display: 'inline-block', backgroundColor: GOLD,
                            color: NAVY, fontSize: 13, fontWeight: 700,
                            padding: '12px 32px', borderRadius: 6,
                            textDecoration: 'none', letterSpacing: '0.5px',
                          }}
                        >
                          View in My Portal →
                        </a>
                        <p style={{ fontSize: 11, color: GREY, marginTop: 12 }}>
                          Questions? WhatsApp us at <a href="https://wa.me/12317902336" style={{ color: NAVY, fontWeight: 600 }}>+12317902336</a>
                        </p>
                      </td>
                    </tr>

                    {/* DIVIDER */}
                    <tr>
                      <td style={{ height: 1, backgroundColor: '#E5E7EB' }} />
                    </tr>

                    {/* FOOTER */}
                    <tr>
                      <td style={{ backgroundColor: NAVY, padding: '20px 32px' }}>
                        <table width="100%" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td>
                                <div style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.8 }}>
                                  Walz Travels Ltd<br />
                                  WhatsApp: +12317902336<br />
                                  contact@walztravels.com · walztravels.com
                                </div>
                              </td>
                              <td align="right">
                                <div style={{ fontSize: 9, color: GOLD, fontWeight: 700 }}>Powered by Jade</div>
                                <div style={{ fontSize: 9, color: '#475569', marginTop: 4 }}>Ref: {p.ticket_reference}</div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1E3A5F' }}>
                          <p style={{ margin: 0, fontSize: 9, color: '#475569', lineHeight: 1.6 }}>
                            This email was sent by Walz Travels Ltd. The hotel voucher attached to this email is your booking confirmation.
                            Walz Travels acts as an agent; service is provided by the accommodation supplier.
                          </p>
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
