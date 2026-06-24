'use client'

import React from 'react'
import { WALZ_LOGO_BASE64 } from '@/lib/assets/walz-logo-base64'

// ── Brand ────────────────────────────────────────────────────────────────────

const NAVY  = '#0B1F3A'
const GOLD  = '#C9A84C'
const GREEN = '#16A34A'
const GREEN_BG = '#F0FDF4'
const RED   = '#DC2626'
const RED_BG   = '#FEF2F2'
const AMBER = '#D97706'
const AMBER_BG = '#FFFBEB'
const GREY  = '#6B7280'
const LGREY = '#F3F4F6'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HotelVoucher {
  ticket_reference:    string
  issue_date:          string
  issued_by?:          string
  // Guest
  client_name:         string
  client_email?:       string
  client_phone?:       string
  num_guests?:         string
  guest_names?:        string
  // Hotel
  hotel_name:          string
  hotel_address?:      string
  hotel_phone?:        string
  hotel_email?:        string
  hotel_website?:      string
  star_rating?:        number
  city?:               string
  country?:            string
  postcode?:           string
  // Stay
  checkin_date:        string
  checkin_time?:       string
  checkout_date:       string
  checkout_time?:      string
  num_nights?:         string
  board_basis?:        string
  meal_plan?:          string
  // Room
  num_rooms?:          string
  room_type?:          string
  bed_type?:           string
  // Rate & Cancellation
  total_price?:        string
  currency?:           string
  rate_description?:   string
  cancellation_policy?:  string
  cancellation_deadline?: string
  // Additional
  amenities?:          string[]
  loyalty_number?:     string
  special_requests?:   string
  confirmation_number?: string
  // Message
  agent_message?:      string
}

