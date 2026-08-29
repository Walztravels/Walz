'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicProposalDTO, ProposalFlight, ProposalHotel, ProposalTransfer, ProposalTour, ProposalDay, ProposalTrain, ProposalFerry } from './_types'
import { formatDateOnly, parseDateOnly } from '@/lib/date-utils'
import type { PublicOptionGroup, PublicOptionItem, ClientSelectionPayload, SelectedItemInput } from '@/lib/v2/types'
import { calculateTripPrice } from '@/lib/v2/pricing'

// ── Utilities ─────────────────────────────────────────────────────────────────

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦' }
function sym(currency: string) { return SYM[currency?.toUpperCase()] ?? (currency + ' ') }

function fmtMoney(amount: number | null | undefined, currency: string) {
  if (amount == null) return ''
  return `${sym(currency)}${Number(amount).toLocaleString('en-GB')}`
}

function fmtDate(d?: string | null) {
  // formatDateOnly uses local-time Date constructor to avoid UTC midnight shift
  return formatDateOnly(d, 'long')
}

function fmtShortDate(d?: string | null) {
  if (!d) return ''
  try {
    const { year, month, day } = parseDateOnly(d)
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

function imgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  img.style.display = 'none'
  const parent = img.parentElement
  if (parent) {
    parent.style.background = 'linear-gradient(135deg, #e8e0d4 0%, #d4c9b8 100%)'
  }
}

// ── Section nav IDs ────────────────────────────────────────────────────────────

const SECTIONS = {
  overview:    'section-overview',
  flights:     'section-flights',
  stay:        'section-stay',
  experiences: 'section-experiences',
  transport:   'section-transport',
  itinerary:   'section-itinerary',
  investment:  'section-investment',
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  // Offset for fixed 64px header
  const top = el.getBoundingClientRect().top + window.scrollY - 72
  window.scrollTo({ top, behavior: 'smooth' })
}

// ── Day icon helper ────────────────────────────────────────────────────────────

function activityIcon(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('flight') || t.includes('arrival') || t.includes('departure') || t.includes('airport')) return '✈'
  if (t.includes('hotel') || t.includes('check-in') || t.includes('check in') || t.includes('accommodation')) return '🏨'
  if (t.includes('transfer') || t.includes('taxi') || t.includes('car')) return '🚘'
  if (t.includes('tour') || t.includes('cruise') || t.includes('excursion')) return '🗺'
  if (t.includes('dinner') || t.includes('lunch') || t.includes('breakfast') || t.includes('restaurant') || t.includes('food') || t.includes('meal')) return '🍽'
  if (t.includes('train') || t.includes('rail')) return '🚆'
  if (t.includes('ferry') || t.includes('boat') || t.includes('yacht')) return '⛴'
  if (t.includes('museum') || t.includes('gallery') || t.includes('art')) return '🏛'
  if (t.includes('beach') || t.includes('swim') || t.includes('pool')) return '🏖'
  if (t.includes('shopping')) return '🛍'
  if (t.includes('spa') || t.includes('wellness') || t.includes('massage')) return '💆'
  return '📍'
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────────

function ProposalHeader({ proposal, compact, onAccept }: { proposal: PublicProposalDTO; compact: boolean; onAccept: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { label: 'Overview',     id: SECTIONS.overview,    show: true },
    { label: 'Flights',      id: SECTIONS.flights,     show: proposal.flights.length > 0 },
    { label: 'Stay',         id: SECTIONS.stay,        show: proposal.hotels.length > 0 },
    { label: 'Experiences',  id: SECTIONS.experiences, show: proposal.tours.length > 0 || proposal.transfers.length > 0 },
    { label: 'Transport',    id: SECTIONS.transport,   show: (proposal.trains?.length ?? 0) > 0 || (proposal.ferries?.length ?? 0) > 0 },
    { label: 'Itinerary',    id: SECTIONS.itinerary,   show: proposal.days.length > 0 },
    { label: 'Investment',   id: SECTIONS.investment,  show: !!(proposal.totalPrice || proposal.priceBreakdown.length > 0) },
  ].filter(n => n.show)

  const waLink = `https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to discuss my itinerary ${proposal.referenceNumber}.`)}`

  return (
    <header
      className="proposal-header-blur fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: compact ? 'rgba(11,31,58,0.97)' : 'rgba(11,31,58,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: compact ? '1px solid rgba(201,168,76,0.15)' : 'none',
        padding: compact ? '10px 24px' : '18px 24px',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/walz-logo.png" alt="Walz Travels" style={{ height: compact ? 28 : 34, flexShrink: 0 }} />

        {/* Trip name (desktop) */}
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="hidden md:block">
          {proposal.title}
        </span>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s, background 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fff'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* Accept CTA */}
        {(proposal.status === 'proposal' || proposal.status === 'revision_sent') && proposal.approvalToken && (
          <button
            onClick={() => onAccept()}
            className="hidden sm:flex items-center gap-2"
            style={{ background: '#C9A84C', color: '#0B1F3A', fontWeight: 700, fontSize: 13, padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Review & Accept →
          </button>
        )}

        {/* Mobile menu */}
        <button
          className="lg:hidden"
          style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          onClick={() => setMenuOpen(m => !m)}
          aria-label="Menu"
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{ background: '#0B1F3A', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 24px 16px' }}>
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => { scrollTo(n.id); setMenuOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', color: 'rgba(255,255,255,0.8)', fontSize: 15, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              {n.label}
            </button>
          ))}
          {(proposal.status === 'proposal' || proposal.status === 'revision_sent') && proposal.approvalToken && (
            <button
              onClick={() => { setMenuOpen(false); onAccept() }}
              style={{ display: 'block', width: '100%', marginTop: 12, background: '#C9A84C', color: '#0B1F3A', fontWeight: 700, padding: '12px 0', borderRadius: 10, textAlign: 'center', border: 'none', cursor: 'pointer' }}
            >
              Review & Accept →
            </button>
          )}
        </div>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────────────────

function ProposalHero({ proposal }: { proposal: PublicProposalDTO }) {
  return (
    <div style={{ position: 'relative', height: 600, minHeight: 400 }}>
      {/* Background image */}
      {proposal.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proposal.coverImage}
          alt={proposal.title}
          onError={imgFallback}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0B1F3A 0%, #1a3a6b 50%, #0B1F3A 100%)' }} />
      )}

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(11,31,58,0.3) 0%, rgba(11,31,58,0.2) 40%, rgba(11,31,58,0.85) 100%)' }} />

      {/* Content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '60px 32px 56px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ maxWidth: 860 }}>
          {proposal.clientName && (
            <p style={{ color: '#C9A84C', fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              Prepared exclusively for {proposal.clientName}
            </p>
          )}
          <h1 style={{ color: '#fff', fontSize: 'clamp(32px,5vw,58px)', fontWeight: 700, lineHeight: 1.1, marginBottom: 16, fontFamily: '"Playfair Display", Georgia, serif' }}>
            {proposal.title}
          </h1>
          {(proposal.startDate || proposal.endDate || proposal.destination) && (
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 18, fontWeight: 400 }}>
              {proposal.destination && <span>{proposal.destination}</span>}
              {proposal.destination && (proposal.startDate || proposal.endDate) && <span style={{ opacity: 0.5, margin: '0 10px' }}>·</span>}
              {proposal.startDate && <span>{fmtShortDate(proposal.startDate)}</span>}
              {proposal.startDate && proposal.endDate && <span style={{ margin: '0 8px', opacity: 0.5 }}>—</span>}
              {proposal.endDate && <span>{fmtDate(proposal.endDate)}</span>}
            </p>
          )}
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Walz Travels
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INTRODUCTION + GLANCE
// ─────────────────────────────────────────────────────────────────────────────

function ProposalIntro({ proposal }: { proposal: PublicProposalDTO }) {
  const glanceItems = [
    proposal.duration && { icon: '🗓', value: `${proposal.duration} Nights`, label: 'Duration' },
    proposal.numberOfTravellers > 0 && { icon: '👤', value: `${proposal.numberOfTravellers} Traveller${proposal.numberOfTravellers > 1 ? 's' : ''}`, label: 'Guests' },
    proposal.tripType && { icon: '✨', value: proposal.tripType, label: 'Type' },
    proposal.hotels.length > 0 && { icon: '🏨', value: `${proposal.hotels.length} Hotel${proposal.hotels.length > 1 ? 's' : ''}`, label: 'Stays' },
    proposal.flights.length > 0 && { icon: '✈', value: `${proposal.flights.length} Flight${proposal.flights.length > 1 ? 's' : ''}`, label: 'Flights' },
    proposal.tours.length > 0 && { icon: '🎭', value: `${proposal.tours.length} Experience${proposal.tours.length > 1 ? 's' : ''}`, label: 'Experiences' },
  ].filter(Boolean) as Array<{ icon: string; value: string; label: string }>

  return (
    <div id={SECTIONS.overview} style={{ padding: '0 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', transform: 'translateY(-60px)' }}>
        {/* Introduction card */}
        <div style={{ background: '#fff', borderRadius: 24, padding: '48px 52px', boxShadow: '0 24px 80px rgba(11,31,58,0.12)', marginBottom: 0 }}>
          <p style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>
            Your Journey
          </p>
          <h2 style={{ color: '#0B1F3A', fontSize: 'clamp(24px,3vw,36px)', fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', lineHeight: 1.2, marginBottom: 20 }}>
            {proposal.title}
          </h2>

          {proposal.overview && (
            <p style={{ color: '#4b5563', fontSize: 16, lineHeight: 1.7, marginBottom: 28, maxWidth: 680 }}>
              {proposal.overview}
            </p>
          )}

          {/* Date strip */}
          {(proposal.startDate || proposal.endDate) && (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', paddingTop: 24, borderTop: '1px solid #f0ede8' }}>
              {proposal.startDate && (
                <div>
                  <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Departure</p>
                  <p style={{ color: '#0B1F3A', fontSize: 16, fontWeight: 600 }}>{fmtDate(proposal.startDate)}</p>
                </div>
              )}
              {proposal.endDate && (
                <div>
                  <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Return</p>
                  <p style={{ color: '#0B1F3A', fontSize: 16, fontWeight: 600 }}>{fmtDate(proposal.endDate)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Glance items */}
        {glanceItems.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 16 }}>
            {glanceItems.map((item, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '20px 16px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: 24, display: 'block', marginBottom: 8 }}>{item.icon}</span>
                <p style={{ color: '#0B1F3A', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{item.value}</p>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 500 }}>{item.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

function Section({ id, eyebrow, title, subtitle, children, alt }: {
  id?: string; eyebrow: string; title: string; subtitle?: string
  children: React.ReactNode; alt?: boolean
}) {
  return (
    <section id={id} style={{ background: alt ? '#f5f2ed' : '#FAFAF8', padding: '80px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
          {eyebrow}
        </p>
        <h2 style={{ color: '#0B1F3A', fontSize: 'clamp(26px,3vw,40px)', fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', marginBottom: subtitle ? 8 : 40, lineHeight: 1.15 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ color: '#6b7280', fontSize: 16, lineHeight: 1.65, marginBottom: 40, maxWidth: 640 }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FLIGHTS
// ─────────────────────────────────────────────────────────────────────────────

function FlightCard({ f, currency }: { f: ProposalFlight; currency: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', marginBottom: 16 }}>
      {/* Airline header */}
      <div style={{ background: '#0B1F3A', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Logo or initials badge */}
          {f.airlineLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={f.airlineLogoUrl}
              alt={f.airline || 'Airline'}
              className="h-7 w-auto max-w-[60px] object-contain rounded bg-white px-1"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              style={{ flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#0B1F3A', fontSize: 11, fontWeight: 800 }}>
                {(f.airline || 'FL').slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{f.airline || 'Flight'}</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }}>
              {f.flightNumber}{f.flightNumber && f.class ? ' · ' : ''}{f.class}
            </p>
          </div>
        </div>
        {(f.date || f.clientPrice != null) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, marginLeft: 12 }}>
            {f.date && <p style={{ color: '#C9A84C', fontSize: 13, fontWeight: 600 }}>{fmtDate(f.date)}</p>}
            {f.clientPrice != null && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 700 }}>{fmtMoney(f.clientPrice, currency)}</p>}
          </div>
        )}
      </div>

      {/* Route */}
      <div style={{ padding: '28px 24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          {/* Departure */}
          <div style={{ textAlign: 'left', flex: 1 }}>
            <p style={{ color: '#0B1F3A', fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{f.from || '—'}</p>
            {f.fromCity && <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>{f.fromCity}</p>}
            {f.departureTime && <p style={{ color: '#4b5563', fontSize: 14, fontWeight: 600, marginTop: 6 }}>{f.departureTime}</p>}
          </div>

          {/* Route line */}
          <div style={{ flex: 2, textAlign: 'center', position: 'relative' }}>
            <div style={{ height: 1, background: '#e5e7eb', position: 'relative', margin: '0 12px' }}>
              {f.stops === 0 && (
                <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 20 }}>✈</span>
              )}
            </div>
            <p style={{ color: '#9ca3af', fontSize: 11, marginTop: 12 }}>
              {f.stops === 0 ? 'Direct' : f.stops != null ? `${f.stops} stop${f.stops > 1 ? 's' : ''}` : ''}
            </p>
          </div>

          {/* Arrival */}
          <div style={{ textAlign: 'right', flex: 1 }}>
            <p style={{ color: '#0B1F3A', fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{f.to || '—'}</p>
            {f.toCity && <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>{f.toCity}</p>}
            {f.arrivalTime && <p style={{ color: '#4b5563', fontSize: 14, fontWeight: 600, marginTop: 6 }}>{f.arrivalTime}</p>}
          </div>
        </div>

        {/* Details row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {f.pnr && (
            <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, fontFamily: 'monospace' }}>
              PNR: {f.pnr}
            </span>
          )}
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 13, padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}
          >
            {open ? 'Hide details ↑' : 'View details ↓'}
          </button>
        </div>

        {/* Aircraft image — tasteful secondary visual */}
        {f.imageUrl && (
          <div style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', height: 80, position: 'relative', background: '#f5f2ed' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.imageUrl}
              alt="Aircraft"
              onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none' }}
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%' }}
            />
          </div>
        )}

        {/* Expanded details */}
        {open && (
          <div style={{ marginTop: 16, padding: '16px', background: '#fafaf8', borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 12 }}>
            {f.class && <div><p style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>Class</p><p style={{ color: '#0B1F3A', fontSize: 14, fontWeight: 600 }}>{f.class}</p></div>}
            {f.flightNumber && <div><p style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>Flight</p><p style={{ color: '#0B1F3A', fontSize: 14, fontWeight: 600 }}>{f.flightNumber}</p></div>}
            {f.date && <div><p style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>Date</p><p style={{ color: '#0B1F3A', fontSize: 14, fontWeight: 600 }}>{fmtDate(f.date)}</p></div>}
          </div>
        )}
      </div>
    </div>
  )
}

function ProposalFlights({ proposal }: { proposal: PublicProposalDTO }) {
  if (proposal.flights.length === 0) return null
  return (
    <Section id={SECTIONS.flights} eyebrow="Getting There" title="Your Flights">
      {proposal.flights.map((f, i) => (
        <FlightCard key={i} f={f} currency={proposal.currency} />
      ))}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HOTELS
// ─────────────────────────────────────────────────────────────────────────────

function HotelCard({ h, currency }: { h: ProposalHotel; currency: string }) {
  const hasImages = h.images && h.images.length > 0
  const [activeImg, setActiveImg] = useState(0)

  return (
    <div style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 24 }}>
      <div className="hotel-card-grid" style={{ display: 'grid', gridTemplateColumns: hasImages ? '1fr 1fr' : '1fr', minHeight: 300 }}>
        {/* Image */}
        {hasImages && (
          <div style={{ position: 'relative', overflow: 'hidden', background: '#e8e0d4', aspectRatio: '4/3', minHeight: 260 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={h.images![activeImg]}
              alt={h.name || 'Hotel'}
              onError={imgFallback}
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {h.images!.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                {h.images!.slice(0, 4).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImg(idx)}
                    style={{
                      width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: idx === activeImg ? '#C9A84C' : 'rgba(255,255,255,0.6)',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Details */}
        <div style={{ padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {h.location && (
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {h.location}
            </p>
          )}
          <h3 style={{ color: '#0B1F3A', fontSize: 24, fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', lineHeight: 1.2, marginBottom: 20 }}>
            {h.name || 'Accommodation'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 20 }}>
            {h.checkIn && (
              <div>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>CHECK-IN</p>
                <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{fmtDate(h.checkIn)}</p>
              </div>
            )}
            {h.checkOut && (
              <div>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>CHECK-OUT</p>
                <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{fmtDate(h.checkOut)}</p>
              </div>
            )}
            {h.nights != null && (
              <div>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>NIGHTS</p>
                <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{h.nights}</p>
              </div>
            )}
            {h.roomType && (
              <div>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>ROOM</p>
                <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{h.roomType}</p>
              </div>
            )}
            {h.mealPlan && (
              <div>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>MEALS</p>
                <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{h.mealPlan}</p>
              </div>
            )}
            {h.clientPrice != null && (
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f5f2ed', paddingTop: 14, marginTop: 4 }}>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>PRICE</p>
                <p style={{ color: '#0B1F3A', fontSize: 16, fontWeight: 700 }}>{fmtMoney(h.clientPrice, currency)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProposalHotels({ proposal }: { proposal: PublicProposalDTO }) {
  if (proposal.hotels.length === 0) return null
  const destination = proposal.destination ?? 'Your Destination'
  return (
    <Section id={SECTIONS.stay} eyebrow="Where You'll Stay" title={`Your Stay in ${destination}`} alt>
      {proposal.hotels.map((h, i) => (
        <HotelCard key={i} h={h} currency={proposal.currency} />
      ))}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFERS + EXPERIENCES
// ─────────────────────────────────────────────────────────────────────────────

function TransferCard({ t, currency }: { t: ProposalTransfer; currency: string }) {
  const hasImg = t.images && t.images.length > 0
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 14 }}>
      {hasImg && (
        <div style={{ display: 'grid', gridTemplateColumns: '38% 1fr' }}>
          <div style={{ position: 'relative', minHeight: 160, overflow: 'hidden', background: '#e8e0d4' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.images![0]}
              alt={t.type || 'Transfer'}
              onError={imgFallback}
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ padding: '24px 28px' }}>
            <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {t.date ? fmtDate(t.date) : 'Transfer'}
            </p>
            <h4 style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
              {t.type || 'Private Transfer'}
            </h4>
            {(t.from || t.to) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#4b5563', fontSize: 14, fontWeight: 500 }}>{t.from || '—'}</p>
                </div>
                <div style={{ padding: '0 16px', color: '#C9A84C', fontSize: 18, lineHeight: 1.5 }}>↓</div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#4b5563', fontSize: 14, fontWeight: 500 }}>{t.to || '—'}</p>
                </div>
              </div>
            )}
            {t.vehicle && (
              <span style={{ display: 'inline-block', marginTop: 12, background: '#f0ede8', color: '#92700c', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8 }}>
                {t.vehicle}
              </span>
            )}
            {t.clientPrice != null && (
              <p style={{ marginTop: 12, color: '#0B1F3A', fontSize: 15, fontWeight: 700 }}>{fmtMoney(t.clientPrice, currency)}</p>
            )}
          </div>
        </div>
      )}
      {!hasImg && (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {t.date ? fmtDate(t.date) : 'Transfer'}
              </p>
              <h4 style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
                {t.type || 'Private Transfer'}
              </h4>
              {(t.from || t.to) && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#4b5563', fontSize: 14, fontWeight: 500 }}>{t.from || '—'}</p>
                  </div>
                  <div style={{ padding: '0 16px', color: '#C9A84C', fontSize: 18, lineHeight: 1.5 }}>↓</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#4b5563', fontSize: 14, fontWeight: 500 }}>{t.to || '—'}</p>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
              {t.vehicle && (
                <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                  {t.vehicle}
                </span>
              )}
              {t.clientPrice != null && (
                <span style={{ color: '#0B1F3A', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(t.clientPrice, currency)}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TourCard({ t, currency }: { t: ProposalTour; currency: string }) {
  const hasImg = t.images && t.images.length > 0
  return (
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', marginBottom: 20 }}>
      {hasImg && (
        <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: '#e8e0d4' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.images![0]}
            alt={t.name || 'Experience'}
            onError={imgFallback}
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{ padding: '24px 28px' }}>
        {t.location && (
          <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            {t.location}
          </p>
        )}
        <h4 style={{ color: '#0B1F3A', fontSize: 20, fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', marginBottom: 8 }}>
          {t.name || 'Experience'}
        </h4>
        {t.notes && (
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{t.notes}</p>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {t.date && <span style={{ color: '#4b5563', fontSize: 13 }}>📅 {fmtDate(t.date)}{t.time ? ` · ${t.time}` : ''}</span>}
          {t.duration && <span style={{ color: '#4b5563', fontSize: 13 }}>⏱ {t.duration}</span>}
          {t.provider && <span style={{ color: '#4b5563', fontSize: 13 }}>🏢 {t.provider}</span>}
          {t.clientPrice != null && (
            <span style={{ marginLeft: 'auto', color: '#0B1F3A', fontSize: 15, fontWeight: 700 }}>{fmtMoney(t.clientPrice, currency)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ProposalExperiences({ proposal }: { proposal: PublicProposalDTO }) {
  const hasTransfers = proposal.transfers.length > 0
  const hasTours = proposal.tours.length > 0
  if (!hasTransfers && !hasTours) return null

  return (
    <Section id={SECTIONS.experiences} eyebrow="Curated For You" title="Your Experiences">
      {hasTours && (
        <div style={{ marginBottom: hasTransfers ? 48 : 0 }}>
          {hasTours && proposal.tours.length > 1 && (
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Tours & Activities</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {proposal.tours.map((t, i) => <TourCard key={i} t={t} currency={proposal.currency} />)}
          </div>
        </div>
      )}
      {hasTransfers && (
        <div>
          {hasTransfers && hasTours && (
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, marginTop: 8 }}>Transfers</p>
          )}
          {proposal.transfers.map((t, i) => <TransferCard key={i} t={t} currency={proposal.currency} />)}
        </div>
      )}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAINS + FERRIES
// ─────────────────────────────────────────────────────────────────────────────

function TrainCard({ t }: { t: ProposalTrain }) {
  const hasImg = (t.images && t.images.length > 0) || t.image
  const imgSrc = (t.images && t.images.length > 0) ? t.images[0] : t.image
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 14 }}>
      {hasImg && imgSrc && (
        <div style={{ position: 'relative', height: 120, overflow: 'hidden', background: '#e8e0d4' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={t.provider || 'Train'}
            onError={imgFallback}
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {t.date && (
              <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {fmtDate(t.date)}
              </p>
            )}
            {(t.from || t.to) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 800 }}>{t.from || '—'}</span>
                <span style={{ color: '#C9A84C', fontSize: 16 }}>→</span>
                <span style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 800 }}>{t.to || '—'}</span>
              </div>
            )}
          </div>
          {t.class && (
            <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>
              {t.class}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {t.departureTime && <span style={{ color: '#4b5563', fontSize: 13 }}>Dep: {t.departureTime}</span>}
          {t.arrivalTime && <span style={{ color: '#4b5563', fontSize: 13 }}>Arr: {t.arrivalTime}</span>}
          {t.provider && <span style={{ color: '#4b5563', fontSize: 13 }}>🚆 {t.provider}</span>}
          {t.trainNumber && <span style={{ color: '#6b7280', fontSize: 12, fontFamily: 'monospace' }}>{t.trainNumber}</span>}
        </div>
      </div>
    </div>
  )
}

function FerryCard({ f }: { f: ProposalFerry }) {
  const hasImg = (f.images && f.images.length > 0) || f.image
  const imgSrc = (f.images && f.images.length > 0) ? f.images[0] : f.image
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 14 }}>
      {hasImg && imgSrc && (
        <div style={{ position: 'relative', height: 120, overflow: 'hidden', background: '#e8e0d4' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={f.operator || 'Ferry'}
            onError={imgFallback}
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {f.date && (
              <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {fmtDate(f.date)}
              </p>
            )}
            {(f.from || f.to) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 800 }}>{f.from || '—'}</span>
                <span style={{ color: '#C9A84C', fontSize: 16 }}>→</span>
                <span style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 800 }}>{f.to || '—'}</span>
              </div>
            )}
          </div>
          {f.class && (
            <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>
              {f.class}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {f.departureTime && <span style={{ color: '#4b5563', fontSize: 13 }}>Dep: {f.departureTime}</span>}
          {f.arrivalTime && <span style={{ color: '#4b5563', fontSize: 13 }}>Arr: {f.arrivalTime}</span>}
          {f.operator && <span style={{ color: '#4b5563', fontSize: 13 }}>⛴ {f.operator}</span>}
          {f.vessel && <span style={{ color: '#6b7280', fontSize: 12 }}>{f.vessel}</span>}
        </div>
      </div>
    </div>
  )
}

function ProposalTransport({ proposal }: { proposal: PublicProposalDTO }) {
  const hasTrains = (proposal.trains?.length ?? 0) > 0
  const hasFerries = (proposal.ferries?.length ?? 0) > 0
  if (!hasTrains && !hasFerries) return null

  return (
    <Section id={SECTIONS.transport} eyebrow="On the Move" title="Rail & Sea" alt>
      {hasTrains && (
        <div style={{ marginBottom: hasFerries ? 40 : 0 }}>
          {hasFerries && (
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Train</p>
          )}
          {proposal.trains!.map((t, i) => <TrainCard key={i} t={t} />)}
        </div>
      )}
      {hasFerries && (
        <div>
          {hasTrains && (
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, marginTop: 8 }}>Ferry</p>
          )}
          {proposal.ferries!.map((f, i) => <FerryCard key={i} f={f} />)}
        </div>
      )}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY BY DAY
// ─────────────────────────────────────────────────────────────────────────────

function DayCard({ d }: { d: ProposalDay }) {
  return (
    <div style={{ display: 'flex', gap: 24, marginBottom: 48 }}>
      {/* Timeline indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#0B1F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#C9A84C', fontSize: 14, fontWeight: 800 }}>{d.day}</span>
        </div>
        <div style={{ width: 1, flex: 1, background: '#e5e7eb', marginTop: 12 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 8 }}>
        {d.destination && (
          <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            {d.destination}
          </p>
        )}
        <h3 style={{ color: '#0B1F3A', fontSize: 22, fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', marginBottom: 12, lineHeight: 1.2 }}>
          {d.title}
        </h3>

        {d.description && (
          <p style={{ color: '#4b5563', fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
            {d.description}
          </p>
        )}

        {/* Activities as timeline items */}
        {(d.activities ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {(d.activities ?? []).map((act, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < (d.activities ?? []).length - 1 ? '1px solid #f5f2ed' : 'none' }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>{activityIcon(act)}</span>
                <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>{act}</p>
              </div>
            ))}
          </div>
        )}

        {/* Meals / accommodation pills */}
        {(d.meals || d.accommodation) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {d.accommodation && (
              <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, padding: '4px 10px', borderRadius: 6, fontWeight: 500 }}>
                🏨 {d.accommodation}
              </span>
            )}
            {d.meals && (
              <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, padding: '4px 10px', borderRadius: 6, fontWeight: 500 }}>
                🍽 {d.meals}
              </span>
            )}
          </div>
        )}

        {d.clientNotes && (
          <p style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginTop: 10 }}>{d.clientNotes}</p>
        )}
      </div>
    </div>
  )
}

function ProposalDayByDay({ proposal }: { proposal: PublicProposalDTO }) {
  if (proposal.days.length === 0) return null
  return (
    <Section id={SECTIONS.itinerary} eyebrow="Day by Day" title="Your Journey" alt>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {proposal.days.map((d, i) => <DayCard key={i} d={d} />)}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INCLUSIONS
// ─────────────────────────────────────────────────────────────────────────────

function ProposalInclusions({ proposal }: { proposal: PublicProposalDTO }) {
  if (proposal.inclusions.length === 0 && proposal.exclusions.length === 0) return null
  return (
    <Section eyebrow="Trip Details" title="What's Included">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 32 }}>
        {proposal.inclusions.length > 0 && (
          <div>
            <p style={{ color: '#16a34a', fontSize: 13, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Included</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proposal.inclusions.map((inc, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9A84C', flexShrink: 0, marginTop: 6 }} />
                  <p style={{ color: '#374151', fontSize: 15 }}>{inc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {proposal.exclusions.length > 0 && (
          <div>
            <p style={{ color: '#6b7280', fontSize: 13, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✗ Not Included</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proposal.exclusions.map((exc, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0, marginTop: 6 }} />
                  <p style={{ color: '#6b7280', fontSize: 15 }}>{exc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_LABELS: Record<string, string> = {
  flights: 'Flights', hotels: 'Hotels', transfers: 'Transfers',
  tours: 'Tours & Activities', trains: 'Trains', ferries: 'Ferries',
}

function ProposalPricing({ proposal, onAccept }: { proposal: PublicProposalDTO; onAccept?: () => void }) {
  const hasData = proposal.totalPrice != null || proposal.priceBreakdown.length > 0 || proposal.paymentSchedule.length > 0
  if (!hasData) return null

  const cp = proposal.componentPrices
  const hasComponents = cp != null && Object.values(cp).some(v => (v ?? 0) > 0)

  return (
    <Section id={SECTIONS.investment} eyebrow="Your Investment" title="Trip Pricing" alt>
      <div style={{ maxWidth: 640 }}>

        {/* Component breakdown (auto from booking data) + manual adjustments */}
        {hasComponents && (
          <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', marginBottom: 16 }}>
            <div style={{ padding: '20px 28px 4px' }}>
              <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Trip Components</p>
              {Object.entries(cp!).map(([key, val]) =>
                val != null && val > 0 ? (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f2ed' }}>
                    <span style={{ color: '#374151', fontSize: 14 }}>{COMPONENT_LABELS[key] ?? key}</span>
                    <span style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{fmtMoney(val, proposal.currency)}</span>
                  </div>
                ) : null
              )}
            </div>

            {/* Manual adjustments as a secondary section */}
            {proposal.priceBreakdown.length > 0 && (
              <div style={{ padding: '16px 28px 4px', borderTop: '1px solid #f5f2ed' }}>
                <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Adjustments</p>
                {proposal.priceBreakdown.map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderBottom: i < proposal.priceBreakdown.length - 1 ? '1px solid #f5f2ed' : 'none' }}>
                    <div>
                      <p style={{ color: '#374151', fontSize: 14 }}>{row.item}</p>
                      {row.description && <p style={{ color: '#9ca3af', fontSize: 12 }}>{row.description}</p>}
                    </div>
                    <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 600 }}>{fmtMoney(row.cost, proposal.currency)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Total row */}
            {proposal.totalPrice != null && (
              <div style={{ background: '#0B1F3A', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Total</p>
                <p style={{ color: '#C9A84C', fontSize: 26, fontWeight: 800 }}>{fmtMoney(proposal.totalPrice, proposal.currency)}</p>
              </div>
            )}
          </div>
        )}

        {/* Manual breakdown only (no componentPrices) */}
        {!hasComponents && proposal.priceBreakdown.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', marginBottom: 16 }}>
            <div style={{ padding: '28px 32px' }}>
              {proposal.priceBreakdown.map((row, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', borderBottom: i < proposal.priceBreakdown.length - 1 ? '1px solid #f5f2ed' : 'none' }}
                >
                  <div>
                    <p style={{ color: '#374151', fontSize: 15 }}>{row.item}</p>
                    {row.description && <p style={{ color: '#9ca3af', fontSize: 12 }}>{row.description}</p>}
                  </div>
                  <p style={{ color: '#1f2937', fontSize: 15, fontWeight: 600 }}>{fmtMoney(row.cost, proposal.currency)}</p>
                </div>
              ))}
            </div>

            {/* Total row */}
            {proposal.totalPrice != null && (
              <div style={{ background: '#0B1F3A', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Total</p>
                <p style={{ color: '#C9A84C', fontSize: 26, fontWeight: 800 }}>{fmtMoney(proposal.totalPrice, proposal.currency)}</p>
              </div>
            )}
          </div>
        )}

        {/* Simple total (no breakdown at all) */}
        {proposal.totalPrice != null && !hasComponents && proposal.priceBreakdown.length === 0 && (
          <div style={{ background: '#0B1F3A', borderRadius: 20, padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Trip Total</p>
            <p style={{ color: '#C9A84C', fontSize: 28, fontWeight: 800 }}>{fmtMoney(proposal.totalPrice, proposal.currency)}</p>
          </div>
        )}

        {/* Deposit info */}
        {proposal.deposit != null && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: '16px 24px', marginBottom: 16 }}>
            <p style={{ color: '#92400e', fontWeight: 700, fontSize: 14 }}>
              Deposit: {fmtMoney(proposal.deposit, proposal.currency)}
              {proposal.depositDue ? ` — due by ${fmtDate(proposal.depositDue)}` : ''}
            </p>
            {proposal.balanceDue && (
              <p style={{ color: '#b45309', fontSize: 13, marginTop: 4 }}>Balance due by {fmtDate(proposal.balanceDue)}</p>
            )}
          </div>
        )}

        {/* Payment schedule */}
        {proposal.paymentSchedule.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '20px 28px 0' }}>Payment Schedule</p>
            <div style={{ padding: '0 28px 20px' }}>
              {proposal.paymentSchedule.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < proposal.paymentSchedule.length - 1 ? '1px solid #f5f2ed' : 'none' }}>
                  <div>
                    <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>{m.label}</p>
                    {m.dueDate && <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>{fmtDate(m.dueDate)}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 700 }}>{fmtMoney(m.amount, m.currency)}</p>
                    {m.paid && <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }}>✓ Paid</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accept CTA */}
        {(proposal.status === 'proposal' || proposal.status === 'revision_sent') && (
          onAccept && proposal.approvalToken ? (
            <button
              onClick={() => onAccept()}
              style={{ display: 'block', width: '100%', background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 17, padding: '18px 32px', borderRadius: 16, textAlign: 'center', border: 'none', cursor: 'pointer', marginTop: 24 }}
            >
              Review & Accept →
            </button>
          ) : (
            <a
              href={`https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to accept the proposal for ${proposal.title} (${proposal.referenceNumber}).`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 17, padding: '18px 32px', borderRadius: 16, textAlign: 'center', textDecoration: 'none', marginTop: 24 }}
            >
              Accept This Proposal →
            </a>
          )
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMS
// ─────────────────────────────────────────────────────────────────────────────

function ProposalTerms({ proposal }: { proposal: PublicProposalDTO }) {
  if (!proposal.terms) return null
  const [expanded, setExpanded] = useState(false)
  return (
    <section style={{ background: '#FAFAF8', padding: '0 24px 60px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ background: '#f5f2ed', borderRadius: 16, padding: '24px 28px' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            aria-controls="terms-body"
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 14, fontWeight: 600, width: '100%', textAlign: 'left' }}
          >
            Terms &amp; Conditions
            <span style={{ fontSize: 10, marginLeft: 'auto' }}>{expanded ? '▲' : '▼'}</span>
          </button>
          <div id="terms-body" hidden={!expanded} aria-hidden={!expanded}>
            <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.7, marginTop: 12, whiteSpace: 'pre-line' }}>
              {proposal.terms}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT + FOOTER
// ─────────────────────────────────────────────────────────────────────────────

function ProposalContact({ proposal }: { proposal: PublicProposalDTO }) {
  const c = proposal.contact
  return (
    <section style={{ background: '#0B1F3A', padding: '80px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <p style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>
              Your Advisor
            </p>
            <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', marginBottom: 16 }}>
              Questions about your journey?
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
              Our team is here to make your trip exactly what you envisioned. Reach us anytime.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a
                href={`https://wa.me/${c.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I have a question about my itinerary ${proposal.referenceNumber}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12, textDecoration: 'none' }}
              >
                💬 WhatsApp
              </a>
              <a
                href={`mailto:${c.email}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#C9A84C', color: '#0B1F3A', fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12, textDecoration: 'none' }}
              >
                ✉️ Email Us
              </a>
              <a
                href={`/api/itinerary/${proposal.referenceNumber}/pdf`}
                download
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                ⬇ Download PDF
              </a>
            </div>
          </div>

          {/* Contact details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>💬</span>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 3 }}>WhatsApp (Global)</p>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{c.globalWhatsAppDisplay}</p>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>💬</span>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 3 }}>WhatsApp (Nigeria)</p>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{c.nigeriaWhatsAppDisplay}</p>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>✉️</span>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 3 }}>Email</p>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{c.email}</p>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>📞</span>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 3 }}>Emergency Line</p>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{c.emergencyPhoneDisplay}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ maxWidth: 1100, margin: '48px auto 0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/walz-logo.png" alt="Walz Travels" style={{ height: 26, opacity: 0.7 }} />
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
          {proposal.referenceNumber} · walztravels.com
        </p>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE STICKY BAR
// ─────────────────────────────────────────────────────────────────────────────

function MobileStickyBar({ proposal, onAccept }: { proposal: PublicProposalDTO; onAccept?: () => void }) {
  return (
    <div className="sm:hidden" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: 'rgba(11,31,58,0.97)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(201,168,76,0.2)', padding: '12px 16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, maxWidth: 480, margin: '0 auto' }}>
        {proposal.totalPrice != null && (
          <div style={{ flex: 1 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600 }}>Total</p>
            <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 800 }}>{fmtMoney(proposal.totalPrice, proposal.currency)}</p>
          </div>
        )}
        {(proposal.status === 'proposal' || proposal.status === 'revision_sent') ? (
          onAccept && proposal.approvalToken ? (
            <button
              onClick={() => onAccept()}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 15, borderRadius: 12, border: 'none', cursor: 'pointer', padding: '12px 0' }}
            >
              Review & Accept →
            </button>
          ) : (
            <a
              href={`https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to accept the proposal for ${proposal.title} (${proposal.referenceNumber}).`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 15, borderRadius: 12, textDecoration: 'none', padding: '12px 0' }}
            >
              Accept Trip →
            </a>
          )
        ) : (
          <a href={`/api/itinerary/${proposal.referenceNumber}/pdf`} download
            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 15, borderRadius: 12, textDecoration: 'none', padding: '12px 0' }}>
            ⬇ Download PDF
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 OPTION CUSTOMISER
// ─────────────────────────────────────────────────────────────────────────────

function ProposalOptionCustomizer({
  proposal,
  selections,
  onSelectionsChange,
}: {
  proposal: PublicProposalDTO
  selections: ClientSelectionPayload[]
  onSelectionsChange: (s: ClientSelectionPayload[]) => void
}) {
  const groups = proposal.optionGroups
  if (!groups || groups.length === 0) return null

  const now = new Date()

  function isItemExpired(item: PublicOptionItem): boolean {
    if (!item.quoteExpiresAt) return false
    return new Date(item.quoteExpiresAt) < now
  }

  function getSelectedIds(groupId: string): string[] {
    return selections.find(s => s.groupId === groupId)?.itemIds ?? []
  }

  function updateGroup(groupId: string, itemIds: string[]) {
    onSelectionsChange([
      ...selections.filter(s => s.groupId !== groupId),
      ...(itemIds.length > 0 ? [{ groupId, itemIds }] : []),
    ])
  }

  function toggleItem(group: PublicOptionGroup, itemId: string) {
    const item = group.items.find(i => i.id === itemId)
    if (!item || isItemExpired(item)) return

    const current = getSelectedIds(group.id)

    if (group.selectionMode === 'SINGLE') {
      updateGroup(group.id, current.includes(itemId) ? [] : [itemId])
    } else {
      if (current.includes(itemId)) {
        updateGroup(group.id, current.filter(id => id !== itemId))
      } else {
        if (group.maxSelections > 0 && current.length >= group.maxSelections) return
        updateGroup(group.id, [...current, itemId])
      }
    }
  }

  function fmtAdjustment(group: PublicOptionGroup, item: PublicOptionItem): string {
    if (group.pricingMode === 'REPLACEMENT') {
      if (item.priceAdjustment === 0) return 'Included'
      const sign = item.priceAdjustment > 0 ? '+' : ''
      return `${sign}${fmtMoney(item.priceAdjustment, item.currency)}`
    }
    // ADD_ON
    return `+${fmtMoney(item.clientPrice, item.currency)}`
  }

  return (
    <Section id="section-v2-customiser" eyebrow="Personalise Your Trip" title="Customise Your Journey">
      <div style={{ maxWidth: 800 }}>
        {groups.map(group => {
          const selectedIds = getSelectedIds(group.id)
          const isRadio = group.selectionMode === 'SINGLE'
          return (
            <div key={group.id} style={{ marginBottom: 44 }}>
              <h3 style={{ color: '#0B1F3A', fontSize: 20, fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', marginBottom: 4, lineHeight: 1.2 }}>
                {group.name}
              </h3>
              {group.description && (
                <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>
                  {group.description}
                </p>
              )}
              {!group.description && <div style={{ marginBottom: 16 }} />}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.items.map(item => {
                  const expired  = isItemExpired(item)
                  const selected = selectedIds.includes(item.id)
                  const priceLabel = fmtAdjustment(group, item)
                  const priceIsGreen = priceLabel === 'Included'

                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(group, item.id)}
                      disabled={expired}
                      aria-pressed={selected}
                      style={{
                        background: selected ? '#FAFAF8' : '#fff',
                        border: `2px solid ${selected ? '#C9A84C' : '#f0ede8'}`,
                        borderRadius: 14,
                        padding: '16px 18px',
                        cursor: expired ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        opacity: expired ? 0.55 : 1,
                        transition: 'border-color 0.15s, background 0.15s',
                        boxShadow: selected ? '0 4px 20px rgba(201,168,76,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        {/* Radio / Checkbox indicator */}
                        <div style={{
                          width: 20, height: 20,
                          borderRadius: isRadio ? '50%' : 4,
                          border: `2px solid ${selected ? '#C9A84C' : '#d1d5db'}`,
                          background: selected ? '#C9A84C' : '#fff',
                          flexShrink: 0, marginTop: 2,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && (
                            <span style={{ color: '#0B1F3A', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ color: '#0B1F3A', fontSize: 15, fontWeight: 700 }}>{item.name}</span>
                              {item.recommended && !expired && (
                                <span style={{ background: '#C9A84C', color: '#0B1F3A', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                  RECOMMENDED
                                </span>
                              )}
                              {expired && (
                                <span style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                                  EXPIRED
                                </span>
                              )}
                            </div>
                            <span style={{
                              color: priceIsGreen ? '#16a34a' : '#0B1F3A',
                              fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0,
                            }}>
                              {priceLabel}
                            </span>
                          </div>
                          {item.description && (
                            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 5, lineHeight: 1.55, margin: '5px 0 0' }}>
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {group.required && (
                <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                  * A selection is required from this group.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 LIVE PRICING WIDGET
// ─────────────────────────────────────────────────────────────────────────────

function LivePricingWidget({
  proposal,
  selections,
}: {
  proposal: PublicProposalDTO
  selections: ClientSelectionPayload[]
}) {
  const groups = proposal.optionGroups
  if (!groups || groups.length === 0) return null
  if (proposal.totalPrice == null) return null

  // Build SelectedItemInput[] from current selections — no internal fields
  const selectedItems: SelectedItemInput[] = []
  for (const sel of selections) {
    const group = groups.find(g => g.id === sel.groupId)
    if (!group) continue
    for (const itemId of sel.itemIds) {
      const item = group.items.find(i => i.id === itemId)
      if (!item) continue
      selectedItems.push({
        groupId:         group.id,
        itemId:          item.id,
        pricingMode:     group.pricingMode,
        priceAdjustment: item.priceAdjustment,
        clientPrice:     item.clientPrice,
        currency:        item.currency,
        label:           item.name,
      })
    }
  }

  const result = calculateTripPrice({
    baseTotal:     proposal.totalPrice,
    selectedItems,
    currency:      proposal.currency,
  })

  const deposit = proposal.deposit ?? null
  const balance = deposit != null ? Math.max(0, result.grandTotal - deposit) : null

  return (
    <section style={{ background: '#f5f2ed', padding: '0 24px 48px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ background: '#0B1F3A', borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 32px rgba(11,31,58,0.18)' }}>
          {/* Line items */}
          <div style={{ padding: '24px 28px 0' }}>
            <p style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
              Trip Total
            </p>

            {/* Base */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Base trip</span>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{fmtMoney(result.baseTotal, result.currency)}</span>
            </div>

            {/* Option adjustments */}
            {result.lineItems.map((li, i) => {
              if (li.amount === 0) return null
              const sign = li.amount > 0 ? '+' : ''
              return (
                <div key={`${li.itemId}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{li.label}</span>
                  <span style={{ color: li.amount >= 0 ? '#C9A84C' : '#86efac', fontSize: 14, fontWeight: 600 }}>
                    {sign}{fmtMoney(Math.abs(li.amount), result.currency)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Grand total + deposit/balance */}
          <div style={{ padding: '16px 28px', background: 'rgba(201,168,76,0.10)', borderTop: '1px solid rgba(201,168,76,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: deposit != null ? 14 : 0 }}>
              <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>TOTAL</span>
              <span style={{ color: '#C9A84C', fontSize: 26, fontWeight: 800 }}>{fmtMoney(result.grandTotal, result.currency)}</span>
            </div>
            {deposit != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Deposit</span>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>{fmtMoney(deposit, proposal.currency)}</span>
                </div>
                {balance != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Balance</span>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>{fmtMoney(balance, proposal.currency)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Final total confirmed at acceptance.
        </p>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE OPTIONS (if present)
// ─────────────────────────────────────────────────────────────────────────────

function ProposalPackageOptions({ proposal, onAccept }: { proposal: PublicProposalDTO; onAccept?: (optionId?: string) => void }) {
  if (proposal.packageOptions.length === 0) return null
  const waLink = (pkgName: string) => `https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to select the "${pkgName}" package for ${proposal.referenceNumber}.`)}`

  return (
    <Section eyebrow="Your Options" title="Choose Your Package">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 20 }}>
        {proposal.packageOptions.map(pkg => (
          <div
            key={pkg.id}
            style={{
              background: '#fff',
              borderRadius: 20,
              border: pkg.isSelected ? '2px solid #C9A84C' : '2px solid #f0ede8',
              padding: '28px 24px',
              position: 'relative',
              boxShadow: pkg.isSelected ? '0 8px 32px rgba(201,168,76,0.15)' : '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            {pkg.isSelected && (
              <div style={{ position: 'absolute', top: -12, left: 24, background: '#C9A84C', color: '#0B1F3A', fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 20 }}>
                ★ Selected
              </div>
            )}
            <h3 style={{ color: '#0B1F3A', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{pkg.name}</h3>
            <p style={{ color: '#C9A84C', fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
              {fmtMoney(pkg.price, pkg.currency)}
            </p>
            {pkg.description && <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 14 }}>{pkg.description}</p>}
            {pkg.features.length > 0 && (
              <ul style={{ marginBottom: 20 }}>
                {pkg.features.map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                    <span style={{ color: '#C9A84C', flexShrink: 0 }}>✓</span>
                    <span style={{ color: '#374151', fontSize: 14 }}>{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {!pkg.isSelected && (
              onAccept ? (
                <button
                  onClick={() => onAccept(pkg.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'center', background: '#0B1F3A', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer' }}
                >
                  Accept with this package →
                </button>
              ) : (
                <a
                  href={waLink(pkg.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', textAlign: 'center', background: '#0B1F3A', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 12, textDecoration: 'none' }}
                >
                  Select this package →
                </a>
              )
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BANNER (approved / live)
// ─────────────────────────────────────────────────────────────────────────────

function StatusBanner({ status, acceptedBy, acceptedAt, acceptedTotal, currency }: {
  status: string
  acceptedBy?: string
  acceptedAt?: string
  acceptedTotal?: number | null
  currency?: string
}) {
  if (status === 'approved' || status === 'revision_accepted') {
    return (
      <div style={{ background: '#16a34a', padding: '14px 24px', textAlign: 'center' }}>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>
          ✓ Proposal accepted{acceptedBy ? ` by ${acceptedBy}` : ''}{acceptedAt ? ` on ${fmtShortDate(acceptedAt)}` : ''}{acceptedTotal != null && currency ? ` · ${fmtMoney(acceptedTotal, currency)}` : ''}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '2px 0 0' }}>Your trip is being arranged by our team</p>
      </div>
    )
  }
  if (status === 'live') {
    return (
      <div style={{ background: '#0B1F3A', borderBottom: '2px solid #C9A84C', padding: '12px 24px', textAlign: 'center' }}>
        <p style={{ color: '#C9A84C', fontSize: 14, fontWeight: 700, margin: 0 }}>
          ✈ Your trip is live — have an amazing journey!
        </p>
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE MODAL (GA5)
// ─────────────────────────────────────────────────────────────────────────────

function AcceptanceModal({
  proposal,
  initialOptionId,
  v2Selections,
  onClose,
}: {
  proposal: PublicProposalDTO
  initialOptionId: string | null
  v2Selections: ClientSelectionPayload[]
  onClose: () => void
}) {
  const router = useRouter()
  const hasOptions = proposal.packageOptions.length > 0
  const startStep: 1 | 2 | 3 = hasOptions ? 1 : 2

  const [step, setStep] = useState<1 | 2 | 3>(startStep)
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialOptionId ? [initialOptionId] : []
  )
  const [name, setName] = useState('')
  const [terms, setTerms] = useState(false)
  const [nameError, setNameError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ acceptedTotal: number | null; currency: string } | null>(null)
  const [apiError, setApiError] = useState<{ kind: 'stale' | 'expired' | 'conflict' | 'other'; msg: string } | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (step === 3) {
      const t = setTimeout(() => nameRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [step])

  const selectedOption = proposal.packageOptions.find(p => selectedIds.includes(p.id)) ?? null
  const previewTotal   = selectedOption?.price ?? proposal.totalPrice ?? null
  const previewCcy     = selectedOption?.currency ?? proposal.currency

  function toggleOption(id: string) {
    setSelectedIds(prev => prev.includes(id) ? [] : [id])
  }

  function goBack() {
    setStep(prev => {
      if (prev === 3) return 2
      if (prev === 2 && hasOptions) return 1
      return prev
    })
  }

  async function handleSubmit() {
    // ── DIAG: Phase 13B instrumentation — remove after root cause confirmed ──
    const _diag = (event: string, extra?: Record<string, unknown>) => {
      try { console.info('[WALZ_ACCEPT]', event, { pathname: window.location.pathname, online: navigator.onLine, ua: navigator.userAgent.slice(0, 80), ...extra }) } catch { /* ignore */ }
    }
    _diag('ACCEPT_CLICK')
    // ── END DIAG ──

    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setNameError('Please enter your full name (minimum 2 characters).')
      return
    }
    if (trimmed.length > 100) {
      setNameError('Name must be 100 characters or fewer.')
      return
    }

    _diag('VALIDATION_COMPLETE') // ── DIAG

    setSubmitting(true)
    setNameError('')

    // Determine flow
    const isRevision = proposal.status === 'revision_sent'
    const isV2 = proposal.acceptanceVersion === 2 && (proposal.optionGroups?.length ?? 0) > 0

    // ── DIAG ──
    const endpoint = isRevision
      ? `/api/itinerary/${proposal.referenceNumber}/accept-revision`
      : isV2
        ? `/api/itinerary/${proposal.referenceNumber}/accept-v2`
        : `/api/itinerary/${proposal.referenceNumber}/approve`
    _diag('ENDPOINT_RESOLVED', { endpoint, isRevision, isV2 })
    // ── END DIAG ──

    try {
      // Build an explicit allowlist payload — never spread state/props/events.
      let body = ''
      try {
        if (isRevision) {
          body = JSON.stringify({
            token:         String(proposal.approvalToken ?? ''),
            acceptedBy:    trimmed,
            termsAccepted: true,
            ...(isV2 ? { selections: v2Selections.map(s => ({ groupId: String(s.groupId), itemIds: s.itemIds.map(String) })) } : {}),
          })
        } else if (isV2) {
          body = JSON.stringify({
            token:         String(proposal.approvalToken ?? ''),
            acceptedBy:    trimmed,
            termsAccepted: true,
            selections:    v2Selections.map(s => ({ groupId: String(s.groupId), itemIds: s.itemIds.map(String) })),
          })
        } else {
          body = JSON.stringify({
            token:             String(proposal.approvalToken ?? ''),
            name:              trimmed,
            selectedOptionIds: selectedIds.filter(id => typeof id === 'string'),
            termsAccepted:     true,
            acceptanceVersion: 1,
          })
        }
      } catch (serErr: unknown) {
        const e = serErr instanceof Error ? serErr : new Error(String(serErr))
        _diag('CLIENT_SERIALIZATION_ERROR', { errorName: e.name, errorMessage: e.message })
        setApiError({ kind: 'other', msg: "We couldn't submit your acceptance. Please try again or contact Walz Travels." })
        return
      }

      _diag('BODY_SERIALIZED', { bodyLength: body.length }) // ── DIAG

      _diag('FETCH_STARTED') // ── DIAG

      let res: Response
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      _diag('FETCH_RESOLVED', { status: res.status }) // ── DIAG

      if (res.ok) {
        _diag('SUCCESS_HANDLER_STARTED') // ── DIAG
        const data = await res.json().catch(() => ({})) as { acceptedTotal?: number | null; currency?: string }
        setSuccess({
          acceptedTotal: data.acceptedTotal ?? null,
          currency: data.currency ?? proposal.currency,
        })
        // P1: Redirect to portal after acceptance — 2s delay so client sees confirmation
        setTimeout(() => {
          router.replace(`/itinerary/${proposal.referenceNumber}/portal`)
        }, 2000)
        return
      }

      _diag('RESPONSE_STATUS', { status: res.status }) // ── DIAG

      const respBody = await res.json().catch(() => ({})) as { error?: string }
      const msg = respBody?.error ?? 'An unexpected error occurred.'
      if (res.status === 410) {
        setApiError({ kind: 'expired', msg })
      } else if (res.status === 409) {
        const lower = msg.toLowerCase()
        if (lower.includes('changed') || lower.includes('stale') || lower.includes('hash') || lower.includes('update')) {
          setApiError({ kind: 'stale', msg })
        } else {
          setApiError({ kind: 'conflict', msg })
        }
      } else if (res.status === 500 || res.status === 503) {
        setApiError({ kind: 'other', msg: 'Our server encountered a problem. Please try again in a moment, or contact your travel advisor.' })
      } else {
        setApiError({ kind: 'other', msg })
      }
    } catch (err: unknown) {
      // ── DIAG ──
      const e = err instanceof Error ? err : new Error(String(err))
      _diag('FETCH_REJECTED', { errorName: e.name, errorMessage: e.message, online: navigator.onLine })
      // ── END DIAG ──
      // Only genuine network failures reach here (serialization errors return early above).
      setApiError({ kind: 'other', msg: 'Network error. Please check your connection and try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = name.trim().length >= 2 && name.trim().length <= 100 && terms && !submitting

  const waContactLink = `https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I need help with proposal ${proposal.referenceNumber}.`)}`

  // Step labels shown in indicator
  const stepLabels = hasOptions ? ['Customize', 'Review', 'Accept'] : ['Review', 'Accept']
  const currentLabelIdx = hasOptions ? step - 1 : step - 2

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accept Proposal"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(11,31,58,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(11,31,58,0.28)' }}
      >
        {/* Header */}
        <div style={{ background: '#0B1F3A', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 18, padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Accept Proposal</p>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proposal.title}</p>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{proposal.referenceNumber}</span>
        </div>

        {/* Step indicator */}
        {!success && !apiError && (
          <div style={{ display: 'flex', background: '#FAFAF8', borderBottom: '1px solid #f0ede8', flexShrink: 0 }}>
            {stepLabels.map((label, idx) => {
              const active = idx === currentLabelIdx
              const done   = idx < currentLabelIdx
              return (
                <div key={label} style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderBottom: active ? '2px solid #C9A84C' : '2px solid transparent' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: active ? '#C9A84C' : done ? '#16a34a' : '#9ca3af', margin: 0 }}>
                    {done ? '✓ ' : ''}{label}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '26px 22px' }}>

          {/* ── SUCCESS ── */}
          {success && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28 }}>✓</div>
              <h2 style={{ color: '#16a34a', fontSize: 22, fontWeight: 700, fontFamily: '"Playfair Display", Georgia, serif', marginBottom: 8 }}>Proposal Accepted!</h2>
              <p style={{ color: '#374151', fontSize: 14, marginBottom: 8 }}>Thank you, <strong>{name.trim()}</strong>.</p>
              {success.acceptedTotal != null && (
                <p style={{ color: '#C9A84C', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{fmtMoney(success.acceptedTotal, success.currency)}</p>
              )}
              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>Reference: <strong>{proposal.referenceNumber}</strong></p>
              <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
                Your acceptance has been recorded. Our team will be in touch shortly with next steps.
              </p>
            </div>
          )}

          {/* ── ERROR ── */}
          {apiError && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28 }}>⚠</div>
              {apiError.kind === 'expired' && (
                <>
                  <h2 style={{ color: '#0B1F3A', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Link Expired</h2>
                  <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>This acceptance link has expired. Please contact us for a new link.</p>
                </>
              )}
              {apiError.kind === 'stale' && (
                <>
                  <h2 style={{ color: '#0B1F3A', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Proposal Updated</h2>
                  <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>This proposal has been updated since it was sent. Please contact us to get the latest version.</p>
                </>
              )}
              {apiError.kind === 'conflict' && (
                <>
                  <h2 style={{ color: '#0B1F3A', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Already Confirmed</h2>
                  <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>This proposal has already been accepted. Please contact us if you have any questions.</p>
                </>
              )}
              {apiError.kind === 'other' && (
                <>
                  <h2 style={{ color: '#0B1F3A', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
                  <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>{apiError.msg}</p>
                </>
              )}
              <a href={waContactLink} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 12, textDecoration: 'none', marginTop: 20 }}>
                💬 Contact Us on WhatsApp
              </a>
            </div>
          )}

          {/* ── STEP 1: CUSTOMIZE TRIP ── */}
          {!success && !apiError && step === 1 && hasOptions && (
            <div>
              <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                Select a package upgrade — or continue with the base price
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {proposal.packageOptions.map(pkg => {
                  const sel = selectedIds.includes(pkg.id)
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => toggleOption(pkg.id)}
                      style={{ background: sel ? '#FAFAF8' : '#fff', border: `2px solid ${sel ? '#C9A84C' : '#f0ede8'}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', width: '100%', position: 'relative', transition: 'border-color 0.15s' }}
                    >
                      {sel && (
                        <div style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: '50%', background: '#C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#0B1F3A', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: pkg.description || pkg.features.length > 0 ? 6 : 0 }}>
                        <h3 style={{ color: '#0B1F3A', fontSize: 15, fontWeight: 700, margin: 0 }}>{pkg.name}</h3>
                        <p style={{ color: '#C9A84C', fontSize: 15, fontWeight: 800, margin: 0, marginLeft: 10, flexShrink: 0 }}>{fmtMoney(pkg.price, pkg.currency)}</p>
                      </div>
                      {pkg.description && <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 6px' }}>{pkg.description}</p>}
                      {pkg.features.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {pkg.features.map((f, i) => (
                            <span key={i} style={{ background: '#f0ede8', color: '#92700c', fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500 }}>{f}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              {previewTotal != null && (
                <div style={{ marginTop: 16, padding: '12px 16px', background: '#f5f2ed', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Preview total</p>
                  <p style={{ color: '#0B1F3A', fontSize: 17, fontWeight: 800, margin: 0 }}>{fmtMoney(previewTotal, previewCcy)}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: REVIEW ── */}
          {!success && !apiError && step === 2 && (
            <div>
              <p style={{ color: '#C9A84C', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Confirm your details</p>

              <div style={{ background: '#FAFAF8', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
                <p style={{ color: '#0B1F3A', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{proposal.title}</p>
                {proposal.destination && <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0' }}>📍 {proposal.destination}</p>}
                {(proposal.startDate || proposal.endDate) && (
                  <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0' }}>
                    📅 {proposal.startDate ? fmtDate(proposal.startDate) : ''}
                    {proposal.startDate && proposal.endDate ? ' — ' : ''}
                    {proposal.endDate ? fmtDate(proposal.endDate) : ''}
                  </p>
                )}
                {proposal.numberOfTravellers > 0 && (
                  <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0' }}>👤 {proposal.numberOfTravellers} traveller{proposal.numberOfTravellers > 1 ? 's' : ''}</p>
                )}
              </div>

              {/* V2: show selections summary */}
              {proposal.acceptanceVersion === 2 && v2Selections.length > 0 && (
                <div style={{ background: '#fff', border: '2px solid #C9A84C', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
                  <p style={{ color: '#9ca3af', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Your Selections</p>
                  {v2Selections.map(sel => {
                    const grp = proposal.optionGroups?.find(g => g.id === sel.groupId)
                    if (!grp) return null
                    return (
                      <div key={sel.groupId} style={{ marginBottom: 8 }}>
                        <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{grp.name}</p>
                        {sel.itemIds.map(id => {
                          const it = grp.items.find(i => i.id === id)
                          return it ? (
                            <p key={id} style={{ color: '#0B1F3A', fontSize: 13, fontWeight: 700, margin: 0 }}>{it.name}</p>
                          ) : null
                        })}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* V1: show selected package option */}
              {proposal.acceptanceVersion !== 2 && selectedOption ? (
                <div style={{ background: '#fff', border: '2px solid #C9A84C', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ color: '#9ca3af', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Package</p>
                      <p style={{ color: '#0B1F3A', fontSize: 14, fontWeight: 700, margin: '2px 0 0' }}>{selectedOption.name}</p>
                    </div>
                    <p style={{ color: '#C9A84C', fontSize: 15, fontWeight: 800, margin: 0 }}>{fmtMoney(selectedOption.price, selectedOption.currency)}</p>
                  </div>
                  {hasOptions && (
                    <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: '6px 0 0', textDecoration: 'underline' }}>
                      Change selection
                    </button>
                  )}
                </div>
              ) : proposal.acceptanceVersion !== 2 && hasOptions ? (
                <div style={{ background: '#FAFAF8', borderRadius: 12, padding: '14px 18px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>No upgrade — base package</p>
                  <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, textDecoration: 'underline' }}>Change</button>
                </div>
              ) : null}

              <div style={{ background: '#0B1F3A', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>Preview total (indicative)</p>
                    {proposal.deposit != null && (
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '2px 0 0' }}>
                        Deposit: {fmtMoney(proposal.deposit, proposal.currency)}{proposal.depositDue ? ` due ${fmtDate(proposal.depositDue)}` : ''}
                      </p>
                    )}
                  </div>
                  {previewTotal != null && (
                    <p style={{ color: '#C9A84C', fontSize: 20, fontWeight: 800, margin: 0 }}>{fmtMoney(previewTotal, previewCcy)}</p>
                  )}
                </div>
              </div>
              <p style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.6, margin: 0 }}>
                * Preview only. Your authoritative total will be confirmed in your acceptance receipt.
              </p>
            </div>
          )}

          {/* ── STEP 3: ACCEPT & CONFIRM ── */}
          {!success && !apiError && step === 3 && (
            <div>
              <p style={{ color: '#C9A84C', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Your acceptance</p>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', color: '#374151', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Full name — electronic signature
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
                  placeholder="Type your full name to sign"
                  maxLength={100}
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: `2px solid ${nameError ? '#dc2626' : '#e5e7eb'}`, fontSize: 15, color: '#0B1F3A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                {nameError && <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0' }}>{nameError}</p>}
                <p style={{ color: '#9ca3af', fontSize: 11, margin: '4px 0 0' }}>Your typed name serves as your electronic signature.</p>
              </div>

              <label style={{ display: 'flex', gap: 10, cursor: 'pointer', marginBottom: 18, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={e => setTerms(e.target.checked)}
                  style={{ width: 17, height: 17, flexShrink: 0, marginTop: 2, accentColor: '#C9A84C' }}
                />
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>
                  I have read and agree to the <span style={{ fontWeight: 600, color: '#0B1F3A' }}>terms & conditions</span> of this proposal.
                </span>
              </label>

              {name.trim().length >= 2 && terms && (
                <div style={{ background: '#f0ede8', borderRadius: 10, padding: '11px 14px', marginBottom: 4 }}>
                  <p style={{ color: '#92700c', fontSize: 13, margin: 0 }}>
                    By clicking "Accept & Confirm", <strong>{name.trim()}</strong> agrees to this proposal electronically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && !apiError && (
          <div style={{ borderTop: '1px solid #f0ede8', padding: '14px 22px', background: '#FAFAF8', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {step > startStep ? (
              <button onClick={goBack} style={{ background: 'none', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 600, fontSize: 13, padding: '11px 18px', borderRadius: 10, cursor: 'pointer' }}>
                ← Back
              </button>
            ) : (
              <button onClick={onClose} style={{ background: 'none', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 600, fontSize: 13, padding: '11px 18px', borderRadius: 10, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
            <div style={{ flex: 1 }} />
            {step === 1 && (
              <button onClick={() => setStep(2)} style={{ background: '#0B1F3A', color: '#fff', fontWeight: 700, fontSize: 13, padding: '11px 22px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                Next: Review →
              </button>
            )}
            {step === 2 && (
              <button onClick={() => setStep(3)} style={{ background: '#0B1F3A', color: '#fff', fontWeight: 700, fontSize: 13, padding: '11px 22px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                Next: Accept →
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{ background: canSubmit ? '#C9A84C' : '#e5e7eb', color: canSubmit ? '#0B1F3A' : '#9ca3af', fontWeight: 800, fontSize: 13, padding: '11px 22px', borderRadius: 10, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
              >
                {submitting ? 'Accepting...' : 'Accept & Confirm'}
              </button>
            )}
          </div>
        )}
        {(success || apiError) && (
          <div style={{ borderTop: '1px solid #f0ede8', padding: '14px 22px', background: '#FAFAF8', flexShrink: 0 }}>
            <button onClick={onClose} style={{ width: '100%', background: '#0B1F3A', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PROPOSAL PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function ProposalPage({ proposal }: { proposal: PublicProposalDTO }) {
  const [compact, setCompact] = useState(false)
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [initialOptionId, setInitialOptionId] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)

  // V2: selection state — initialised from defaultSelected items
  const [v2Selections, setV2Selections] = useState<ClientSelectionPayload[]>(() => {
    const groups = proposal.optionGroups ?? []
    const now = new Date()
    return groups
      .map(group => ({
        groupId: group.id,
        itemIds: group.items
          .filter(item =>
            item.defaultSelected &&
            item.active &&
            (!item.quoteExpiresAt || new Date(item.quoteExpiresAt) >= now)
          )
          .map(item => item.id),
      }))
      .filter(s => s.itemIds.length > 0)
  })

  const handleAccept = useCallback((optionId?: string) => {
    // V2: validate required groups before opening the modal
    if (proposal.acceptanceVersion === 2 && (proposal.optionGroups?.length ?? 0) > 0) {
      const groups = proposal.optionGroups ?? []
      for (const group of groups) {
        if (!group.required) continue
        const sel = v2Selections.find(s => s.groupId === group.id)
        const count = sel?.itemIds.length ?? 0
        if (count < group.minSelections) {
          const needed = group.minSelections
          setSelectionError(
            `Please select at least ${needed} option${needed > 1 ? 's' : ''} for "${group.name}".`
          )
          const el = document.getElementById('section-v2-customiser')
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 88
            window.scrollTo({ top, behavior: 'smooth' })
          }
          return
        }
      }
      setSelectionError(null)
    }
    setInitialOptionId(typeof optionId === 'string' ? optionId : null)
    setAcceptOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v2Selections, proposal.acceptanceVersion, proposal.optionGroups])

  const onScroll = useCallback(() => {
    setCompact(window.scrollY > 120)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScroll])

  // Bottom padding so content isn't hidden under the mobile sticky bar
  const hasMobileBar = true

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; background: #FAFAF8; }
        #proposal-root { padding-top: 0; }
        /* Mobile responsive fixes */
        @media (max-width: 768px) {
          .hotel-card-grid { grid-template-columns: 1fr !important; }
          .contact-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          #proposal-root { padding-bottom: 80px; }
        }
        /* Safari: ensure backdrop-filter works */
        @supports not (backdrop-filter: blur(1px)) {
          .proposal-header-blur { background: rgba(11,31,58,0.98) !important; }
        }
        /* Smooth scroll with header offset via scroll-margin */
        [id^="section-"] { scroll-margin-top: 72px; }
        /* Keyboard focus indicators */
        button:focus-visible, a:focus-visible {
          outline: 2px solid #C9A84C;
          outline-offset: 2px;
          border-radius: 4px;
        }
        /* Prevent horizontal overflow */
        #proposal-root, #proposal-root * { max-width: 100%; }
        img { max-width: 100%; }
      `}</style>

      <div id="proposal-root">
        <ProposalHeader proposal={proposal} compact={compact} onAccept={handleAccept} />

        {/* Status banners for approved / live */}
        <div style={{ paddingTop: compact ? 52 : 68 }}>
          <StatusBanner
            status={proposal.status}
            acceptedBy={proposal.acceptedBy}
            acceptedAt={proposal.acceptedAt}
            acceptedTotal={proposal.acceptedTotal}
            currency={proposal.currency}
          />
        </div>

        {/* Hero — full bleed */}
        <ProposalHero proposal={proposal} />

        {/* Introduction + Glance (overlap the hero) */}
        <ProposalIntro proposal={proposal} />

        {/* Sections */}
        <ProposalPackageOptions
          proposal={proposal}
          onAccept={(proposal.status === 'proposal' || proposal.status === 'revision_sent') && proposal.approvalToken ? handleAccept : undefined}
        />
        <ProposalFlights proposal={proposal} />
        <ProposalHotels proposal={proposal} />
        <ProposalExperiences proposal={proposal} />
        <ProposalTransport proposal={proposal} />
        <ProposalDayByDay proposal={proposal} />
        <ProposalInclusions proposal={proposal} />

        {/* V2: Option customiser — only renders when optionGroups present */}
        <ProposalOptionCustomizer
          proposal={proposal}
          selections={v2Selections}
          onSelectionsChange={sels => { setV2Selections(sels); setSelectionError(null) }}
        />

        {/* V2: Live pricing widget — only renders when optionGroups + totalPrice present */}
        <LivePricingWidget proposal={proposal} selections={v2Selections} />

        {/* V2: Validation error notice (shown when required group not fulfilled on "Review & Accept") */}
        {selectionError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 20px', margin: '0 24px 16px', maxWidth: 800, marginLeft: 'auto', marginRight: 'auto' }}>
            <p style={{ color: '#dc2626', fontSize: 14, fontWeight: 600, margin: 0 }}>{selectionError}</p>
          </div>
        )}

        <ProposalPricing proposal={proposal} onAccept={handleAccept} />
        <ProposalTerms proposal={proposal} />
        <ProposalContact proposal={proposal} />
        {hasMobileBar && <MobileStickyBar proposal={proposal} onAccept={handleAccept} />}
        {acceptOpen && proposal.approvalToken && (proposal.status === 'proposal' || proposal.status === 'revision_sent') && (
          <AcceptanceModal
            proposal={proposal}
            initialOptionId={initialOptionId}
            v2Selections={v2Selections}
            onClose={() => setAcceptOpen(false)}
          />
        )}
      </div>
    </>
  )
}
