'use client'

import { useState } from 'react'
import type {
  PublicProposalDTO,
  ProposalFlight,
  ProposalHotel,
  ProposalTransfer,
  ProposalTour,
  ProposalTrain,
  ProposalFerry,
} from '../_types'
import { formatDateOnly, parseDateOnly } from '@/lib/date-utils'
import type { PortalStatus } from '@/lib/v2/portal-status'

// ── PortalDTO types ───────────────────────────────────────────────────────────
// Exported so the server component (page.tsx) can import them as type-only.

export interface PortalAcceptance {
  version: 1 | 2
  acceptedAt: string
  acceptedBy: string
  acceptedTotal: number
  deposit: number | null
  currency: string
  /** V2 only — item names only, NO prices */
  selectedGroupSummary?: Array<{ groupName: string; selectedItems: string[] }>
  /** Derived from fulfilment items and payments — always set by the server */
  portalStatus: PortalStatus
}

export type PortalDTO = PublicProposalDTO & {
  acceptance: PortalAcceptance
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const CURRENCY_SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦',
}
function currencySym(currency: string) {
  return CURRENCY_SYM[currency?.toUpperCase()] ?? (currency + ' ')
}
function fmtMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—'
  return `${currencySym(currency)}${Number(amount).toLocaleString('en-GB')}`
}

/** For date-only strings like "2024-03-15" */
function fmtDate(d?: string | null): string {
  return formatDateOnly(d, 'long')
}

/** For date-only strings, short format */
function fmtShortDate(d?: string | null): string {
  if (!d) return ''
  try {
    const { year, month, day } = parseDateOnly(d)
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}

/** For ISO timestamps from AcceptanceSnapshot */
function fmtTimestamp(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function imgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  img.style.display = 'none'
  const parent = img.parentElement
  if (parent) {
    parent.style.background = 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)'
  }
}