export interface HotelVoucherTemplateProps {
  voucher: HotelVoucher
  mode:    'preview' | 'print'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AMENITY_ICONS: Record<string, string> = {
  'Free WiFi':      '📶',
  'Swimming Pool':  '🏊',
  'Parking':        '🅿',
  'Gym/Fitness':    '🏋',
  'Spa':            '💆',
  'Restaurant':     '🍽',
  'Bar':            '🍸',
  'Airport Shuttle':'🚌',
  'Room Service':   '🛎',
  'Air Conditioning':'❄',
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

function fmtDateShort(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

function Stars({ count }: { count?: number }) {
  if (!count || count < 1) return null
  const filled = Math.min(5, Math.max(1, count))
  return (
    <span style={{ color: GOLD, fontSize: 14, letterSpacing: 2 }}>
      {'★'.repeat(filled)}{'☆'.repeat(5 - filled)}
    </span>
  )
}

function cancellationStyle(policy?: string): { bg: string; color: string; border: string } {
  switch (policy) {
    case 'Free cancellation':    return { bg: GREEN_BG,  color: GREEN,  border: '#86EFAC' }
    case 'Non-refundable':       return { bg: RED_BG,    color: RED,    border: '#FCA5A5' }
    case 'Partially refundable': return { bg: AMBER_BG,  color: AMBER,  border: '#FCD34D' }
    default:                     return { bg: LGREY,     color: NAVY,   border: '#D1D5DB' }
  }
}

function cancellationIcon(policy?: string): string {
  switch (policy) {
    case 'Free cancellation':    return '✓'
    case 'Non-refundable':       return '✕'
    case 'Partially refundable': return '!'
    default:                     return 'i'
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RoomDetail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <td style={{ padding: '8px 14px', verticalAlign: 'top', width: '33%', borderRight: '1px solid #E5E7EB' }}>
      <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{value}</div>
    </td>
  )
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <tr>
      <td style={{ padding: '5px 12px 5px 0', fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '0.4px', width: 130, verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: '5px 0', fontSize: 11, fontWeight: 600, color: NAVY, verticalAlign: 'top' }}>{value}</td>
    </tr>
  )
}

// ── Main Template ─────────────────────────────────────────────────────────────

export function HotelVoucherTemplate({ voucher: v, mode }: HotelVoucherTemplateProps) {
  const fullAddress = [v.hotel_address, v.city, v.postcode, v.country].filter(Boolean).join(', ')
  const cancStyle   = cancellationStyle(v.cancellation_policy)
  const hasAmenities = v.amenities && v.amenities.length > 0

  return (
    <div
      id="hotel-voucher-print-area"
      style={{
        fontFamily: 'Helvetica, Arial, sans-serif',
        backgroundColor: '#FFFFFF',
        maxWidth: mode === 'preview' ? '100%' : 780,
        margin: '0 auto',
        fontSize: 12,
        color: NAVY,
        lineHeight: 1.5,
      }}
    >

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', backgroundColor: NAVY, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '20px 28px', verticalAlign: 'middle' }}>
              <img
                src={WALZ_LOGO_BASE64}
                alt="Walz Travels"
                style={{ height: 44, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }}
              />
              <div style={{ color: GOLD, fontSize: 8, letterSpacing: '3px', textTransform: 'uppercase', marginTop: 5 }}>
                YOUR JOURNEY. OUR EXPERTISE.
              </div>
            </td>
            <td style={{ padding: '20px 28px', verticalAlign: 'middle', textAlign: 'right' }}>
              <div style={{
                display: 'inline-block', backgroundColor: GOLD,
                color: NAVY, fontSize: 10, fontWeight: 700,
                padding: '4px 12px', borderRadius: 4, letterSpacing: 1, marginBottom: 6,
              }}>
                REF: {v.ticket_reference}
              </div>
              <br />
              <div style={{
                display: 'inline-block', border: `1px solid ${GOLD}`,
                color: GOLD, fontSize: 9, padding: '2px 10px',
                borderRadius: 10, letterSpacing: '1px',
              }}>
                🏨  HOTEL VOUCHER
              </div>
              <div style={{ color: '#94A3B8', fontSize: 9, marginTop: 6 }}>
                Issued: {fmtDateShort(v.issue_date)}{v.issued_by ? ` · by ${v.issued_by}` : ''}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── GOLD DIVIDER ─────────────────────────────────────────────────────── */}
      <div style={{ height: 3, backgroundColor: GOLD }} />

      {/* ── CONFIRMED BANNER ─────────────────────────────────────────────────── */}
      <table style={{ width: '100%', backgroundColor: GREEN_BG, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '10px 28px', textAlign: 'center' }}>
              <span style={{ color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '2px' }}>
                ✓  BOOKING CONFIRMED
              </span>
              {v.confirmation_number && (
                <span style={{ color: GREY, fontSize: 10, marginLeft: 16 }}>
                  Confirmation: {v.confirmation_number}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ height: 1, backgroundColor: '#86EFAC' }} />

      {/* ── BODY ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px' }}>

        {/* ── HOTEL IDENTITY ──────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'top' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: NAVY, lineHeight: 1.2 }}>
                  {v.hotel_name || 'Hotel Name'}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Stars count={v.star_rating} />
                </div>
                {fullAddress && (
                  <div style={{ fontSize: 11, color: GREY, marginTop: 6 }}>{fullAddress}</div>
                )}
                <div style={{ marginTop: 6 }}>
                  {v.hotel_phone  && <span style={{ fontSize: 10, color: GREY, marginRight: 14 }}>📞 {v.hotel_phone}</span>}
                  {v.hotel_email  && <span style={{ fontSize: 10, color: GREY, marginRight: 14 }}>✉ {v.hotel_email}</span>}
                  {v.hotel_website && <span style={{ fontSize: 10, color: '#2563EB' }}>🌐 {v.hotel_website}</span>}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── DATE CARDS ──────────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            <tr>
              {/* CHECK IN */}
              <td style={{ width: '44%', padding: 0 }}>
                <div style={{
                  border: `2px solid ${NAVY}`, borderRadius: 8, padding: '14px 16px',
                  backgroundColor: LGREY, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>CHECK IN</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>{fmtDate(v.checkin_date)}</div>
                  <div style={{ fontSize: 10, color: GREY, marginTop: 4 }}>
                    From {v.checkin_time || '14:00'}
                  </div>
                </div>
              </td>

              {/* NIGHTS BUBBLE */}
              <td style={{ width: '12%', textAlign: 'center', verticalAlign: 'middle', padding: '0 8px' }}>
                <div style={{
                  display: 'inline-block', backgroundColor: NAVY, color: '#FFFFFF',
                  borderRadius: '50%', width: 52, height: 52, lineHeight: '52px',
                  textAlign: 'center', fontSize: 11, fontWeight: 700,
                }}>
                  {v.num_nights ? `${v.num_nights}N` : '—'}
                </div>
              </td>

              {/* CHECK OUT */}
              <td style={{ width: '44%', padding: 0 }}>
                <div style={{
                  border: `2px solid ${NAVY}`, borderRadius: 8, padding: '14px 16px',
                  backgroundColor: LGREY, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>CHECK OUT</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>{fmtDate(v.checkout_date)}</div>
                  <div style={{ fontSize: 10, color: GREY, marginTop: 4 }}>
                    By {v.checkout_time || '12:00'}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── ROOM DETAILS GRID ────────────────────────────────────────────────── */}
        {(v.room_type || v.bed_type || v.num_rooms || v.board_basis || v.meal_plan || v.num_guests) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${GOLD}` }}>
              Room Details
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <RoomDetail label="Room Type"   value={v.room_type} />
                  <RoomDetail label="Bed Type"    value={v.bed_type} />
                  <RoomDetail label="No. of Rooms" value={v.num_rooms ? `${v.num_rooms} room${parseInt(v.num_rooms) > 1 ? 's' : ''}` : undefined} />
                </tr>
                <tr>
                  <RoomDetail label="Board Basis" value={v.board_basis} />
                  <RoomDetail label="Meal Plan"   value={v.meal_plan} />
                  <RoomDetail label="Guests"      value={v.num_guests ? `${v.num_guests} guest${parseInt(v.num_guests) > 1 ? 's' : ''}` : undefined} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── GUEST DETAILS ────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${GOLD}` }}>
            Guest Details
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <DetailRow label="Lead Guest"     value={v.client_name} />
              <DetailRow label="Guest Names"    value={v.guest_names} />
              <DetailRow label="Email"          value={v.client_email} />
              <DetailRow label="Phone"          value={v.client_phone} />
              {v.loyalty_number && (
                <DetailRow label="Loyalty / Rewards" value={v.loyalty_number} />
              )}
            </tbody>
          </table>
        </div>

        {/* ── PRICING & CANCELLATION ───────────────────────────────────────────── */}
        {(v.total_price || v.cancellation_policy) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${GOLD}` }}>
              Rate &amp; Cancellation
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {v.total_price && (
                  <tr>
                    <td style={{ width: 130, fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '5px 12px 5px 0', verticalAlign: 'top' }}>Total Price</td>
                    <td style={{ fontSize: 16, fontWeight: 900, color: NAVY, padding: '5px 0', verticalAlign: 'top' }}>
                      {v.currency || 'GBP'} {v.total_price}
                    </td>
                  </tr>
                )}
                {v.rate_description && (
                  <tr>
                    <td style={{ width: 130, fontSize: 9, color: GREY, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '5px 12px 5px 0', verticalAlign: 'top' }}>Rate</td>
                    <td style={{ fontSize: 11, color: GREY, padding: '5px 0', verticalAlign: 'top' }}>{v.rate_description}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {v.cancellation_policy && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 6,
                backgroundColor: cancStyle.bg, border: `1px solid ${cancStyle.border}`,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{
                  display: 'inline-block', width: 20, height: 20, lineHeight: '20px',
                  textAlign: 'center', borderRadius: '50%', backgroundColor: cancStyle.color,
                  color: '#FFFFFF', fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {cancellationIcon(v.cancellation_policy)}
                </span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: cancStyle.color }}>
                    {v.cancellation_policy}
                  </div>
                  {v.cancellation_deadline && (
                    <div style={{ fontSize: 10, color: GREY, marginTop: 2 }}>
                      Deadline: {fmtDateShort(v.cancellation_deadline)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AMENITIES ────────────────────────────────────────────────────────── */}
        {hasAmenities && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${GOLD}` }}>
              Amenities Included
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {v.amenities!.map(a => (
                <span key={a} style={{
                  display: 'inline-block', padding: '4px 10px',
                  backgroundColor: LGREY, border: '1px solid #D1D5DB',
                  borderRadius: 20, fontSize: 10, color: NAVY, fontWeight: 500,
                }}>
                  {AMENITY_ICONS[a] || '•'} {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── SPECIAL REQUESTS ─────────────────────────────────────────────────── */}
        {v.special_requests && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 6,
            backgroundColor: AMBER_BG, border: `1px solid #FCD34D`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5 }}>
              ⚑  Special Requests
            </div>
            <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {v.special_requests}
            </div>
            <div style={{ fontSize: 9, color: GREY, marginTop: 5 }}>
              Requests are noted but not guaranteed — subject to hotel availability.
            </div>
          </div>
        )}

        {/* ── AGENT MESSAGE ─────────────────────────────────────────────────────── */}
        {v.agent_message && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 6,
            backgroundColor: '#FFFBF0', border: `1px solid ${GOLD}`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5 }}>
              Message from Walz Travels
            </div>
            <div style={{ fontSize: 11, color: '#78650A', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {v.agent_message}
            </div>
          </div>
        )}

        {/* ── BEFORE YOU ARRIVE ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${GOLD}` }}>
            Before You Arrive
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {v.checkin_time && (
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'top', width: 20 }}>
                    <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>✓</span>
                  </td>
                  <td style={{ padding: '4px 0', fontSize: 11, color: NAVY }}>
                    Check-in from <strong>{v.checkin_time}</strong>. Early check-in may be available — contact the hotel.
                  </td>
                </tr>
              )}
              {v.checkout_time && (
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'top', width: 20 }}>
                    <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>✓</span>
                  </td>
                  <td style={{ padding: '4px 0', fontSize: 11, color: NAVY }}>
                    Check-out by <strong>{v.checkout_time}</strong>. Late check-out is subject to availability.
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'top', width: 20 }}>
                  <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>✓</span>
                </td>
                <td style={{ padding: '4px 0', fontSize: 11, color: NAVY }}>
                  Bring this voucher and a valid <strong>photo ID</strong> for check-in.
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'top', width: 20 }}>
                  <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>✓</span>
                </td>
                <td style={{ padding: '4px 0', fontSize: 11, color: NAVY }}>
                  A credit card may be required at check-in for an incidental deposit.
                </td>
              </tr>
              {v.hotel_phone && (
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'top', width: 20 }}>
                    <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>✓</span>
                  </td>
                  <td style={{ padding: '4px 0', fontSize: 11, color: NAVY }}>
                    Hotel contact: <strong>{v.hotel_phone}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── TERMS & CONDITIONS ───────────────────────────────────────────────── */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: GREY, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
            Terms &amp; Conditions
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                'This voucher confirms your hotel reservation. Present it at check-in along with valid photo ID. This document is issued by Walz Travels Ltd.',
                'Check-in is from the stated time. Early check-in is subject to availability. Check-out must be completed by the stated time to avoid additional charges.',
                'The hotel may require a valid credit/debit card upon arrival for an incidental deposit. This is held separately from your booking payment.',
                'Special requests noted in this voucher are not guaranteed and are subject to hotel availability on arrival.',
                'Cancellation and amendment policies are as stated on this voucher. Changes outside policy terms may incur charges payable to the hotel.',
                'Walz Travels acts as an agent for the accommodation provider. We are not liable for service failures by the hotel or any force majeure events.',
                'Travel insurance is strongly recommended. By proceeding with this booking, the guest confirms acceptance of these terms in full.',
              ].map((t, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 8px 2px 0', fontSize: 9, color: GREY, fontWeight: 700, verticalAlign: 'top', width: 16 }}>
                    {i + 1}.
                  </td>
                  <td style={{ padding: '2px 0 2px 0', fontSize: 9, color: GREY, lineHeight: 1.5 }}>
                    {t}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 10, fontWeight: 500 }}>
            WhatsApp: +44 7398 753797  ·  contact@walztravels.com  ·  walztravels.com
          </div>
        </div>

      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', backgroundColor: NAVY, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '14px 28px', verticalAlign: 'middle' }}>
              <div style={{ fontSize: 9, color: '#94A3B8' }}>
                WhatsApp: +44 7398 753797  ·  contact@walztravels.com  ·  walztravels.com
              </div>
            </td>
            <td style={{ padding: '14px 28px', verticalAlign: 'middle', textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: GOLD, fontWeight: 700 }}>Powered by Jade — Walz Travels AI</div>
              <div style={{ fontSize: 9, color: '#64748B', marginTop: 2 }}>Ref: {v.ticket_reference}</div>
            </td>
          </tr>
        </tbody>
      </table>

    </div>
  )
}
