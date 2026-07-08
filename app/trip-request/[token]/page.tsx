'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: 'Your Trip',     icon: '✈️', desc: 'Where are you going?' },
  { id: 2, title: 'Preferences',   icon: '⭐', desc: 'What matters most to you?' },
  { id: 3, title: 'Flight & Room', icon: '🛋️', desc: 'Travel comfort preferences' },
  { id: 4, title: 'Passport Info', icon: '🛂', desc: 'Travel document details' },
  { id: 5, title: 'Extras',        icon: '✨', desc: 'Visas, insurance & loyalty' },
  { id: 6, title: 'Review & Sign', icon: '✍️', desc: 'Confirm your request' },
]

const BUDGET_OPTIONS = [
  { value: '£1,500-£3,000',  label: '£1,500 – £3,000',  tag: 'Budget Explorer',      icon: '💰', desc: 'Great value packages' },
  { value: '£3,000-£6,000',  label: '£3,000 – £6,000',  tag: 'Comfort Seeker',       icon: '✈️', desc: 'Comfortable & stylish' },
  { value: '£6,000-£10,000', label: '£6,000 – £10,000', tag: 'Premium Experience',   icon: '💎', desc: '4-5 star experiences' },
  { value: '£10,000+',       label: '£10,000+',          tag: 'Luxury Unlimited',     icon: '👑', desc: 'The very best of everything' },
]

const VIBE_OPTIONS = [
  { value: 'romantic',   label: 'Romantic',    icon: '🌹', desc: 'Intimate escapes' },
  { value: 'relaxation', label: 'Relaxation',  icon: '🏖️', desc: 'Rest & recharge' },
  { value: 'adventure',  label: 'Adventure',   icon: '🌍', desc: 'Thrill & explore' },
  { value: 'party',      label: 'Party',       icon: '🎉', desc: 'Nightlife & fun' },
  { value: 'culture',    label: 'Culture',     icon: '🎨', desc: 'Art & history' },
  { value: 'family',     label: 'Family',      icon: '👨‍👩‍👧', desc: 'Kids welcome' },
  { value: 'food',       label: 'Food & Wine', icon: '🍷', desc: 'Culinary journey' },
  { value: 'wellness',   label: 'Wellness',    icon: '🧘', desc: 'Spa & mindfulness' },
]

const ACTIVITY_OPTIONS = [
  { value: 'beach',       label: 'Beach & Water',     icon: '🏄' },
  { value: 'casino',      label: 'Casino',            icon: '🎰' },
  { value: 'scuba',       label: 'Scuba Diving',      icon: '🤿' },
  { value: 'adventure',   label: 'Adventure Sports',  icon: '🧗' },
  { value: 'golf',        label: 'Golf',              icon: '⛳' },
  { value: 'arts',        label: 'Arts & Theater',    icon: '🎭' },
  { value: 'nightlife',   label: 'Nightlife',         icon: '🌃' },
  { value: 'shopping',    label: 'Shopping',          icon: '🛍️' },
  { value: 'history',     label: 'History & Museums', icon: '🏛️' },
  { value: 'nature',      label: 'Nature & Hiking',   icon: '🏔️' },
  { value: 'foodtours',   label: 'Food Tours',        icon: '🍜' },
  { value: 'photography', label: 'Photography',       icon: '📸' },
]

const HOTEL_OPTIONS = [
  { value: 'economy',  label: 'Budget-Friendly', icon: '🏨', desc: '1-2 star, clean & comfortable' },
  { value: 'moderate', label: 'Mid-Range',        icon: '🏩', desc: '3 star, great value' },
  { value: 'luxury',   label: 'Luxury',           icon: '🏰', desc: '4-5 star, premium amenities' },
  { value: 'boutique', label: 'Boutique',         icon: '🌿', desc: 'Unique, intimate properties' },
  { value: 'resort',   label: 'All-Inclusive',    icon: '🌴', desc: 'Everything included' },
  { value: 'villa',    label: 'Private Villa',    icon: '🏡', desc: 'Exclusive, private retreat' },
]

