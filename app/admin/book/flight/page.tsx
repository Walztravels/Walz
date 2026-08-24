'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plane, Search, Loader2, ArrowRight, Clock,
  CreditCard, CheckCircle, ArrowLeft, Send, SkipForward,
} from 'lucide-react'
import Link from 'next/link'

type Step        = 'search' | 'results' | 'quote' | 'passenger' | 'confirm' | 'done'
type TripType    = 'oneway' | 'roundtrip'
type CabinClass  = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'

interface FlightResult {
  id:              string
  duffelOfferId?:  string
  airline:         string
  flightNumber:    string
  origin:          string
  destination:     string
  departureTime:   string
  arrivalTime:     string
  duration:        string
  stops:           number
  price:           number
  currency:        string
  cabinClass:      string
  baggageIncluded: string
}

const CABIN_LABELS: Record<CabinClass, string> = {
  ECONOMY:          'Economy',
  PREMIUM_ECONOMY:  'Premium Economy',
  BUSINESS:         'Business',
  FIRST:            'First Class',
}

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$' }

function AdminFlightBookingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quoteId = searchParams.get('quoteId')

  const [step, setStep] = useState<Step>('search')

  const [tripType,     setTripType]     = useState<TripType>('roundtrip')
  const [origin,       setOrigin]       = useState('')
  const [destination,  setDestination]  = useState('')
  const [depart,       setDepart]       = useState('')
  const [returnDate,   setReturnDate]   = useState('')
  const [adults,       setAdults]       = useState(1)
  const [children,     setChildren]     = useState(0)
  const [cabinClass,   setCabinClass]   = useState<CabinClass>('ECONOMY')

  const [clientName,   setClientName]   = useState('')
  const [clientEmail,  setClientEmail]  = useState('')
  const [clientPhone,  setClientPhone]  = useState('')

  const [results,      setResults]      = useState<FlightResult[]>([])
  const [selected,     setSelected]     = useState<FlightResult | null>(null)
  const [searching,    setSearching]    = useState(false)
  const [searchErr,    setSearchErr]    = useState('')

  // Quote step state
  const [quoteSending, setQuoteSending] = useState(false)
  const [quoteLink,    setQuoteLink]    = useState<string | null>(null)
  const [quoteErr,     setQuoteErr]     = useState('')

  // Quote-load state (when opened with ?quoteId=)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteLoadErr, setQuoteLoadErr] = useState<string | null>(null)

  const [passFirst,    setPassFirst]    = useState('')
  const [passLast,     setPassLast]     = useState('')
  const [passDob,      setPassDob]      = useState('')
  const [passGender,   setPassGender]   = useState('m')
  const [passPassport, setPassPassport] = useState('')

  const [booking,      setBooking]      = useState(false)
  const [bookingRef,   setBookingRef]   = useState('')
  const [bookErr,      setBookErr]      = useState('')

  const today = new Date().toISOString().split('T')[0]

  // ── Load and verify an approved quote when quoteId is in the URL ────────────
  useEffect(() => {
    if (!quoteId) return

    async function verifyAndLoad() {
      setQuoteLoading(true)
      setQuoteLoadErr(null)
      try {
        const r = await fetch(`/api/admin/flight-quotes/${quoteId}`)
        const d = await r.json()

        if (!r.ok) {
          setQuoteLoadErr(d.error ?? 'Could not load quote.')
          setQuoteLoading(false)
          return
        }

        const { quote, offerVerification } = d

        if (offerVerification.expired) {
          setQuoteLoadErr(
            `The Duffel offer for this quote has expired. Please search for ${quote.origin} → ${quote.destination} again and generate a new quote.`
          )
          setQuoteLoading(false)
          return
        }

        if (offerVerification.priceChanged) {
          setQuoteLoadErr(
            `The price has changed since this quote was sent (was ${quote.displayPrice} ${quote.currency}, now ${offerVerification.currentPrice} ${offerVerification.currentCurrency ?? quote.currency}). Please search again.`
          )
          setQuoteLoading(false)
          return
        }

        if (offerVerification.error) {
          setQuoteLoadErr(`Offer verification failed: ${offerVerification.error}. Please search again to confirm availability.`)
          setQuoteLoading(false)
          return
        }

        // Offer still valid — pre-fill wizard state
        setClientName(quote.clientName ?? '')
        setClientEmail(quote.clientEmail ?? '')
        setClientPhone(quote.clientPhone ?? '')
        setOrigin(quote.origin)
        setDestination(quote.destination)
        setDepart(quote.departureDate.split('T')[0])
        if (quote.returnDate) setReturnDate(quote.returnDate.split('T')[0])

        setSelected({
          id:              quote.duffelOfferId,
          duffelOfferId:   quote.duffelOfferId,
          airline:         quote.airline,
          flightNumber:    '',
          origin:          quote.origin,
          destination:     quote.destination,
          departureTime:   quote.departureDate,
          arrivalTime:     '',
          duration:        '',
          stops:           0,
          price:           parseFloat(quote.displayPrice),
          currency:        quote.currency,
          cabinClass:      quote.cabinClass,
          baggageIncluded: '',
        })

        setStep('passenger')
      } catch {
        setQuoteLoadErr('Failed to verify quote. Please try again.')
      } finally {
        setQuoteLoading(false)
      }
    }

    void verifyAndLoad()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  // ── Search ──────────────────────────────────────────────────────────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!origin || !destination || !depart) return
    setSearching(true); setSearchErr(''); setResults([])

    try {
      const body: Record<string, unknown> = {
        tripType,
        origin:        origin.toUpperCase(),
        destination:   destination.toUpperCase(),
        departureDate: depart,
        adults,
        children,
        cabinClass,
        currency: 'GBP',
      }
      if (tripType === 'roundtrip' && returnDate) body.returnDate = returnDate

      const res  = await fetch('/api/search/flights', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flights: FlightResult[] = (data.flights ?? data.results ?? []).map((f: any) => ({
        id:              f.id,
        duffelOfferId:   f.duffelOfferId ?? f.id,
        airline:         f.airline ?? f.marketing_carrier?.name ?? '',
        flightNumber:    f.flightNumber ?? f.flight_number ?? '',
        origin:          f.origin ?? origin.toUpperCase(),
        destination:     f.destination ?? destination.toUpperCase(),
        departureTime:   f.departureTime ?? f.departing_at ?? '',
        arrivalTime:     f.arrivalTime   ?? f.arriving_at  ?? '',
        duration:        f.duration ?? '',
        stops:           f.stops ?? 0,
        price:           parseFloat(f.price ?? f.total_amount ?? '0'),
        currency:        f.currency ?? 'GBP',
        cabinClass:      f.cabinClass ?? cabinClass,
        baggageIncluded: f.baggageIncluded ?? '1 checked bag',
      }))

      if (!flights.length) {
        setSearchErr('No flights found. Try different dates or airports.')
        setSearching(false)
        return
      }
      setResults(flights)
      setStep('results')
    } catch (err: unknown) {
      setSearchErr(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  // ── Generate & send quote (does NOT call Duffel /air/orders) ───────────────
  async function handleGenerateQuote() {
    if (!selected || !clientEmail) return
    setQuoteSending(true); setQuoteErr('')

    try {
      const r = await fetch('/api/admin/flight-quotes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duffelOfferId: selected.duffelOfferId ?? selected.id,
          clientName:    clientName || null,
          clientEmail,
          clientPhone:   clientPhone || null,
          origin:        selected.origin,
          destination:   selected.destination,
          departureDate: selected.departureTime || depart,
          returnDate:    returnDate || null,
          airline:       selected.airline,
          cabinClass:    selected.cabinClass,
          displayPrice:  selected.price,
          currency:      selected.currency,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to create quote')
      setQuoteLink(d.quote.link)
    } catch (err: unknown) {
      setQuoteErr(err instanceof Error ? err.message : 'Failed to create quote')
    } finally {
      setQuoteSending(false)
    }
  }

  // ── Book (creates Duffel order) ─────────────────────────────────────────────
  async function handleBook() {
    if (!selected || !clientName || !clientEmail || !passFirst || !passLast || !passDob) return
    setBooking(true); setBookErr('')

    try {
      const res = await fetch('/api/admin/book/flight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          offerId:     selected.duffelOfferId ?? selected.id,
          clientName, clientEmail, clientPhone,
          passengers: [{
            title:          'mr',
            given_name:     passFirst,
            family_name:    passLast,
            born_on:        passDob,
            gender:         passGender,
            email:          clientEmail,
            phone_number:   clientPhone || '+441234567890',
            ...(passPassport ? { passport_number: passPassport } : {}),
          }],
          totalAmount: selected.price,
          currency:    selected.currency,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      setBookingRef(data.bookingReference)
      setStep('done')
    } catch (err: unknown) {
      setBookErr(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setBooking(false)
    }
  }

  // ── Quote pre-load error banner ─────────────────────────────────────────────
  if (quoteLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center min-h-[300px] text-gray-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Verifying Duffel offer…
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">

      {step === 'search'
        ? (
          <Link href="/admin/book" className="flex items-center gap-2 text-gray-400 hover:text-[#0B1F3A] text-sm mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Booking Centre
          </Link>
        ) : (
          <button onClick={() => setStep('search')}
            className="flex items-center gap-2 text-gray-400 hover:text-[#0B1F3A] text-sm mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to search
          </button>
        )
      }

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <Plane className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-[#0B1F3A] text-xl">Book a Flight</h1>
          <p className="text-gray-400 text-xs">Powered by Duffel · 400+ airlines</p>
        </div>
      </div>

      {/* Quote load error (when opened with ?quoteId) */}
      {quoteLoadErr && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm mb-6">
          <p className="font-semibold mb-1">Offer no longer bookable</p>
          <p>{quoteLoadErr}</p>
        </div>
      )}

      {/* ── SEARCH ── */}
      {step === 'search' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <form onSubmit={handleSearch} className="space-y-4">

            <div className="flex gap-2">
              {(['roundtrip', 'oneway'] as TripType[]).map(t => (
                <button key={t} type="button" onClick={() => setTripType(t)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                    tripType === t ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {t === 'roundtrip' ? 'Round Trip' : 'One Way'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#F5F0E8] rounded-xl">
              <p className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider col-span-full">Client Details</p>
              <input value={clientName}  onChange={e => setClientName(e.target.value)}
                placeholder="Client full name" required
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <input value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                type="email" placeholder="Client email" required
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                placeholder="Client phone (optional)"
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">From</label>
                <input value={origin} onChange={e => setOrigin(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="LHR" maxLength={3} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">To</label>
                <input value={destination} onChange={e => setDestination(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="DXB" maxLength={3} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Depart</label>
                <input type="date" value={depart} onChange={e => setDepart(e.target.value)}
                  min={today} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              {tripType === 'roundtrip' && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Return</label>
                  <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                    min={depart || today}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Adults</label>
                <input type="number" value={adults} onChange={e => setAdults(Number(e.target.value))} min={1} max={9}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Children</label>
                <input type="number" value={children} onChange={e => setChildren(Number(e.target.value))} min={0} max={8}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cabin</label>
                <select value={cabinClass} onChange={e => setCabinClass(e.target.value as CabinClass)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1 bg-white">
                  {Object.entries(CABIN_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {searchErr && <p className="text-red-500 text-sm">{searchErr}</p>}

            <button type="submit" disabled={searching}
              className="w-full flex items-center justify-center gap-2 bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {searching ? 'Searching all airlines…' : 'Search Flights'}
            </button>
          </form>
        </div>
      )}

      {/* ── RESULTS ── */}
      {step === 'results' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {results.length} flights found · {origin} → {destination} · {depart}
          </p>
          {results.slice(0, 15).map(f => (
            <div key={f.id}
              onClick={() => { setSelected(f); setStep('quote') }}
              className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-[#C9A84C]/40 hover:shadow-md transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#0B1F3A]">{f.airline}</p>
                  <p className="text-xs text-gray-400">{f.flightNumber} · {f.cabinClass}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                      {f.departureTime ? new Date(f.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                      {f.arrivalTime ? new Date(f.arrivalTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}
                    </span>
                    {f.duration && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{f.duration}
                      </span>
                    )}
                    {f.stops === 0 && <span className="text-xs text-green-600 font-semibold">Direct</span>}
                    {f.stops > 0  && <span className="text-xs text-amber-600">{f.stops} stop{f.stops > 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#0B1F3A]">
                    {SYM[f.currency] ?? f.currency}{f.price.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">per person</p>
                  <span className="mt-2 text-xs text-[#C9A84C] font-semibold flex items-center gap-1 ml-auto justify-end">
                    Select <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── QUOTE STEP ── */}
      {step === 'quote' && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="font-bold text-[#0B1F3A] text-sm">{selected.airline} {selected.flightNumber}</p>
            <p className="text-xs text-gray-500">
              {selected.origin} → {selected.destination} ·{' '}
              {SYM[selected.currency] ?? selected.currency}{selected.price.toLocaleString()} per person
            </p>
          </div>

          {/* Option A: Generate & send quote */}
          {!quoteLink ? (
            <>
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider">Send a quote to the client</p>
                <p className="text-sm text-gray-500">
                  Creates a shareable quote link and emails it to the client. No booking is made.
                  The client approves, then you return here to collect passenger details and confirm.
                </p>

                {!clientEmail && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Client name</label>
                      <input value={clientName} onChange={e => setClientName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Client email *</label>
                      <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                        placeholder="jane@example.com" required
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
                    </div>
                  </div>
                )}

                {quoteErr && <p className="text-red-500 text-sm">{quoteErr}</p>}

                <button
                  onClick={handleGenerateQuote}
                  disabled={quoteSending || !clientEmail}
                  className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl hover:bg-[#b8973d] transition-colors disabled:opacity-50"
                >
                  {quoteSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {quoteSending ? 'Generating quote…' : 'Generate & Send Quote'}
                </button>
              </div>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Option B: Skip quote, book directly */}
              <div>
                <p className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">Book directly</p>
                <p className="text-sm text-gray-500 mb-3">
                  Client has already agreed by phone or WhatsApp. Skip the quote and proceed straight to passenger details.
                </p>
                <button
                  onClick={() => setStep('passenger')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip Quote — Book Directly
                </button>
              </div>
            </>
          ) : (
            /* Quote generated successfully */
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <p className="font-semibold text-green-800 mb-1">Quote sent to {clientEmail}</p>
                <p className="text-sm text-green-700 mb-3">
                  The client can approve at this link:
                </p>
                <code className="text-xs text-green-900 bg-green-100 px-3 py-2 rounded-lg block break-all">
                  {quoteLink}
                </code>
              </div>
              <p className="text-sm text-gray-500">
                Once the client approves, you&apos;ll get an email notification.
                Come back to <Link href="/admin/flight-quotes" className="text-[#C9A84C] underline">Flight Quotes</Link> to
                verify the offer and complete the booking.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('search'); setSelected(null); setQuoteLink(null) }}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50"
                >
                  New Booking
                </button>
                <Link href="/admin/flight-quotes"
                  className="px-5 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm hover:bg-[#162d52]">
                  View All Quotes
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PASSENGER DETAILS ── */}
      {step === 'passenger' && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="font-bold text-[#0B1F3A] text-sm">{selected.airline} {selected.flightNumber}</p>
            <p className="text-xs text-gray-500">
              {selected.origin} → {selected.destination} · {SYM[selected.currency] ?? selected.currency}{selected.price.toLocaleString()} per person
            </p>
          </div>

          <p className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider">Passenger Details</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">First name <span className="text-red-400">*</span></label>
              <input value={passFirst} onChange={e => setPassFirst(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Last name <span className="text-red-400">*</span></label>
              <input value={passLast} onChange={e => setPassLast(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Date of birth <span className="text-red-400">*</span></label>
              <input type="date" value={passDob} onChange={e => setPassDob(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Passport number</label>
              <input value={passPassport} onChange={e => setPassPassport(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gender</label>
              <select value={passGender} onChange={e => setPassGender(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] mt-1 bg-white">
                <option value="m">Male</option>
                <option value="f">Female</option>
              </select>
            </div>
          </div>

          <button onClick={() => setStep('confirm')}
            disabled={!passFirst || !passLast || !passDob}
            className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-50">
            Review Booking
          </button>
        </div>
      )}

      {/* ── CONFIRM ── */}
      {step === 'confirm' && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-bold text-[#0B1F3A] text-lg">Confirm Booking</h2>

          <div className="space-y-0.5">
            {[
              ['Client',    clientName],
              ['Email',     clientEmail],
              ['Flight',    `${selected.airline} ${selected.flightNumber}`],
              ['Route',     `${selected.origin} → ${selected.destination}`],
              ['Depart',    depart],
              ['Passenger', `${passFirst} ${passLast}`],
              ['Total',     `${SYM[selected.currency] ?? selected.currency}${selected.price.toLocaleString()} ${selected.currency}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-400">{k}</span>
                <span className="font-semibold text-[#0B1F3A]">{v}</span>
              </div>
            ))}
          </div>

          {bookErr && <p className="text-red-500 text-sm">{bookErr}</p>}

          <button onClick={handleBook} disabled={booking}
            className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold py-3.5 rounded-xl hover:bg-[#b8973f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {booking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {booking ? 'Booking…' : 'Confirm Booking'}
          </button>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="font-bold text-[#0B1F3A] text-xl mb-1">Flight Booked!</h2>
          <p className="text-gray-400 text-sm mb-2">Booking reference:</p>
          <p className="font-mono text-lg font-bold text-[#C9A84C] mb-6">{bookingRef}</p>
          <p className="text-gray-400 text-xs mb-6">Confirmation email sent to {clientEmail}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setStep('search'); setSelected(null); setBookingRef(''); setQuoteLink(null) }}
              className="px-6 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50">
              New Booking
            </button>
            <Link href="/admin/book"
              className="px-6 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm hover:bg-[#162d52]">
              Back to Booking Centre
            </Link>
          </div>
        </div>
      )}

    </div>
  )
}

export default function AdminFlightBookingPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto flex items-center justify-center min-h-[300px] text-gray-400 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    }>
      <AdminFlightBookingInner />
    </Suspense>
  )
}
