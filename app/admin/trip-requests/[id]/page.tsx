'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface TripRequestFull {
  id: string; referenceNumber: string; status: string; token: string;
  sentBy: string | null; sentAt: string | null; itineraryId: string | null;
  firstName: string | null; lastName: string | null; email: string | null;
  phone: string | null; whatsapp: string | null;
  destination: string | null; departureCity: string | null;
  departureDate: string | null; returnDate: string | null;
  datesFlexible: boolean | null; numberOfTravellers: number | null;
  tripType: string | null; budgetRange: string | null; budgetCurrency: string | null;
  hotelPreference: string | null; vibes: string | null; activities: string | null;
  mustDos: string | null; dietaryNeeds: string | null; mobilityNeeds: string | null;
  travellingWithChildren: boolean | null; childrenAges: string | null;
  seatPreference: string | null; cabinClass: string | null;
  bedPreference: string | null; mealPreference: string | null;
  directFlightsOnly: boolean | null;
  passportName: string | null; passportNumber: string | null;
  passportCountry: string | null; passportIssueDate: string | null;
  passportExpiry: string | null; dateOfBirth: string | null; gender: string | null;
  placeOfBirth: string | null; nationality: string | null; citizenship: string | null;
  loyaltyPrograms: string | null; hasValidVisa: boolean | null;
  visaCountry: string | null; needsVisaHelp: boolean | null;
  needsTravelInsurance: boolean | null; notes: string | null;
  signature: string | null; signedAt: string | null; agreedToTerms: boolean | null;
  submittedAt: string | null; viewedByStaffAt: string | null;
  ipAddress: string | null; deviceType: string | null; createdAt: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Sent — Awaiting Response',      color: 'bg-blue-500/20 text-blue-400'    },
  submitted: { label: 'Submitted ✅',                   color: 'bg-amber-500/20 text-amber-400'  },
  viewed:    { label: 'Viewed by Staff 👁',             color: 'bg-purple-500/20 text-purple-400' },
  converted: { label: 'Converted to Itinerary ✈️',     color: 'bg-green-500/20 text-green-400'  },
  archived:  { label: 'Archived',                       color: 'bg-white/5 text-white/30'        },
}