const DESTINATION_IMAGES: Record<string, string> = {
  'dubai':    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80&fit=crop',
  'london':   'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80&fit=crop',
  'canada':   'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=600&q=80&fit=crop',
  'toronto':  'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=600&q=80&fit=crop',
  'paris':    'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&q=80&fit=crop',
  'new york': 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&q=80&fit=crop',
  'bali':     'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80&fit=crop',
  'maldives': 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=600&q=80&fit=crop',
  'ghana':    'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?w=600&q=80&fit=crop',
  'turkey':   'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80&fit=crop',
  'kenya':    'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=600&q=80&fit=crop',
  'greece':   'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&q=80&fit=crop',
  'italy':    'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?w=600&q=80&fit=crop',
  'japan':    'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80&fit=crop',
  'usa':      'https://images.unsplash.com/photo-1502920514313-52581002a659?w=600&q=80&fit=crop',
  'spain':    'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=600&q=80&fit=crop',
  'schengen': 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&q=80&fit=crop',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  firstName: string; lastName: string; email: string; phone: string; whatsapp: string;
  destination: string; departureCity: string; departureDate: string; returnDate: string;
  datesFlexible: boolean; numberOfTravellers: number; tripType: string;
  budgetRange: string; budgetCurrency: string;
  hotelPreference: string; vibes: string[]; activities: string[];
  mustDos: string; dietaryNeeds: string; mobilityNeeds: string;
  travellingWithChildren: boolean; childrenAges: string[];
  seatPreference: string; cabinClass: string; bedPreference: string;
  mealPreference: string; directFlightsOnly: boolean;
  passportName: string; passportNumber: string; passportCountry: string;
  passportIssueDate: string; passportExpiry: string; dateOfBirth: string;
  gender: string; placeOfBirth: string; nationality: string; citizenship: string;
  loyaltyPrograms: Array<{ program: string; number: string }>;
  hasValidVisa: boolean | null; visaCountry: string; needsVisaHelp: boolean;
  needsTravelInsurance: boolean; notes: string; signature: string; agreedToTerms: boolean;
}