function buildWaLink(e164: string, text?: string): string {
  return `https://wa.me/${e164}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// ── Design tokens (as inline style values) ────────────────────────────────────
// navy:  #0f1c3f
// gold:  #b8963e
// ivory: #faf8f3
// cream: #f5f0e8
// warm-text: #5a4f3e
// muted-text: #7a6f5e

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PortalStatus }) {
  const config: Record<PortalStatus, { label: string; bg: string; color: string }> = {
    ACCEPTED:            { label: '✓ Trip Accepted',         bg: '#1a3a1a', color: '#4ade80' },
    PAYMENT_RECEIVED:    { label: '✓ Payment Received',      bg: '#1a2e1a', color: '#86efac' },
    BOOKING_IN_PROGRESS: { label: '⏳ Booking In Progress',   bg: '#2a2a0a', color: '#fde047' },
    TRIP_CONFIRMED:      { label: '✓ Trip Confirmed',        bg: '#0a2a0a', color: '#4ade80' },
    ACTION_REQUIRED:     { label: '⚠ Action Required',       bg: '#2a0a0a', color: '#f87171' },
    REVISION_PENDING:    { label: '📋 Updated Proposal Ready', bg: '#1a1a3a', color: '#a5b4fc' },
  }
  const c = config[status]
  return (
    <span style={{
      display: 'inline-block',
      background: c.bg,
      color: c.color,
      fontWeight: 700,
      fontSize: 13,
      padding: '6px 14px',
      borderRadius: 20,
      letterSpacing: '0.03em',
    }}>
      {c.label}
    </span>
  )
}

function SectionHeading({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-xl" role="img" aria-hidden="true">{icon}</span>
      <h2
        className="text-sm font-semibold tracking-widest uppercase"
        style={{ color: '#0f1c3f' }}
      >
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: '#b8963e', opacity: 0.35 }} />
    </div>
  )
}

function FlightCard({ f }: { f: ProposalFlight }) {
  const cityRoute = [f.fromCity ?? f.from, f.toCity ?? f.to].filter(Boolean).join(' → ')
  const codeRoute = [f.from, f.to].filter(Boolean).join(' → ')
  const route = cityRoute || codeRoute

  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: '#faf8f3', borderColor: '#e8dfd0' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {f.airline && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {f.airlineLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.airlineLogoUrl}
                  alt={f.airline}
                  className="h-5 w-auto object-contain"
                  loading="lazy"
                  onError={imgFallback}
                />
              )}
              <span className="font-medium text-sm" style={{ color: '#0f1c3f' }}>
                {f.airline}
              </span>
              {f.flightNumber && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono"
                  style={{ background: '#e8dfd0', color: '#5a4f3e' }}
                >
                  {f.flightNumber}
                </span>
              )}
            </div>
          )}
          {route && (
            <p className="text-base font-semibold" style={{ color: '#0f1c3f' }}>
              {route}
            </p>
          )}
        </div>
        {f.class && (
          <span
            className="text-xs font-medium px-3 py-1 rounded-full shrink-0"
            style={{ background: '#0f1c3f', color: '#faf8f3' }}
          >
            {f.class}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: '#7a6f5e' }}>
        {f.date && <span>{fmtDate(f.date)}</span>}
        {f.departureTime && <span>Dep {f.departureTime}</span>}
        {f.arrivalTime && <span>Arr {f.arrivalTime}</span>}
        {f.stops != null && (
          <span>{f.stops === 0 ? 'Non-stop' : `${f.stops} stop${f.stops !== 1 ? 's' : ''}`}</span>
        )}
      </div>
      {/* pnr intentionally omitted from portal display */}
    </div>
  )
}

function HotelCard({ h }: { h: ProposalHotel }) {
  const img = h.images?.[0]
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: '#e8dfd0' }}
    >
      {img && (
        <div
          className="h-40 w-full"
          style={{ background: 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={h.name ?? 'Hotel'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={imgFallback}
          />
        </div>
      )}
      <div className="p-5" style={{ background: '#faf8f3' }}>
        {h.name && (
          <p className="font-semibold text-base mb-0.5" style={{ color: '#0f1c3f' }}>
            {h.name}
          </p>
        )}
        {h.location && (
          <p className="text-sm mb-3" style={{ color: '#7a6f5e' }}>{h.location}</p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: '#5a4f3e' }}>
          {h.checkIn && <span>Check-in: {fmtDate(h.checkIn)}</span>}
          {h.checkOut && <span>Check-out: {fmtDate(h.checkOut)}</span>}
          {h.nights != null && <span>{h.nights} night{h.nights !== 1 ? 's' : ''}</span>}
          {h.roomType && <span>{h.roomType}</span>}
          {h.mealPlan && <span>{h.mealPlan}</span>}
        </div>
      </div>
    </div>
  )
}

function TransferCard({ t }: { t: ProposalTransfer }) {
  const img = t.images?.[0]
  const route = [t.from, t.to].filter(Boolean).join(' → ')
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: '#e8dfd0' }}
    >
      {img && (
        <div
          className="h-32 w-full"
          style={{ background: 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt="Transfer"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={imgFallback}
          />
        </div>
      )}
      <div className="p-4" style={{ background: '#faf8f3' }}>
        {t.type && (
          <p className="font-medium text-sm mb-1" style={{ color: '#0f1c3f' }}>
            {t.type}
          </p>
        )}
        {route && (
          <p className="text-sm mb-2" style={{ color: '#5a4f3e' }}>{route}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#7a6f5e' }}>
          {t.date && <span>{fmtDate(t.date)}</span>}
          {t.vehicle && <span>{t.vehicle}</span>}
        </div>
      </div>
    </div>
  )
}

function TourCard({ t }: { t: ProposalTour }) {
  const img = t.images?.[0]
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: '#e8dfd0' }}
    >
      {img && (
        <div
          className="h-36 w-full"
          style={{ background: 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={t.name ?? 'Experience'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={imgFallback}
          />
        </div>
      )}
      <div className="p-4" style={{ background: '#faf8f3' }}>
        {t.name && (
          <p className="font-semibold text-sm mb-0.5" style={{ color: '#0f1c3f' }}>
            {t.name}
          </p>
        )}
        {t.location && (
          <p className="text-xs mb-2" style={{ color: '#7a6f5e' }}>{t.location}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#5a4f3e' }}>
          {t.date && <span>{fmtDate(t.date)}</span>}
          {t.time && <span>{t.time}</span>}
          {t.duration && <span>{t.duration}</span>}
          {t.provider && <span>{t.provider}</span>}
        </div>
      </div>
    </div>
  )
}

function TrainCard({ t }: { t: ProposalTrain }) {
  const img = t.images?.[0] ?? t.image
  const route = [t.from, t.to].filter(Boolean).join(' → ')
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: '#e8dfd0' }}
    >
      {img && (
        <div
          className="h-28 w-full"
          style={{ background: 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt="Train"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={imgFallback}
          />
        </div>
      )}
      <div className="p-4" style={{ background: '#faf8f3' }}>
        {route && (
          <p className="font-medium text-sm mb-1" style={{ color: '#0f1c3f' }}>{route}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#5a4f3e' }}>
          {t.date && <span>{fmtDate(t.date)}</span>}
          {t.departureTime && <span>Dep {t.departureTime}</span>}
          {t.arrivalTime && <span>Arr {t.arrivalTime}</span>}
          {t.trainNumber && <span>No. {t.trainNumber}</span>}
          {t.class && <span>{t.class}</span>}
          {t.provider && <span>{t.provider}</span>}
        </div>
      </div>
    </div>
  )
}

function FerryCard({ f }: { f: ProposalFerry }) {
  const img = f.images?.[0] ?? f.image
  const route = [f.from, f.to].filter(Boolean).join(' → ')
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: '#e8dfd0' }}
    >
      {img && (
        <div
          className="h-28 w-full"
          style={{ background: 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt="Ferry"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={imgFallback}
          />
        </div>
      )}
      <div className="p-4" style={{ background: '#faf8f3' }}>
        {route && (
          <p className="font-medium text-sm mb-1" style={{ color: '#0f1c3f' }}>{route}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#5a4f3e' }}>
          {f.date && <span>{fmtDate(f.date)}</span>}
          {f.departureTime && <span>Dep {f.departureTime}</span>}
          {f.arrivalTime && <span>Arr {f.arrivalTime}</span>}
          {f.operator && <span>{f.operator}</span>}
          {f.vessel && <span>{f.vessel}</span>}
          {f.class && <span>{f.class}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PortalPage({ portal }: { portal: PortalDTO }) {
  const { acceptance, contact } = portal
  const [refCopied, setRefCopied] = useState(false)

  const balance =
    acceptance.acceptedTotal != null && acceptance.deposit != null
      ? acceptance.acceptedTotal - acceptance.deposit
      : null

  const hasFlights   = portal.flights.length > 0
  const hasHotels    = portal.hotels.length > 0
  const hasTransfers = portal.transfers.length > 0
  const hasTours     = portal.tours.length > 0
  const hasTrains    = (portal.trains?.length ?? 0) > 0
  const hasFerries   = (portal.ferries?.length ?? 0) > 0
  const hasRail      = hasTrains || hasFerries

  const waText = `Hi Walz Travels, I'm referencing my booking ${portal.referenceNumber}. `

  function copyRef() {
    navigator.clipboard.writeText(portal.referenceNumber).then(() => {
      setRefCopied(true)
      setTimeout(() => setRefCopied(false), 2000)
    }).catch(() => {
      // Clipboard API not available — silently ignore
    })
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f0e8' }}>

      {/* ── Sticky top bar ── */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(15,28,63,0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: 'rgba(184,150,62,0.2)',
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/walz-logo.png"
            alt="Walz Travels"
            className="h-7 w-auto object-contain"
            onError={imgFallback}
          />
          <button
            onClick={copyRef}
            className="text-xs px-3 py-1 rounded-full font-mono transition-colors"
            style={{
              background: refCopied ? 'rgba(22,163,74,0.9)' : 'rgba(184,150,62,0.15)',
              color: refCopied ? '#fff' : '#b8963e',
              border: '1px solid',
              borderColor: refCopied ? 'rgba(22,163,74,0.6)' : 'rgba(184,150,62,0.4)',
            }}
            title="Copy booking reference"
          >
            {refCopied ? '✓ Copied' : portal.referenceNumber}
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="relative">
        <div
          className="h-64 sm:h-80 lg:h-96 overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #0f1c3f 0%, #1a3060 60%, #0f1c3f 100%)' }}
        >
          {portal.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portal.coverImage}
              alt={portal.destination ?? 'Your trip'}
              className="w-full h-full object-cover absolute inset-0"
              loading="lazy"
              onError={imgFallback}
            />
          )}
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, rgba(15,28,63,0.25) 0%, rgba(15,28,63,0.72) 100%)',
            }}
          />
        </div>

        {/* Hero text — positioned over the gradient */}
        <div
          className="absolute inset-0 flex flex-col justify-end px-6 pb-7"
          style={{ maxWidth: '48rem', margin: '0 auto', left: 0, right: 0 }}
        >
          {/* MY TRIP badge */}
          <span
            className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest px-3 py-1 rounded-full uppercase mb-3 self-start"
            style={{ background: '#b8963e', color: '#fff' }}
          >
            ✦ My Trip
          </span>

          {portal.destination && (
            <h1
              className="text-3xl sm:text-4xl font-bold text-white mb-2 leading-tight"
              style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
            >
              {portal.destination}
            </h1>
          )}

          <div
            className="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-3"
            style={{ color: 'rgba(255,255,255,0.8)' }}
          >
            {portal.startDate && portal.endDate && (
              <span>
                {fmtShortDate(portal.startDate)} — {fmtShortDate(portal.endDate)}
              </span>
            )}
            {portal.numberOfTravellers > 0 && (
              <span>
                {portal.numberOfTravellers} traveller{portal.numberOfTravellers !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Status badge — derived from fulfilment items and payments */}
          <StatusBadge status={portal.acceptance.portalStatus} />
        </div>
      </div>

      {/* ── REVISION_PENDING banner ── */}
      {portal.acceptance.portalStatus === 'REVISION_PENDING' && (
        <div style={{ background: '#1a1a3a', borderBottom: '1px solid #3730a3', padding: '18px 24px' }}>
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 15, margin: 0 }}>
                📋 Your advisor has sent an updated proposal
              </p>
              <p style={{ color: 'rgba(165,180,252,0.7)', fontSize: 13, marginTop: 4 }}>
                Review the changes and accept the updated itinerary to continue with your trip.
              </p>
            </div>
            <a
              href={`/itinerary/${portal.referenceNumber}`}
              style={{ flexShrink: 0, background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 10, textDecoration: 'none', display: 'inline-block' }}
            >
              Review Updated Proposal →
            </a>
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">

        {/* 1. Reference */}
        <section
          className="rounded-2xl border p-7 text-center"
          style={{ background: '#faf8f3', borderColor: '#e8dfd0' }}
        >
          <p
            className="text-xs tracking-widest uppercase mb-2"
            style={{ color: '#7a6f5e' }}
          >
            Booking Reference
          </p>
          <p
            className="text-3xl sm:text-4xl font-mono font-bold mb-2"
            style={{ color: '#0f1c3f' }}
          >
            {portal.referenceNumber}
          </p>
          <p className="text-xs mb-5" style={{ color: '#7a6f5e' }}>
            Quote this reference in all correspondence with Walz Travels.
          </p>
          <button
            onClick={copyRef}
            className="inline-flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl font-medium transition-colors"
            style={{
              background: refCopied ? '#16a34a' : '#0f1c3f',
              color: '#fff',
            }}
          >
            {refCopied ? '✓ Copied to clipboard' : 'Copy Reference'}
          </button>
        </section>

        {/* 2. Accepted Configuration */}
        <section>
          <SectionHeading label="Your Booking" icon="✅" />
          <div
            className="rounded-2xl border p-6 space-y-5"
            style={{ background: '#faf8f3', borderColor: '#e8dfd0' }}
          >
            {/* Financial summary tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl p-4 text-center" style={{ background: '#f0ebe0' }}>
                <p className="text-xs tracking-widest uppercase mb-1.5" style={{ color: '#7a6f5e' }}>
                  Trip Total
                </p>
                <p className="text-xl font-bold" style={{ color: '#0f1c3f' }}>
                  {fmtMoney(acceptance.acceptedTotal, acceptance.currency)}
                </p>
              </div>

              {acceptance.deposit != null && (
                <div className="rounded-xl p-4 text-center" style={{ background: '#f0ebe0' }}>
                  <p className="text-xs tracking-widest uppercase mb-1.5" style={{ color: '#7a6f5e' }}>
                    Deposit
                  </p>
                  <p className="text-xl font-bold" style={{ color: '#0f1c3f' }}>
                    {fmtMoney(acceptance.deposit, acceptance.currency)}
                  </p>
                </div>
              )}

              {balance != null && (
                <div className="rounded-xl p-4 text-center" style={{ background: '#f0ebe0' }}>
                  <p className="text-xs tracking-widest uppercase mb-1.5" style={{ color: '#7a6f5e' }}>
                    Balance
                  </p>
                  <p className="text-xl font-bold" style={{ color: '#b8963e' }}>
                    {fmtMoney(balance, acceptance.currency)}
                  </p>
                </div>
              )}
            </div>

            {/* V2 selected groups — item names only, no prices */}
            {acceptance.selectedGroupSummary && acceptance.selectedGroupSummary.length > 0 && (
              <div className="pt-4 border-t" style={{ borderColor: '#e8dfd0' }}>
                <p
                  className="text-xs tracking-widest uppercase mb-4"
                  style={{ color: '#7a6f5e' }}
                >
                  Your Selections
                </p>
                <div className="space-y-4">
                  {acceptance.selectedGroupSummary.map((group, i) => (
                    <div key={i}>
                      <p className="text-sm font-semibold mb-1.5" style={{ color: '#0f1c3f' }}>
                        {group.groupName}
                      </p>
                      <ul className="space-y-1">
                        {group.selectedItems.map((item, j) => (
                          <li
                            key={j}
                            className="flex items-center gap-2 text-sm"
                            style={{ color: '#5a4f3e' }}
                          >
                            <svg
                              className="w-3.5 h-3.5 shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              aria-hidden="true"
                              style={{ color: '#16a34a' }}
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-5.121-5.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment note */}
            <div
              className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
              style={{
                background: '#fff8ed',
                borderLeft: '3px solid #b8963e',
                color: '#7a6f5e',
              }}
            >
              <span aria-hidden="true">💬</span>
              <span>
                Payment details and due dates — contact your Walz Travels advisor for your schedule.
              </span>
            </div>
          </div>
        </section>

        {/* 3. Flights */}
        {hasFlights && (
          <section>
            <SectionHeading label="Flights" icon="✈️" />
            <div className="space-y-4">
              {portal.flights.map((f, i) => (
                <FlightCard key={i} f={f} />
              ))}
            </div>
          </section>
        )}

        {/* 4. Hotels */}
        {hasHotels && (
          <section>
            <SectionHeading label="Accommodation" icon="🏨" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {portal.hotels.map((h, i) => (
                <HotelCard key={i} h={h} />
              ))}
            </div>
          </section>
        )}

        {/* 5. Transfers */}
        {hasTransfers && (
          <section>
            <SectionHeading label="Transfers" icon="🚘" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portal.transfers.map((t, i) => (
                <TransferCard key={i} t={t} />
              ))}
            </div>
          </section>
        )}

        {/* 6. Tours / Experiences */}
        {hasTours && (
          <section>
            <SectionHeading label="Experiences" icon="🗺️" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portal.tours.map((t, i) => (
                <TourCard key={i} t={t} />
              ))}
            </div>
          </section>
        )}

        {/* 7. Trains & Ferries */}
        {hasRail && (
          <section>
            <SectionHeading label="Trains & Ferries" icon="🚆" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portal.trains?.map((t, i) => (
                <TrainCard key={i} t={t} />
              ))}
              {portal.ferries?.map((f, i) => (
                <FerryCard key={i} f={f} />
              ))}
            </div>
          </section>
        )}

        {/* 8. eSIM */}
        <section>
          <SectionHeading label="eSIM & Connectivity" icon="📱" />
          <div
            className="rounded-2xl border-2 border-dashed p-10 text-center"
            style={{ borderColor: 'rgba(184,150,62,0.4)', background: '#faf8f3' }}
          >
            <div className="text-5xl mb-4" aria-hidden="true">📶</div>
            <p className="font-semibold mb-2" style={{ color: '#0f1c3f' }}>
              Your eSIM details will be sent before departure
            </p>
            <p className="text-sm" style={{ color: '#7a6f5e' }}>
              Contact your advisor to check on the status of your eSIM activation.
            </p>
          </div>
        </section>

        {/* 9. Documents */}
        <section>
          <SectionHeading label="Travel Documents" icon="📄" />
          <div
            className="rounded-2xl border-2 border-dashed p-10 text-center"
            style={{ borderColor: 'rgba(184,150,62,0.4)', background: '#faf8f3' }}
          >
            <div className="text-5xl mb-4" aria-hidden="true">📁</div>
            <p className="font-semibold mb-2" style={{ color: '#0f1c3f' }}>
              Documents will be shared here when ready
            </p>
            <p className="text-sm" style={{ color: '#7a6f5e' }}>
              Hotel vouchers, flight tickets, and your complete travel pack will appear here
              once your bookings are confirmed.
            </p>
          </div>
        </section>

        {/* 10. Contact */}
        <section>
          <SectionHeading label="Contact Your Advisor" icon="💬" />
          <div
            className="rounded-2xl border p-7"
            style={{ background: '#faf8f3', borderColor: '#e8dfd0' }}
          >
            <p className="text-sm text-center mb-6" style={{ color: '#5a4f3e' }}>
              Your Walz Travels advisor is here to help — any questions, any time.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={buildWaLink(contact.globalWhatsAppE164, waText)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: '#25D366', color: '#fff' }}
              >
                {/* WhatsApp icon */}
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.553 4.116 1.523 5.845L.057 23.5l5.816-1.476A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.853 0-3.587-.5-5.082-1.37l-.364-.214-3.771.957.99-3.661-.237-.377A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
                WhatsApp
              </a>

              <a
                href={`mailto:${contact.email}?subject=${encodeURIComponent(`My Booking ${portal.referenceNumber}`)}`}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: '#0f1c3f', color: '#faf8f3' }}
              >
                {/* Email icon */}
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                Email Us
              </a>
            </div>

            {/* Nigeria WhatsApp — show as secondary */}
            <p className="text-center text-xs mt-4" style={{ color: '#9a8f7e' }}>
              Nigeria:{' '}
              <a
                href={buildWaLink(contact.nigeriaWhatsAppE164, waText)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: '#7a6f5e' }}
              >
                {contact.nigeriaWhatsAppDisplay}
              </a>
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-6 border-t" style={{ borderColor: '#e8dfd0' }}>
          <p className="text-xs" style={{ color: '#9a8f7e' }}>
            © {new Date().getFullYear()} Walz Travels · {portal.referenceNumber}
          </p>
        </footer>

      </div>
    </div>
  )
}
