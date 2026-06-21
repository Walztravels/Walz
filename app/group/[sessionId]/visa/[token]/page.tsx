'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams }                    from 'next/navigation'

interface MemberInfo {
  sessionId:      string
  sessionName:    string
  memberId:       string
  memberName:     string
  hasSubmitted:   boolean
  sessionStatus:  string
}

const VISA_DOCS = [
  { id: 'bank_statement',      label: 'Bank statement (last 6 months)' },
  { id: 'employment_letter',   label: 'Employment / business letter' },
  { id: 'itr',                 label: 'Income Tax Return (ITR)' },
  { id: 'property_proof',      label: 'Property ownership proof' },
  { id: 'travel_history',      label: 'Previous visas / travel history' },
  { id: 'sponsor_letter',      label: 'Sponsor letter (if applicable)' },
]

const NATIONALITIES = [
  'Nigerian', 'British', 'American', 'Canadian', 'Ghanaian', 'South African',
  'Kenyan', 'Indian', 'Pakistani', 'Bangladeshi', 'Jamaican', 'Other',
]

export default function VisaProfilePage() {
  const { sessionId, token } = useParams<{ sessionId: string; token: string }>()

  const [info,        setInfo]        = useState<MemberInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [done,        setDone]        = useState(false)
  const [score,       setScore]       = useState<number | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  const [nationality,     setNationality]     = useState('')
  const [travelHistory,   setTravelHistory]   = useState<{ country: string; year: number }[]>([])
  const [countryInput,    setCountryInput]    = useState('')
  const [yearInput,       setYearInput]       = useState(new Date().getFullYear() - 1)
  const [uploadedDocs,    setUploadedDocs]    = useState<Record<string, string>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch(`/api/group/${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setInfo(d)
          // Pre-fill nationality from preferences if available
          const prefs = null // We don't expose prefs here for privacy
          setNationality(prefs ?? '')
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load member info'); setLoading(false) })
  }, [token])

  function addTravelCountry() {
    if (!countryInput.trim()) return
    setTravelHistory(prev => [...prev, { country: countryInput.trim(), year: yearInput }])
    setCountryInput('')
  }

  async function handleFileUpload(docId: string, file: File) {
    // In production, upload to your file storage (S3/Supabase/Cloudinary)
    // and get back a URL. For now we simulate with a data URL.
    const reader = new FileReader()
    reader.onload = (e) => {
      // In production, send to an upload API and get a URL back
      // Here we just store the data URL as a placeholder
      setUploadedDocs(prev => ({ ...prev, [docId]: e.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nationality) { setError('Please select your nationality.'); return }
    if (Object.keys(uploadedDocs).length === 0) {
      setError('Please upload at least one document.'); return
    }
    setError(null)
    setSubmitting(true)

    const documentUrls = Object.values(uploadedDocs)

    const res  = await fetch(`/api/group/${sessionId}/visa/profile/${info?.memberId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        nationality,
        travelHistory,
        documentUrls,
        applicantName: info?.memberName,
      }),
    })
    const data = await res.json()

    if (!res.ok) { setError(data.error ?? 'Submission failed'); setSubmitting(false); return }

    setScore(data.individualScore ?? null)
    setDone(true)
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">✅</p>
        <h1 className="text-white text-xl font-bold mb-2">Visa profile submitted!</h1>
        {score !== null && (
          <div className="my-4">
            <div className={`text-5xl font-bold ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {score}
            </div>
            <p className="text-white/40 text-xs mt-1">Your individual VisaFortress score</p>
          </div>
        )}
        <p className="text-white/50 text-sm mt-2">
          Your documents have been added to the group profile. The group organiser will run the full group visa analysis.
        </p>
        <p className="text-white/20 text-xs mt-6 italic">
          Visa scores are indicative only. Always verify requirements with the official embassy.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B1F3A]">
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1.5 mb-4">
            <span className="text-[#C9A84C] text-xs font-bold">🛂 GROUP VISA PROFILE</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{info?.sessionName}</h1>
          <p className="text-white/50 text-sm mt-1">
            Hi <strong className="text-white">{info?.memberName}</strong> — upload your documents for the group visa assessment.
          </p>
          <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
            <p className="text-amber-400 text-xs">
              ⚠ Scores are indicative only. Always verify visa requirements with the official embassy website.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nationality */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">🛂 Passport nationality</h2>
            <select required value={nationality} onChange={e => setNationality(e.target.value)}
              className="w-full bg-white/10 border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] appearance-none">
              <option value="" disabled>Select nationality</option>
              {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Travel history */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">🌍 Travel history</h2>
            <p className="text-white/30 text-xs mb-3">Countries visited in the last 3 years</p>
            <div className="flex gap-2 mb-3">
              <input type="text" placeholder="Country" value={countryInput}
                onChange={e => setCountryInput(e.target.value)}
                className="flex-1 bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <input type="number" min={2020} max={2026} value={yearInput}
                onChange={e => setYearInput(Number(e.target.value))}
                className="w-20 bg-white/10 border border-white/10 text-white rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
              <button type="button" onClick={addTravelCountry}
                className="px-3 py-2 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20">+</button>
            </div>
            {travelHistory.length > 0 && (
              <div className="space-y-1">
                {travelHistory.map((t, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5">
                    <span className="text-white/70 text-sm">{t.country} · {t.year}</span>
                    <button type="button" onClick={() => setTravelHistory(prev => prev.filter((_, j) => j !== i))}
                      className="text-white/30 hover:text-white text-sm">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">📄 Upload supporting documents</h2>
            <p className="text-white/30 text-xs mb-4">PDF or JPG · recommended for your destination</p>
            <div className="space-y-3">
              {VISA_DOCS.map(doc => (
                <div key={doc.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  uploadedDocs[doc.id] ? 'bg-green-500/10 border-green-500/20' : 'bg-white/5 border-white/10'
                }`}>
                  <div className="flex-1">
                    <p className={`text-sm ${uploadedDocs[doc.id] ? 'text-green-400' : 'text-white/70'}`}>
                      {uploadedDocs[doc.id] ? '✓ ' : ''}{doc.label}
                    </p>
                  </div>
                  <input
                    ref={el => { fileRefs.current[doc.id] = el }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleFileUpload(doc.id, f)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRefs.current[doc.id]?.click()}
                    className={`ml-3 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      uploadedDocs[doc.id]
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-white/10 text-white/50 hover:bg-white/20'
                    }`}>
                    {uploadedDocs[doc.id] ? 'Change' : 'Upload'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded-2xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting ? (
              <><div className="w-4 h-4 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" /> Analysing…</>
            ) : '✓ Submit visa profile'}
          </button>

          <p className="text-white/20 text-xs text-center">
            Your documents are stored securely. Scores are indicative only — always check official embassy requirements.
          </p>
        </form>
      </div>
    </div>
  )
}