const defaultForm: FormData = {
  firstName: '', lastName: '', email: '', phone: '', whatsapp: '',
  destination: '', departureCity: 'London', departureDate: '', returnDate: '',
  datesFlexible: false, numberOfTravellers: 2, tripType: 'leisure',
  budgetRange: '', budgetCurrency: 'GBP',
  hotelPreference: '', vibes: [], activities: [],
  mustDos: '', dietaryNeeds: '', mobilityNeeds: '',
  travellingWithChildren: false, childrenAges: [],
  seatPreference: 'window', cabinClass: 'economy', bedPreference: 'king',
  mealPreference: '', directFlightsOnly: false,
  passportName: '', passportNumber: '', passportCountry: '', passportIssueDate: '',
  passportExpiry: '', dateOfBirth: '', gender: '', placeOfBirth: '',
  nationality: '', citizenship: '',
  loyaltyPrograms: [],
  hasValidVisa: null, visaCountry: '', needsVisaHelp: false,
  needsTravelInsurance: false, notes: '', signature: '', agreedToTerms: false,
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

function SignaturePad({ onSign }: { onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(false)

  const onSignRef = useRef(onSign)
  useEffect(() => { onSignRef.current = onSign }, [onSign])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      if ('touches' in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        }
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      drawing.current = true
      const p = getPos(e)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      if (!drawing.current) return
      const p = getPos(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    const end = () => {
      drawing.current = false
      setSigned(true)
      onSignRef.current(canvas.toDataURL())
    }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)
    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', end)
    }
  }, [])

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
    onSignRef.current('')
  }

  return (
    <div>
      <div className="bg-white rounded-2xl p-1 relative">
        <canvas
          ref={canvasRef}
          width={560}
          height={160}
          className="w-full cursor-crosshair rounded-xl touch-none"
          style={{ height: '160px' }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {!signed && <p className="text-gray-300 text-sm">Sign here ↑</p>}
        </div>
      </div>
      {signed && (
        <button onClick={clear} className="mt-2 text-xs text-white/40 hover:text-white/60 transition">
          Clear signature
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TripRequestFormPage() {
  const params = useParams<{ token: string }>()
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notfound' | 'submitted'>('loading')
  const [request, setRequest] = useState<{
    referenceNumber: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null>(null)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ referenceNumber: string } | null>(null)
  const [form, setForm] = useState<FormData>(defaultForm)

  useEffect(() => {
    fetch(`/api/trip-request/${params.token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadState('notfound'); return }
        if (data.alreadySubmitted) { setLoadState('submitted'); return }
        setRequest(data.request)
        if (data.request.firstName) {
          setForm(f => ({
            ...f,
            firstName: data.request.firstName || '',
            lastName: data.request.lastName || '',
            email: data.request.email || '',
            phone: data.request.phone || '',
          }))
        }
        setLoadState('ready')
      })
      .catch(() => setLoadState('notfound'))
  }, [params.token])

  // Suppress unused variable warning — request is set for potential future use
  void request

  const upd = useCallback(<K extends keyof FormData>(k: K, v: FormData[K]) => {
    setForm(f => ({ ...f, [k]: v }))
  }, [])

  const toggle = useCallback((field: 'vibes' | 'activities', val: string) => {
    setForm(f => ({
      ...f,
      [field]: (f[field] as string[]).includes(val)
        ? (f[field] as string[]).filter(x => x !== val)
        : [...(f[field] as string[]), val],
    }))
  }, [])

  const submit = async () => {
    setSubmitting(true)
    const res = await fetch(`/api/trip-request/${params.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSubmitting(false)
    if (data.success) setDone(data)
  }

  const destImg = Object.entries(DESTINATION_IMAGES).find(
    ([k]) => form.destination.toLowerCase().includes(k)
  )?.[1]
  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  // ── Loading / Error States ──────────────────────────────────────────────────
  if (loadState === 'loading') return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 border-[3px] border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/40 text-sm">Loading your form…</p>
      </div>
    </div>
  )

  if (loadState === 'notfound') return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-6xl mb-6">🔗</p>
        <h1 className="text-white font-bold text-2xl mb-3">Link Not Found</h1>
        <p className="text-white/40 text-sm mb-8 leading-relaxed">
          This link may have expired or is invalid. Please contact your Walz Travels agent for a new one.
        </p>
        <a href="https://walztravels.com" className="bg-amber-500 text-black font-bold px-6 py-3 rounded-xl text-sm hover:bg-amber-400 transition inline-block">
          Visit Walz Travels
        </a>
      </div>
    </div>
  )

  if (loadState === 'submitted') return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-6xl mb-6">✅</p>
        <h1 className="text-white font-bold text-2xl mb-3">Already Submitted!</h1>
        <p className="text-white/40 text-sm mb-8 leading-relaxed">
          Your trip request has already been submitted. Our team is reviewing your preferences and will be in touch soon.
        </p>
        <a
          href="https://wa.me/12317902336"
          target="_blank"
          rel="noreferrer"
          className="block w-full bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-4 rounded-2xl text-base transition text-center mb-3">
          💬 Message Us on WhatsApp
        </a>
        <a href="https://walztravels.com" className="text-white/30 text-sm hover:text-white transition">
          Visit Walz Travels
        </a>
      </div>
    </div>
  )

  // ── Done Screen ─────────────────────────────────────────────────────────────
  if (done) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center px-6">
      <div className="text-center max-w-sm w-full">
        <div className="w-24 h-24 bg-amber-500/20 border-2 border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">✈️</span>
        </div>
        <h1 className="text-white font-bold text-3xl mb-3">You&apos;re All Set, {form.firstName}!</h1>
        <p className="text-white/50 text-sm mb-8 leading-relaxed">
          Your trip request has been submitted. Our experts will review your preferences and craft a personalised
          itinerary for {form.destination || 'your destination'}.
        </p>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
          <p className="text-white/30 text-xs uppercase tracking-wider mb-2">Your Reference</p>
          <p className="text-amber-400 font-mono font-bold text-2xl">{done.referenceNumber}</p>
        </div>
        <div className="space-y-3">
          <a
            href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi Walz Travels! I've just submitted my trip request for ${form.destination}. Reference: ${done.referenceNumber}`)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-4 rounded-2xl text-base transition">
            💬 Message Us on WhatsApp
          </a>
          <a href="https://walztravels.com"
            className="flex items-center justify-center w-full border border-white/10 text-white/40 font-medium px-6 py-3 rounded-2xl text-sm hover:text-white transition">
            Visit Walz Travels
          </a>
        </div>
      </div>
    </div>
  )

  // ── Input styles ────────────────────────────────────────────────────────────
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-[15px] placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 transition'
  const sel = 'w-full bg-[#0b1525] border border-white/10 rounded-xl px-4 py-3.5 text-white text-[15px] focus:outline-none focus:border-amber-500/50 transition'
  const lbl = 'text-white/50 text-xs font-bold uppercase tracking-wider block mb-2'

  return (
    <div className="min-h-screen bg-[#060f1e] pb-24">
      {/* Header */}
      <div className="bg-[#060f1e]/95 backdrop-blur-xl border-b border-white/8 px-4 py-4 sticky top-0 z-20">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-amber-400 font-black text-sm tracking-tight">WALZ TRAVELS</span>
            <span className="text-white/20 text-xs">Step {step} of {STEPS.length}</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-8">
        {/* Destination hero image */}
        {step === 1 && destImg && form.destination.length > 2 && (
          <div className="relative h-40 rounded-2xl overflow-hidden mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={destImg} alt={form.destination} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060f1e] via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-4">
              <p className="text-white font-bold text-lg">{form.destination}</p>
            </div>
          </div>
        )}

        {/* Step header */}
        <div className="mb-8">
          <p className="text-amber-500 text-3xl mb-2">{STEPS[step - 1].icon}</p>
          <h1 className="text-white font-bold text-2xl">{STEPS[step - 1].title}</h1>
          <p className="text-white/40 text-sm mt-1">{STEPS[step - 1].desc}</p>
        </div>

        {/* ── STEP 1: Your Trip ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>First Name *</label>
                <input value={form.firstName} onChange={e => upd('firstName', e.target.value)} placeholder="Amara" className={inp} />
              </div>
              <div>
                <label className={lbl}>Last Name *</label>
                <input value={form.lastName} onChange={e => upd('lastName', e.target.value)} placeholder="Johnson" className={inp} />
              </div>
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input type="email" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="your@email.com" className={inp} />
            </div>
            <div>
              <label className={lbl}>Phone / WhatsApp</label>
              <input value={form.phone} onChange={e => upd('phone', e.target.value)} placeholder="+44 7XXX XXXXXX" className={inp} />
            </div>
            <div>
              <label className={lbl}>Destination *</label>
              <input value={form.destination} onChange={e => upd('destination', e.target.value)} placeholder="e.g. Dubai, UAE" className={inp} />
            </div>
            <div>
              <label className={lbl}>Departing From</label>
              <input value={form.departureCity} onChange={e => upd('departureCity', e.target.value)} placeholder="e.g. London Heathrow" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Departure Date</label>
                <input type="date" value={form.departureDate} onChange={e => upd('departureDate', e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Return Date</label>
                <input type="date" value={form.returnDate} onChange={e => upd('returnDate', e.target.value)} className={inp} />
              </div>
            </div>
            <label className="flex items-center gap-3 bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/8 transition">
              <input type="checkbox" checked={form.datesFlexible} onChange={e => upd('datesFlexible', e.target.checked)} className="w-5 h-5 rounded accent-amber-500" />
              <div>
                <p className="text-white font-medium text-sm">My dates are flexible</p>
                <p className="text-white/30 text-xs">We can find better deals if dates can shift</p>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Number of Travellers</label>
                <input
                  type="number" min="1" max="50"
                  value={form.numberOfTravellers}
                  onChange={e => upd('numberOfTravellers', Number(e.target.value))}
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Trip Type</label>
                <select value={form.tripType} onChange={e => upd('tripType', e.target.value)} className={sel}>
                  <option value="leisure">🏖️ Leisure</option>
                  <option value="honeymoon">💍 Honeymoon</option>
                  <option value="group">👥 Group</option>
                  <option value="business">💼 Business</option>
                  <option value="family">👨‍👩‍👧‍👦 Family</option>
                  <option value="solo">🎒 Solo</option>
                  <option value="pilgrimage">🕌 Pilgrimage</option>
                  <option value="medical">🏥 Medical</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Preferences ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-8">
            {/* Budget */}
            <div>
              <label className={lbl}>Budget Per Person</label>
              <div className="grid grid-cols-1 gap-3">
                {BUDGET_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => upd('budgetRange', form.budgetRange === opt.value ? '' : opt.value)}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition text-left ${form.budgetRange === opt.value ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <span className="text-3xl">{opt.icon}</span>
                    <div className="flex-1">
                      <p className={`font-bold text-base ${form.budgetRange === opt.value ? 'text-amber-400' : 'text-white'}`}>{opt.label}</p>
                      <p className="text-amber-500 text-xs font-bold">{opt.tag}</p>
                      <p className="text-white/40 text-xs">{opt.desc}</p>
                    </div>
                    {form.budgetRange === opt.value && <span className="text-amber-500 text-xl">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Vibes */}
            <div>
              <label className={lbl}>Trip Vibes (select all that apply)</label>
              <div className="grid grid-cols-2 gap-3">
                {VIBE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => toggle('vibes', opt.value)}
                    className={`p-4 rounded-2xl border-2 transition text-left ${form.vibes.includes(opt.value) ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <p className="text-3xl mb-1">{opt.icon}</p>
                    <p className={`font-bold text-sm ${form.vibes.includes(opt.value) ? 'text-amber-400' : 'text-white'}`}>{opt.label}</p>
                    <p className="text-white/40 text-xs">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Activities */}
            <div>
              <label className={lbl}>Activities You Love</label>
              <div className="grid grid-cols-3 gap-2">
                {ACTIVITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => toggle('activities', opt.value)}
                    className={`p-3 rounded-xl border transition flex flex-col items-center text-center ${form.activities.includes(opt.value) ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <span className="text-2xl mb-1">{opt.icon}</span>
                    <span className={`text-xs font-medium leading-tight ${form.activities.includes(opt.value) ? 'text-amber-400' : 'text-white/70'}`}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Hotel */}
            <div>
              <label className={lbl}>Hotel Preference</label>
              <div className="grid grid-cols-2 gap-3">
                {HOTEL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => upd('hotelPreference', form.hotelPreference === opt.value ? '' : opt.value)}
                    className={`p-4 rounded-2xl border-2 transition text-left ${form.hotelPreference === opt.value ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <p className="text-2xl mb-1">{opt.icon}</p>
                    <p className={`font-bold text-sm ${form.hotelPreference === opt.value ? 'text-amber-400' : 'text-white'}`}>{opt.label}</p>
                    <p className="text-white/40 text-xs">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Must-dos */}
            <div>
              <label className={lbl}>Must-Dos / Special Requests</label>
              <textarea
                value={form.mustDos}
                onChange={e => upd('mustDos', e.target.value)}
                rows={3}
                placeholder="e.g. Burj Khalifa at sunset, desert safari, seafront restaurant…"
                className={`${inp} resize-none`}
              />
            </div>

            {/* Dietary */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Dietary Needs</label>
                <input value={form.dietaryNeeds} onChange={e => upd('dietaryNeeds', e.target.value)} placeholder="e.g. Halal, vegetarian…" className={inp} />
              </div>
              <div>
                <label className={lbl}>Mobility Needs</label>
                <input value={form.mobilityNeeds} onChange={e => upd('mobilityNeeds', e.target.value)} placeholder="e.g. Wheelchair access" className={inp} />
              </div>
            </div>

            {/* Children */}
            <div>
              <label className="flex items-center gap-3 bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/8 transition mb-2">
                <input
                  type="checkbox"
                  checked={form.travellingWithChildren}
                  onChange={e => upd('travellingWithChildren', e.target.checked)}
                  className="w-5 h-5 rounded accent-amber-500"
                />
                <p className="text-white font-medium text-sm">Travelling with children</p>
              </label>
              {form.travellingWithChildren && (
                <input
                  value={form.childrenAges.join(', ')}
                  onChange={e => upd('childrenAges', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Children's ages e.g. 3, 7, 12"
                  className={inp}
                />
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Flight & Room ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label className={lbl}>Cabin Class</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'economy',         label: 'Economy',         icon: '💺', desc: 'Affordable & comfortable' },
                  { value: 'premium_economy', label: 'Premium Economy', icon: '🎫', desc: 'Extra legroom & comfort' },
                  { value: 'business',        label: 'Business Class',  icon: '💼', desc: 'Lie-flat seats & lounge' },
                  { value: 'first',           label: 'First Class',     icon: '👑', desc: 'Ultimate luxury in the air' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => upd('cabinClass', opt.value)}
                    className={`p-4 rounded-2xl border-2 transition text-left ${form.cabinClass === opt.value ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <p className="text-2xl mb-1">{opt.icon}</p>
                    <p className={`font-bold text-sm ${form.cabinClass === opt.value ? 'text-amber-400' : 'text-white'}`}>{opt.label}</p>
                    <p className="text-white/40 text-xs">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Seat Preference</label>
              <div className="flex gap-3">
                {[
                  { value: 'window', label: '🪟 Window' },
                  { value: 'middle', label: '🧍 Middle' },
                  { value: 'aisle',  label: '🚶 Aisle' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => upd('seatPreference', opt.value)}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition ${form.seatPreference === opt.value ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Bed Preference</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'king',   label: '🛏️ King' },
                  { value: 'double', label: '🛌 Double' },
                  { value: 'twin',   label: '🛏️🛏️ Twin' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => upd('bedPreference', opt.value)}
                    className={`py-3 px-3 rounded-xl border-2 font-bold text-sm transition ${form.bedPreference === opt.value ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Meal Preference</label>
              <select value={form.mealPreference} onChange={e => upd('mealPreference', e.target.value)} className={sel}>
                <option value="">No preference</option>
                <option value="standard">Standard</option>
                <option value="halal">Halal</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="vegan">Vegan</option>
                <option value="kosher">Kosher</option>
                <option value="diabetic">Diabetic</option>
                <option value="gluten_free">Gluten Free</option>
                <option value="child">Child Meal</option>
              </select>
            </div>

            <label className="flex items-center gap-3 bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/8 transition">
              <input
                type="checkbox"
                checked={form.directFlightsOnly}
                onChange={e => upd('directFlightsOnly', e.target.checked)}
                className="w-5 h-5 rounded accent-amber-500"
              />
              <div>
                <p className="text-white font-medium text-sm">Direct flights only</p>
                <p className="text-white/30 text-xs">No stopovers or connections</p>
              </div>
            </label>
          </div>
        )}

        {/* ── STEP 4: Passport & Personal ───────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-amber-300 text-xs font-bold mb-1">🔒 Why we need this</p>
              <p className="text-amber-200/60 text-xs leading-relaxed">
                Your passport details are required to book flights and check visa requirements.
                All information is stored securely and never shared.
              </p>
            </div>
            <div>
              <label className={lbl}>Full Name (as on passport)</label>
              <input value={form.passportName} onChange={e => upd('passportName', e.target.value)} placeholder="AMARA JOHNSON" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Passport Number</label>
                <input value={form.passportNumber} onChange={e => upd('passportNumber', e.target.value)} placeholder="123456789" className={inp} />
              </div>
              <div>
                <label className={lbl}>Issuing Country</label>
                <input value={form.passportCountry} onChange={e => upd('passportCountry', e.target.value)} placeholder="United Kingdom" className={inp} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Issue Date</label>
                <input type="date" value={form.passportIssueDate} onChange={e => upd('passportIssueDate', e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Expiry Date</label>
                <input type="date" value={form.passportExpiry} onChange={e => upd('passportExpiry', e.target.value)} className={inp} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={e => upd('dateOfBirth', e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Gender</label>
                <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>Place of Birth</label>
              <input value={form.placeOfBirth} onChange={e => upd('placeOfBirth', e.target.value)} placeholder="Lagos, Nigeria" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nationality</label>
                <input value={form.nationality} onChange={e => upd('nationality', e.target.value)} placeholder="British" className={inp} />
              </div>
              <div>
                <label className={lbl}>Citizenship</label>
                <input value={form.citizenship} onChange={e => upd('citizenship', e.target.value)} placeholder="British" className={inp} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 5: Extras ────────────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-6">
            {/* Visa */}
            <div>
              <label className={lbl}>
                Do you have a valid visa for {form.destination || 'your destination'}?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: true,  label: 'Yes ✅' },
                  { value: false, label: 'No ❌' },
                  { value: null,  label: "Not Sure 🤷" },
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => upd('hasValidVisa', opt.value)}
                    className={`py-3 px-3 rounded-xl border-2 font-bold text-sm transition ${form.hasValidVisa === opt.value ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {form.hasValidVisa === false && (
              <label className="flex items-center gap-3 bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/8 transition">
                <input
                  type="checkbox"
                  checked={form.needsVisaHelp}
                  onChange={e => upd('needsVisaHelp', e.target.checked)}
                  className="w-5 h-5 rounded accent-amber-500"
                />
                <div>
                  <p className="text-white font-medium text-sm">I&apos;d like help with my visa application</p>
                  <p className="text-white/30 text-xs">Our visa team will guide you through the process</p>
                </div>
              </label>
            )}

            {/* Insurance */}
            <div>
              <label className={lbl}>Travel Insurance</label>
              <label className="flex items-center gap-3 bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/8 transition">
                <input
                  type="checkbox"
                  checked={form.needsTravelInsurance}
                  onChange={e => upd('needsTravelInsurance', e.target.checked)}
                  className="w-5 h-5 rounded accent-amber-500"
                />
                <div>
                  <p className="text-white font-medium text-sm">Include travel insurance</p>
                  <p className="text-white/30 text-xs">Comprehensive cover for medical, cancellation &amp; more</p>
                </div>
              </label>
            </div>

            {/* Loyalty Programs */}
            <div>
              <label className={lbl}>Frequent Flyer / Loyalty Programs</label>
              <div className="space-y-3">
                {form.loyaltyPrograms.map((lp, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={lp.program}
                      onChange={e => {
                        const a = [...form.loyaltyPrograms]
                        a[i] = { ...a[i], program: e.target.value }
                        upd('loyaltyPrograms', a)
                      }}
                      placeholder="e.g. British Airways"
                      className={`${inp} flex-1`}
                    />
                    <input
                      value={lp.number}
                      onChange={e => {
                        const a = [...form.loyaltyPrograms]
                        a[i] = { ...a[i], number: e.target.value }
                        upd('loyaltyPrograms', a)
                      }}
                      placeholder="Member number"
                      className={`${inp} flex-1`}
                    />
                    <button
                      onClick={() => upd('loyaltyPrograms', form.loyaltyPrograms.filter((_, j) => j !== i))}
                      className="text-white/30 hover:text-red-400 transition px-3">
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => upd('loyaltyPrograms', [...form.loyaltyPrograms, { program: '', number: '' }])}
                  className="w-full py-3 border border-dashed border-white/20 rounded-xl text-white/40 text-sm hover:text-white/60 hover:border-white/30 transition">
                  + Add Loyalty Program
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={lbl}>Anything else we should know?</label>
              <textarea
                value={form.notes}
                onChange={e => upd('notes', e.target.value)}
                rows={4}
                placeholder="Special occasions, health requirements, preferred airlines, room preferences…"
                className={`${inp} resize-none`}
              />
            </div>
          </div>
        )}

        {/* ── STEP 6: Review & Sign ─────────────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-bold text-base">Your Trip Summary</h3>
              <div className="space-y-2 text-sm">
                {form.destination && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Destination</span>
                    <span className="text-white font-medium">{form.destination}</span>
                  </div>
                )}
                {form.departureDate && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Dates</span>
                    <span className="text-white font-medium">{form.departureDate} → {form.returnDate || '?'}</span>
                  </div>
                )}
                {form.numberOfTravellers > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Travellers</span>
                    <span className="text-white font-medium">{form.numberOfTravellers}</span>
                  </div>
                )}
                {form.budgetRange && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Budget</span>
                    <span className="text-amber-400 font-medium">{form.budgetRange}</span>
                  </div>
                )}
                {form.cabinClass && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Cabin</span>
                    <span className="text-white font-medium capitalize">{form.cabinClass.replace('_', ' ')}</span>
                  </div>
                )}
                {form.hotelPreference && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Hotel</span>
                    <span className="text-white font-medium capitalize">{form.hotelPreference}</span>
                  </div>
                )}
                {form.vibes.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Vibes</span>
                    <span className="text-white font-medium">{form.vibes.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Signature */}
            <div>
              <label className={lbl}>Your Signature</label>
              <p className="text-white/30 text-xs mb-3">Sign below to confirm your trip request</p>
              <SignaturePad onSign={(url) => upd('signature', url)} />
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/8 transition">
              <input
                type="checkbox"
                checked={form.agreedToTerms}
                onChange={e => upd('agreedToTerms', e.target.checked)}
                className="w-5 h-5 rounded accent-amber-500 mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-white font-medium text-sm">I agree to Walz Travels&apos; terms</p>
                <p className="text-white/30 text-xs mt-1 leading-relaxed">
                  By submitting this form, I confirm that the information provided is accurate.
                  I understand that Walz Travels will use this information to create a personalised travel proposal.
                </p>
              </div>
            </label>

            {/* Submit */}
            <button
              onClick={submit}
              disabled={submitting || !form.agreedToTerms || !form.signature}
              className="w-full py-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg transition flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting
                ? <><div className="w-5 h-5 border-[3px] border-black border-t-transparent rounded-full animate-spin" />Submitting…</>
                : '✈️ Submit My Trip Request'}
            </button>
            {!form.agreedToTerms && (
              <p className="text-white/30 text-xs text-center">Please agree to the terms to submit</p>
            )}
            {form.agreedToTerms && !form.signature && (
              <p className="text-white/30 text-xs text-center">Please sign above to submit</p>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-10">
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-4 rounded-2xl border border-white/10 text-white/50 font-bold hover:text-white hover:border-white/20 transition">
              ← Back
            </button>
          )}
          {step < STEPS.length && (
            <button
              onClick={() => setStep(s => Math.min(s + 1, STEPS.length))}
              disabled={step === 1 && (!form.firstName || !form.destination)}
              className="flex-1 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-base transition disabled:opacity-40 disabled:cursor-not-allowed">
              Continue →
            </button>
          )}
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mt-6">
          {STEPS.map(s => (
            <button
              key={s.id}
              onClick={() => s.id < step && setStep(s.id)}
              className={`transition-all ${s.id === step ? 'w-6 h-2 bg-amber-500 rounded-full' : s.id < step ? 'w-2 h-2 bg-amber-500/50 rounded-full' : 'w-2 h-2 bg-white/20 rounded-full'}`}
            />
          ))}
        </div>

        <div className="pb-16" />
      </div>
    </div>
  )
}