function safeJson<T>(json: string | null | undefined, fallback: T): T {
  try { return json ? JSON.parse(json) as T : fallback } catch { return fallback }
}

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Field({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  if (!value && value !== 0 && value !== false) return null
  return (
    <div>
      <p className="text-white/30 text-xs font-bold uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-white text-sm">{String(value)}</p>
    </div>
  )
}

export default function TripRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [req, setReq] = useState<TripRequestFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/trip-requests/${id}`)
    const data = await res.json()
    setReq(data.request)
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  const convert = async () => {
    if (!req) return
    setConverting(true)
    const res = await fetch(`/api/admin/trip-requests/${id}/convert`, { method: 'POST' })
    const data = await res.json()
    setConverting(false)
    if (data.redirectTo) router.push(data.redirectTo)
  }

  const archive = async () => {
    if (!req) return
    setArchiving(true)
    await fetch(`/api/admin/trip-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    setArchiving(false)
    setReq(r => r ? { ...r, status: 'archived' } : r)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`https://walztravels.com/trip-request/${req?.token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!req) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center text-white/40">Not found</div>
  )

  const vibes = safeJson<string[]>(req.vibes, [])
  const activities = safeJson<string[]>(req.activities, [])
  const loyaltyPrograms = safeJson<Array<{ program: string; number: string }>>(req.loyaltyPrograms, [])
  const isSubmitted = ['submitted', 'viewed', 'converted'].includes(req.status)

  return (
    <div className="min-h-screen bg-[#060f1e] text-white">
      {/* Top bar */}
      <div className="border-b border-white/8 px-6 py-4 bg-[#060f1e] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/trip-requests" className="text-white/30 hover:text-white text-sm transition">← Requests</Link>
            <div>
              <h1 className="text-white font-bold">
                {req.firstName || ''} {req.lastName || ''}
                {!req.firstName && !req.lastName && <span className="text-white/40">Unknown Client</span>}
              </h1>
              <p className="text-white/30 text-xs">{req.referenceNumber} · {req.destination || 'No destination'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={copyLink} className="text-xs text-white/40 hover:text-white transition px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10">
              {copied ? '✓ Copied' : '🔗 Copy Link'}
            </button>
            {req.status !== 'archived' && req.status !== 'converted' && (
              <button onClick={archive} disabled={archiving} className="text-xs text-white/40 hover:text-red-400 transition px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10">
                Archive
              </button>
            )}
            {req.itineraryId && (
              <Link href={`/admin/itinerary-planner/${req.itineraryId}`} className="bg-green-500/20 text-green-400 font-bold text-sm px-4 py-2 rounded-xl hover:bg-green-500/30 transition">
                View Itinerary →
              </Link>
            )}
            {isSubmitted && !req.itineraryId && (
              <button onClick={convert} disabled={converting}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition flex items-center gap-2 disabled:opacity-50">
                {converting
                  ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Converting…</>
                  : '✨ Convert to Itinerary'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Status bar */}
        <div className="bg-white/5 border border-white/8 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${STATUS[req.status]?.color ?? ''}`}>
              {STATUS[req.status]?.label ?? req.status}
            </span>
            {req.submittedAt && <span className="text-white/30 text-xs">Submitted {fmt(req.submittedAt)}</span>}
            {req.deviceType && <span className="text-white/20 text-xs capitalize">{req.deviceType}</span>}
          </div>
          <span className="text-white/20 text-xs font-mono">{req.referenceNumber}</span>
        </div>

        {!isSubmitted && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
            <p className="text-blue-300 font-medium text-sm mb-1">⏳ Waiting for client response</p>
            <p className="text-blue-300/60 text-xs">Form sent {fmt(req.sentAt)}. Share the link below if they haven&apos;t seen the email.</p>
            <p className="text-amber-400 text-xs font-mono mt-2 break-all">
              https://walztravels.com/trip-request/{req.token}
            </p>
          </div>
        )}

        {isSubmitted && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Info */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">👤 Client Info</h2>
              <div className="space-y-3">
                <Field label="Full Name" value={`${req.firstName || ''} ${req.lastName || ''}`.trim()} />
                <Field label="Email" value={req.email} />
                <Field label="Phone" value={req.phone} />
                <Field label="WhatsApp" value={req.whatsapp} />
              </div>
            </div>

            {/* Trip Details */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">✈️ Trip Details</h2>
              <div className="space-y-3">
                <Field label="Destination" value={req.destination} />
                <Field label="Departure City" value={req.departureCity} />
                <Field label="Departure Date" value={req.departureDate} />
                <Field label="Return Date" value={req.returnDate} />
                <Field label="Dates Flexible" value={req.datesFlexible ? 'Yes' : null} />
                <Field label="Travellers" value={req.numberOfTravellers} />
                <Field label="Trip Type" value={req.tripType} />
              </div>
            </div>

            {/* Preferences */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">⭐ Preferences</h2>
              <div className="space-y-3">
                <Field label="Budget" value={req.budgetRange} />
                <Field label="Hotel Preference" value={req.hotelPreference} />
                {vibes.length > 0 && (
                  <div>
                    <p className="text-white/30 text-xs font-bold uppercase tracking-wider mb-1">Vibes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vibes.map(v => (
                        <span key={v} className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded-full">{v}</span>
                      ))}
                    </div>
                  </div>
                )}
                {activities.length > 0 && (
                  <div>
                    <p className="text-white/30 text-xs font-bold uppercase tracking-wider mb-1">Activities</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activities.map(a => (
                        <span key={a} className="bg-white/10 text-white/60 text-xs px-2 py-0.5 rounded-full">{a}</span>
                      ))}
                    </div>
                  </div>
                )}
                <Field label="Must-Dos" value={req.mustDos} />
                <Field label="Dietary Needs" value={req.dietaryNeeds} />
                <Field label="Mobility Needs" value={req.mobilityNeeds} />
                <Field label="Travelling with Children" value={req.travellingWithChildren ? 'Yes' : null} />
              </div>
            </div>

            {/* Flight Prefs */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">🛋️ Flight &amp; Room</h2>
              <div className="space-y-3">
                <Field label="Cabin Class" value={req.cabinClass} />
                <Field label="Seat Preference" value={req.seatPreference} />
                <Field label="Bed Preference" value={req.bedPreference} />
                <Field label="Meal Preference" value={req.mealPreference} />
                <Field label="Direct Flights Only" value={req.directFlightsOnly ? 'Yes' : null} />
              </div>
            </div>

            {/* Passport */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">🛂 Passport &amp; Personal</h2>
              <div className="space-y-3">
                <Field label="Name on Passport" value={req.passportName} />
                <Field label="Passport Number" value={req.passportNumber} />
                <Field label="Issuing Country" value={req.passportCountry} />
                <Field label="Issue Date" value={req.passportIssueDate} />
                <Field label="Expiry Date" value={req.passportExpiry} />
                <Field label="Date of Birth" value={req.dateOfBirth} />
                <Field label="Gender" value={req.gender} />
                <Field label="Place of Birth" value={req.placeOfBirth} />
                <Field label="Nationality" value={req.nationality} />
                <Field label="Citizenship" value={req.citizenship} />
              </div>
            </div>

            {/* Visa & Extras */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">✨ Visa &amp; Extras</h2>
              <div className="space-y-3">
                <Field label="Has Valid Visa" value={req.hasValidVisa === true ? 'Yes' : req.hasValidVisa === false ? 'No' : null} />
                <Field label="Visa Country" value={req.visaCountry} />
                <Field label="Needs Visa Help" value={req.needsVisaHelp ? 'Yes' : null} />
                <Field label="Needs Travel Insurance" value={req.needsTravelInsurance ? 'Yes' : null} />
                {loyaltyPrograms.length > 0 && (
                  <div>
                    <p className="text-white/30 text-xs font-bold uppercase tracking-wider mb-2">Loyalty Programs</p>
                    <div className="space-y-1">
                      {loyaltyPrograms.map((lp, i) => (
                        <p key={i} className="text-white text-sm">
                          {lp.program}: <span className="font-mono text-amber-300">{lp.number}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <Field label="Notes" value={req.notes} />
              </div>
            </div>
          </div>
        )}

        {/* Signature */}
        {req.signature && (
          <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
            <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">✍️ Signature</h2>
            <div className="bg-white rounded-xl p-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={req.signature} alt="Client signature" className="max-h-24 w-auto" />
            </div>
            {req.signedAt && <p className="text-white/30 text-xs mt-2">Signed {fmt(req.signedAt)}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
