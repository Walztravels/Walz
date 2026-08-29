'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PublicProposalDTO, ProposalFlight, ProposalHotel, ProposalTransfer, ProposalTour, ProposalDay } from './_types'

// ── Utilities ─────────────────────────────────────────────────────────────────

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦' }
function sym(currency: string) { return SYM[currency?.toUpperCase()] ?? (currency + ' ') }

function fmtMoney(amount: number | null | undefined, currency: string) {
  if (amount == null) return ''
  return `${sym(currency)}${Number(amount).toLocaleString('en-GB')}`
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtShortDate(d?: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtDay(d?: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
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
  itinerary:   'section-itinerary',
  investment:  'section-investment',
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

function ProposalHeader({ proposal, compact }: { proposal: PublicProposalDTO; compact: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { label: 'Overview',     id: SECTIONS.overview,    show: true },
    { label: 'Flights',      id: SECTIONS.flights,     show: proposal.flights.length > 0 },
    { label: 'Stay',         id: SECTIONS.stay,        show: proposal.hotels.length > 0 },
    { label: 'Experiences',  id: SECTIONS.experiences, show: proposal.tours.length > 0 || proposal.transfers.length > 0 },
    { label: 'Itinerary',    id: SECTIONS.itinerary,   show: proposal.days.length > 0 },
    { label: 'Investment',   id: SECTIONS.investment,  show: !!(proposal.totalPrice || proposal.priceBreakdown.length > 0) },
  ].filter(n => n.show)

  const waLink = `https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to discuss my itinerary ${proposal.referenceNumber}.`)}`

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
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
        {proposal.status === 'proposal' && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2"
            style={{ background: '#C9A84C', color: '#0B1F3A', fontWeight: 700, fontSize: 13, padding: '9px 20px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Accept Trip →
          </a>
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
          {proposal.status === 'proposal' && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 12, background: '#C9A84C', color: '#0B1F3A', fontWeight: 700, padding: '12px 0', borderRadius: 10, textAlign: 'center', textDecoration: 'none' }}
            >
              Accept This Proposal →
            </a>
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
        <div>
          <p style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{f.airline || 'Flight'}</p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }}>
            {f.flightNumber}{f.flightNumber && f.class ? ' · ' : ''}{f.class}
          </p>
        </div>
        {f.date && (
          <p style={{ color: '#C9A84C', fontSize: 13, fontWeight: 600 }}>{fmtDate(f.date)}</p>
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
      <div style={{ display: 'grid', gridTemplateColumns: hasImages ? '1fr 1fr' : '1fr', minHeight: 300 }}>
        {/* Image */}
        {hasImages && (
          <div style={{ position: 'relative', overflow: 'hidden', background: '#e8e0d4' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={h.images![activeImg]}
              alt={h.name || 'Hotel'}
              onError={imgFallback}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 300 }}
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

function TransferCard({ t }: { t: ProposalTransfer }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 14 }}>
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
        {t.vehicle && (
          <span style={{ background: '#f0ede8', color: '#92700c', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap' }}>
            {t.vehicle}
          </span>
        )}
      </div>
    </div>
  )
}

function TourCard({ t }: { t: ProposalTour }) {
  const hasImg = t.images && t.images.length > 0
  return (
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', marginBottom: 20 }}>
      {hasImg && (
        <div style={{ height: 220, overflow: 'hidden', background: '#e8e0d4' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.images![0]} alt={t.name || 'Experience'} onError={imgFallback} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {t.date && <span style={{ color: '#4b5563', fontSize: 13 }}>📅 {fmtDate(t.date)}{t.time ? ` · ${t.time}` : ''}</span>}
          {t.duration && <span style={{ color: '#4b5563', fontSize: 13 }}>⏱ {t.duration}</span>}
          {t.provider && <span style={{ color: '#4b5563', fontSize: 13 }}>🏢 {t.provider}</span>}
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
            {proposal.tours.map((t, i) => <TourCard key={i} t={t} />)}
          </div>
        </div>
      )}
      {hasTransfers && (
        <div>
          {hasTransfers && hasTours && (
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, marginTop: 8 }}>Transfers</p>
          )}
          {proposal.transfers.map((t, i) => <TransferCard key={i} t={t} />)}
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

function ProposalPricing({ proposal }: { proposal: PublicProposalDTO }) {
  const hasData = proposal.totalPrice != null || proposal.priceBreakdown.length > 0 || proposal.paymentSchedule.length > 0
  if (!hasData) return null

  const waLink = `https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to accept the proposal for ${proposal.title} (${proposal.referenceNumber}).`)}`

  return (
    <Section id={SECTIONS.investment} eyebrow="Your Investment" title="Trip Pricing" alt>
      <div style={{ maxWidth: 640 }}>
        {/* Price breakdown */}
        {proposal.priceBreakdown.length > 0 && (
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

        {/* Simple total (no breakdown) */}
        {proposal.totalPrice != null && proposal.priceBreakdown.length === 0 && (
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
        {proposal.status === 'proposal' && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 17, padding: '18px 32px', borderRadius: 16, textAlign: 'center', textDecoration: 'none', marginTop: 24 }}
          >
            Accept This Proposal →
          </a>
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 14, fontWeight: 600 }}
          >
            Terms &amp; Conditions
            <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
          </button>
          {expanded && (
            <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.7, marginTop: 12, whiteSpace: 'pre-line' }}>
              {proposal.terms}
            </p>
          )}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
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

function MobileStickyBar({ proposal }: { proposal: PublicProposalDTO }) {
  const waLink = `https://wa.me/${proposal.contact.globalWhatsAppE164}?text=${encodeURIComponent(`Hi Walz Travels, I'd like to accept the proposal for ${proposal.title} (${proposal.referenceNumber}).`)}`
  return (
    <div className="sm:hidden" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: 'rgba(11,31,58,0.97)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(201,168,76,0.2)', padding: '12px 16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, maxWidth: 480, margin: '0 auto' }}>
        {proposal.totalPrice != null && (
          <div style={{ flex: 1 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600 }}>Total</p>
            <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 800 }}>{fmtMoney(proposal.totalPrice, proposal.currency)}</p>
          </div>
        )}
        {proposal.status === 'proposal' ? (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#C9A84C', color: '#0B1F3A', fontWeight: 800, fontSize: 15, borderRadius: 12, textDecoration: 'none', padding: '12px 0' }}>
            Accept Trip →
          </a>
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
// PACKAGE OPTIONS (if present)
// ─────────────────────────────────────────────────────────────────────────────

function ProposalPackageOptions({ proposal }: { proposal: PublicProposalDTO }) {
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
              <a
                href={waLink(pkg.name)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'center', background: '#0B1F3A', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 12, textDecoration: 'none' }}
              >
                Select this package →
              </a>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PROPOSAL PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function ProposalPage({ proposal }: { proposal: PublicProposalDTO }) {
  const [compact, setCompact] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  const onScroll = useCallback(() => {
    setCompact(window.scrollY > 120)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScroll])

  return (
    <>
      {/* Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; background: #FAFAF8; }
        #proposal-root { padding-top: 0; }
        @media (max-width: 768px) {
          .hotel-card-grid { grid-template-columns: 1fr !important; }
          .contact-grid { grid-template-columns: 1fr !important; }
          .section-inner { padding: 48px 16px !important; }
        }
      `}</style>

      <div id="proposal-root">
        <ProposalHeader proposal={proposal} compact={compact} />

        {/* Hero — full bleed, no padding-top (header is fixed/transparent) */}
        <div ref={heroRef}>
          <ProposalHero proposal={proposal} />
        </div>

        {/* Introduction + Glance (overlap the hero) */}
        <ProposalIntro proposal={proposal} />

        {/* Sections */}
        <ProposalPackageOptions proposal={proposal} />
        <ProposalFlights proposal={proposal} />
        <ProposalHotels proposal={proposal} />
        <ProposalExperiences proposal={proposal} />
        <ProposalDayByDay proposal={proposal} />
        <ProposalInclusions proposal={proposal} />
        <ProposalPricing proposal={proposal} />
        <ProposalTerms proposal={proposal} />
        <ProposalContact proposal={proposal} />
        <MobileStickyBar proposal={proposal} />
      </div>
    </>
  )
}
