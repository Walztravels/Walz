'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, MessageCircle } from 'lucide-react'

interface PackageInfo {
  id: string
  slug: string
  title: string
  price_per_person: number
  currency: string
  deposit_amount: number | null
  departure_date: string | null
  total_seats: number | null
  seats_booked: number
}

interface Props {
  pkg: PackageInfo
}

const DIAL_CODES = [
  { country: 'Nigeria', code: '+234', flag: 'NG' },
  { country: 'Ghana', code: '+233', flag: 'GH' },
  { country: 'UK', code: '+44', flag: 'GB' },
  { country: 'USA', code: '+1', flag: 'US' },
  { country: 'Canada', code: '+1', flag: 'CA' },
  { country: 'UAE', code: '+971', flag: 'AE' },
]

const COUNTRIES = [
  'Nigeria',
  'Ghana',
  'United Kingdom',
  'United States',
  'Canada',
  'UAE',
  'Other',
]

export default function PackageBookingModal({ pkg: initialPkg }: Props) {
  const [open, setOpen] = useState(false)
  const [pkg, setPkg] = useState<PackageInfo>(initialPkg)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [numTravellers, setNumTravellers] = useState(1)

  // Step 2
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [dialCode, setDialCode] = useState('+234')
  const [phone, setPhone] = useState('')
  const [clientCountry, setClientCountry] = useState('')
  const [specialRequests, setSpecialRequests] = useState('')

  // Step 3
  const [bookingRef, setBookingRef] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const maxTravellers = pkg.total_seats
    ? Math.max(1, pkg.total_seats - pkg.seats_booked)
    : 20

  const totalPrice = numTravellers * (pkg.price_per_person || 0)
  const depositDue = pkg.deposit_amount ? pkg.deposit_amount * numTravellers : null

  const resetModal = useCallback(() => {
    setStep(1)
    setNumTravellers(1)
    setClientName('')
    setClientEmail('')
    setDialCode('+234')
    setPhone('')
    setClientCountry('')
    setSpecialRequests('')
    setBookingRef('')
    setError('')
    setLoading(false)
  }, [])

  const closeModal = useCallback(() => {
    setOpen(false)
    resetModal()
  }, [resetModal])

  // Event listeners for open-booking-modal and set-booking-package
  useEffect(() => {
    const handleOpen = () => {
      resetModal()
      setOpen(true)
    }

    const handleSetPackage = (e: Event) => {
      const detail = (e as CustomEvent<PackageInfo>).detail
      if (detail) setPkg(detail)
    }

    window.addEventListener('open-booking-modal', handleOpen)
    window.addEventListener('set-booking-package', handleSetPackage)

    return () => {
      window.removeEventListener('open-booking-modal', handleOpen)
      window.removeEventListener('set-booking-package', handleSetPackage)
    }
  }, [resetModal])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeModal])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) closeModal()
  }

  const handleConfirmBooking = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/packages/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          packageSlug: pkg.slug,
          packageTitle: pkg.title,
          numTravellers,
          clientName,
          clientEmail,
          clientPhone: dialCode + phone,
          clientCountry,
          specialRequests,
        }),
      })
      const data = await res.json()
      if (data.bookingRef) {
        setBookingRef(data.bookingRef)
        setStep(3)
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const waText = encodeURIComponent(
    `Hi, I just booked ${pkg.title} ref ${bookingRef}`
  )
  const waUrl = `https://wa.me/447398753797?text=${waText}`

  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: pkg.currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(totalPrice)

  const formattedDeposit = depositDue
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: pkg.currency || 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(depositDue)
    : null

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 22, 40, 0.75)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Package booking"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-luxury overflow-hidden"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-walz-border"
          style={{ background: 'linear-gradient(135deg, #0B1F3A, #1C3557)' }}
        >
          <div>
            <p
              className="text-xs font-sans font-medium uppercase tracking-widest mb-0.5"
              style={{ color: '#C9A84C' }}
            >
              {step === 1 ? 'Step 1 of 2' : step === 2 ? 'Step 2 of 2' : 'Confirmed'}
            </p>
            <h2 className="font-display text-xl text-white leading-tight">
              {step === 1
                ? 'Book Your Trip'
                : step === 2
                ? 'Your Details'
                : 'Booking Received!'}
            </h2>
          </div>
          <button
            onClick={closeModal}
            aria-label="Close booking modal"
            className="flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-150 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')
            }
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Package name */}
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: '#F7F4EF', borderLeft: '4px solid #C9A84C' }}
              >
                <p className="font-sans text-xs text-walz-muted uppercase tracking-wide mb-0.5">
                  Selected Package
                </p>
                <p className="font-display text-walz-deep-navy font-semibold leading-snug">
                  {pkg.title}
                </p>
                {pkg.departure_date && (
                  <p className="font-sans text-sm text-walz-muted mt-0.5">
                    Departure:{' '}
                    {new Date(pkg.departure_date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>

              {/* Traveller count */}
              <div>
                <label
                  htmlFor="num-travellers"
                  className="block font-sans text-sm font-semibold text-walz-deep-navy mb-2"
                >
                  How many travellers?
                </label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    aria-label="Decrease travellers"
                    onClick={() => setNumTravellers((n) => Math.max(1, n - 1))}
                    disabled={numTravellers <= 1}
                    className="w-11 h-11 rounded-full border-2 font-bold text-xl flex items-center justify-center transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      borderColor: '#C9A84C',
                      color: '#C9A84C',
                    }}
                  >
                    −
                  </button>
                  <input
                    id="num-travellers"
                    type="number"
                    min={1}
                    max={maxTravellers}
                    value={numTravellers}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(maxTravellers, Number(e.target.value)))
                      setNumTravellers(v)
                    }}
                    className="w-16 text-center text-2xl font-bold font-display text-walz-deep-navy border-2 rounded-xl py-2 outline-none focus:ring-2"
                    style={{
                      borderColor: '#C9A84C',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                  />
                  <button
                    type="button"
                    aria-label="Increase travellers"
                    onClick={() => setNumTravellers((n) => Math.min(maxTravellers, n + 1))}
                    disabled={numTravellers >= maxTravellers}
                    className="w-11 h-11 rounded-full font-bold text-xl flex items-center justify-center transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    style={{ background: '#C9A84C' }}
                  >
                    +
                  </button>
                </div>
                {pkg.total_seats && (
                  <p className="font-sans text-xs text-walz-muted mt-2">
                    {maxTravellers} seat{maxTravellers !== 1 ? 's' : ''} remaining
                  </p>
                )}
              </div>

              {/* Price summary */}
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ background: '#0B1F3A' }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-sans text-sm text-walz-muted">
                    {numTravellers} traveller{numTravellers !== 1 ? 's' : ''} ×{' '}
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: pkg.currency || 'USD',
                      minimumFractionDigits: 0,
                    }).format(pkg.price_per_person)}
                  </span>
                  <span className="font-display text-2xl font-bold" style={{ color: '#C9A84C' }}>
                    {formattedTotal}
                  </span>
                </div>
                {formattedDeposit && (
                  <div
                    className="pt-2 border-t font-sans text-sm"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#E8C97A' }}
                  >
                    Reserve with {pkg.currency || 'USD'} {formattedDeposit} deposit today
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3.5 rounded-xl font-sans font-semibold text-base transition-all duration-200 cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #C9A84C, #E8C97A)',
                  color: '#0B1F3A',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.opacity = '0.92')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.opacity = '1')
                }
              >
                Continue →
              </button>

              <p className="text-center font-sans text-xs text-walz-muted">
                No payment taken now — secure your spot with details only
              </p>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Full Name */}
              <div>
                <label
                  htmlFor="client-name"
                  className="block font-sans text-sm font-semibold text-walz-deep-navy mb-1.5"
                >
                  Full Name <span style={{ color: '#C9A84C' }}>*</span>
                </label>
                <input
                  id="client-name"
                  type="text"
                  autoComplete="name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="As on your passport"
                  className="w-full border rounded-xl px-4 py-3 font-sans text-sm text-walz-deep-navy placeholder:text-walz-muted outline-none transition-colors duration-150 focus:border-walz-gold"
                  style={{ borderColor: '#E2D9CC' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#E2D9CC')}
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="client-email"
                  className="block font-sans text-sm font-semibold text-walz-deep-navy mb-1.5"
                >
                  Email Address <span style={{ color: '#C9A84C' }}>*</span>
                </label>
                <input
                  id="client-email"
                  type="email"
                  autoComplete="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border rounded-xl px-4 py-3 font-sans text-sm text-walz-deep-navy placeholder:text-walz-muted outline-none transition-colors duration-150"
                  style={{ borderColor: '#E2D9CC' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#E2D9CC')}
                />
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="client-phone"
                  className="block font-sans text-sm font-semibold text-walz-deep-navy mb-1.5"
                >
                  Phone Number{' '}
                  <span className="font-normal text-walz-muted">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={dialCode}
                    onChange={(e) => setDialCode(e.target.value)}
                    aria-label="Country dial code"
                    className="border rounded-xl px-3 py-3 font-sans text-sm text-walz-deep-navy outline-none bg-white cursor-pointer transition-colors duration-150"
                    style={{ borderColor: '#E2D9CC', minWidth: '110px' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#E2D9CC')}
                  >
                    {DIAL_CODES.map((d) => (
                      <option key={`${d.country}-${d.code}`} value={d.code}>
                        {d.country} ({d.code})
                      </option>
                    ))}
                  </select>
                  <input
                    id="client-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="8012345678"
                    className="flex-1 border rounded-xl px-4 py-3 font-sans text-sm text-walz-deep-navy placeholder:text-walz-muted outline-none transition-colors duration-150"
                    style={{ borderColor: '#E2D9CC' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#E2D9CC')}
                  />
                </div>
              </div>

              {/* Country of Residence */}
              <div>
                <label
                  htmlFor="client-country"
                  className="block font-sans text-sm font-semibold text-walz-deep-navy mb-1.5"
                >
                  Country of Residence
                </label>
                <select
                  id="client-country"
                  value={clientCountry}
                  onChange={(e) => setClientCountry(e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 font-sans text-sm text-walz-deep-navy bg-white outline-none cursor-pointer transition-colors duration-150"
                  style={{ borderColor: '#E2D9CC' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#E2D9CC')}
                >
                  <option value="">Select country…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Special Requests */}
              <div>
                <label
                  htmlFor="special-requests"
                  className="block font-sans text-sm font-semibold text-walz-deep-navy mb-1.5"
                >
                  Special Requests{' '}
                  <span className="font-normal text-walz-muted">(optional)</span>
                </label>
                <textarea
                  id="special-requests"
                  rows={4}
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="Dietary requirements, accessibility needs, room preferences…"
                  className="w-full border rounded-xl px-4 py-3 font-sans text-sm text-walz-deep-navy placeholder:text-walz-muted outline-none resize-none transition-colors duration-150"
                  style={{ borderColor: '#E2D9CC' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#C9A84C')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#E2D9CC')}
                />
              </div>

              {error && (
                <div
                  className="rounded-xl px-4 py-3 font-sans text-sm"
                  style={{ background: '#FEF2F2', color: '#C0392B', border: '1px solid #FECACA' }}
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1)
                    setError('')
                  }}
                  className="flex-1 py-3.5 rounded-xl font-sans font-medium text-sm border transition-colors duration-150 cursor-pointer"
                  style={{ borderColor: '#E2D9CC', color: '#1C3557', background: '#fff' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F7F4EF')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={loading || !clientName.trim() || !clientEmail.trim()}
                  className="flex-[2] py-3.5 rounded-xl font-sans font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background:
                      loading || !clientName.trim() || !clientEmail.trim()
                        ? '#E2D9CC'
                        : 'linear-gradient(135deg, #C9A84C, #E8C97A)',
                    color: '#0B1F3A',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: '#0B1F3A', borderTopColor: 'transparent' }}
                      />
                      Confirming…
                    </span>
                  ) : (
                    'Confirm Booking →'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div className="text-center space-y-6 py-2">
              {/* Tick animation */}
              <div className="flex justify-center">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)' }}
                >
                  <svg
                    viewBox="0 0 52 52"
                    className="w-10 h-10"
                    style={{ animation: 'checkmark-draw 0.5s ease-out forwards' }}
                    aria-hidden="true"
                  >
                    <style>{`
                      @keyframes checkmark-draw {
                        0% { stroke-dashoffset: 60; opacity: 0; }
                        20% { opacity: 1; }
                        100% { stroke-dashoffset: 0; opacity: 1; }
                      }
                      .checkmark-path {
                        stroke-dasharray: 60;
                        stroke-dashoffset: 60;
                        animation: checkmark-draw 0.55s cubic-bezier(0.4,0,0.2,1) 0.15s forwards;
                      }
                    `}</style>
                    <polyline
                      className="checkmark-path"
                      points="12,27 22,37 40,17"
                      fill="none"
                      stroke="#0B1F3A"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              <div>
                <h3 className="font-display text-2xl text-walz-deep-navy font-bold mb-1">
                  Booking Received!
                </h3>
                <p className="font-sans text-sm text-walz-muted">
                  Your reservation is secured
                </p>
              </div>

              {/* Booking ref */}
              <div
                className="rounded-xl px-5 py-4"
                style={{ background: '#0B1F3A' }}
              >
                <p
                  className="font-sans text-xs uppercase tracking-widest mb-2"
                  style={{ color: '#8B9BAE' }}
                >
                  Your Booking Reference
                </p>
                <p
                  className="font-mono text-3xl font-bold tracking-widest"
                  style={{ color: '#C9A84C' }}
                >
                  {bookingRef}
                </p>
              </div>

              {/* Info */}
              <div className="space-y-3 text-left">
                <div
                  className="rounded-xl px-4 py-3 font-sans text-sm"
                  style={{ background: '#F7F4EF', color: '#1C3557' }}
                >
                  <p className="mb-1">
                    We&apos;ll send your confirmation to{' '}
                    <strong className="text-walz-deep-navy">{clientEmail}</strong>
                  </p>
                  <p className="text-walz-muted text-xs">
                    Check your spam folder if it doesn&apos;t arrive within a few minutes.
                  </p>
                </div>

                <div
                  className="rounded-xl px-4 py-3 space-y-1"
                  style={{
                    background: '#F7F4EF',
                    borderLeft: '3px solid #C9A84C',
                  }}
                >
                  <p className="font-sans text-sm font-semibold text-walz-deep-navy">
                    What happens next?
                  </p>
                  <p className="font-sans text-sm text-walz-muted">
                    Our team will reach out within 2 hours with payment instructions.
                  </p>
                  <p className="font-sans text-sm text-walz-muted">
                    Bank details will be sent to your email to complete your reservation.
                  </p>
                </div>
              </div>

              {/* WhatsApp CTA */}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl font-sans font-semibold text-sm text-white transition-opacity duration-150 cursor-pointer"
                style={{ background: '#25D366' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <MessageCircle size={18} />
                Message us on WhatsApp
              </a>

              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 rounded-xl font-sans font-medium text-sm border transition-colors duration-150 cursor-pointer"
                style={{ borderColor: '#E2D9CC', color: '#1C3557', background: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F7F4EF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
