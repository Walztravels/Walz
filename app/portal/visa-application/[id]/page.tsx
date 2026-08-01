'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle, Clock, Loader2, MessageCircle,
  Upload, Globe, AlertTriangle, FileText, Shield,
  ChevronRight, Plane, Hotel, Copy,
} from 'lucide-react'
import { getVisaConfig, STATUS_CONFIG, STATUS_TIMELINE, VISA_CONFIGS } from '@/lib/visa-config'

interface VisaApp {
  id: string; referenceNumber: string; destinationIso2: string; visaType: string
  firstName: string | null; lastName: string | null; email: string | null
  status: string; serviceFeePaid: boolean; govtFeePaid: boolean
  govtFeeInstructions: string | null
  arrivalDate: string | null; returnDate: string | null
  assignedTo: string | null; decisionNotes: string | null
  createdAt: string; updatedAt: string
  notes: { id: string; authorName: string; content: string; createdAt: string }[]
}

const AGENT_NAMES: Record<string, string> = {
  glory: 'Glory Nwachuku',
  oluchi: 'Oluchi',
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.received
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function Timeline({ status }: { status: string }) {
  const current = STATUS_TIMELINE.indexOf(status)

  return (
    <div className="space-y-1">
      {STATUS_TIMELINE.map((s, i) => {
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.received
        const done = i < current
        const active = i === current
        const upcoming = i > current
        return (
          <div key={s} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${active ? 'bg-[#0B1F3A]' : done ? 'bg-green-50' : 'bg-gray-50'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              done ? 'bg-green-500' : active ? 'bg-[#C9A84C]' : 'bg-gray-200'
            }`}>
              {done ? <CheckCircle className="w-4 h-4 text-white" /> : active ? <span className="w-2 h-2 bg-[#0B1F3A] rounded-full block" /> : <span className="w-2 h-2 bg-gray-400 rounded-full block" />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${active ? 'text-white' : done ? 'text-green-700' : 'text-gray-400'}`}>
                {cfg.label}
              </p>
              {active && <p className="text-xs text-[#C9A84C] mt-0.5">Current status</p>}
            </div>
            {done && <CheckCircle className="w-4 h-4 text-green-500" />}
            {active && <div className="w-2 h-2 rounded-full bg-[#C9A84C] animate-pulse" />}
          </div>
        )
      })}
    </div>
  )
}

export default function PortalVisaApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const isNew = searchParams.get('success') === '1'

  const [app, setApp] = useState<VisaApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingGovt, setMarkingGovt] = useState(false)

  // Duplicate to new destination
  const [showDup, setShowDup] = useState(false)
  const [dupDest, setDupDest] = useState('')
  const [dupVisaType, setDupVisaType] = useState('tourist')
  const [dupConsent, setDupConsent] = useState(false)
  const [dupLoading, setDupLoading] = useState(false)
  const [dupResult, setDupResult] = useState<{ referenceNumber: string; id: string; added: string[]; removed: string[]; documentsCarried: number } | null>(null)
  const [dupErr, setDupErr] = useState('')

  async function submitDuplicate() {
    if (!app || !dupDest || !dupConsent) return
    setDupLoading(true); setDupErr('')
    const res = await fetch(`/api/portal/visa-applications/${app.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationIso2: dupDest, visaType: dupVisaType, consent: true }),
    })
    const d = await res.json()
    setDupLoading(false)
    if (!res.ok) { setDupErr(d.error ?? 'Something went wrong'); return }
    setDupResult({
      referenceNumber: d.newApp.referenceNumber,
      id: d.newApp.id,
      added: d.requirementsDelta.added,
      removed: d.requirementsDelta.removed,
      documentsCarried: d.documentsCarried,
    })
  }

  useEffect(() => {
    fetch(`/api/visa-application/${id}`)
      .then(r => r.json())
      .then(d => { setApp(d.application); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  async function markGovtFeePaid() {
    if (!app) return
    setMarkingGovt(true)
    await fetch(`/api/visa-application/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ govtFeePaid: true }),
    })
    setApp(prev => prev ? { ...prev, govtFeePaid: true } : null)
    setMarkingGovt(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
    </div>
  )

  if (!app) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Globe className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400">Application not found.</p>
        <Link href="/portal/application" className="text-[#C9A84C] text-sm hover:underline mt-2 block">← Back to Applications</Link>
      </div>
    </div>
  )

  const config = getVisaConfig(app.destinationIso2)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Success banner */}
      {isNew && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex gap-4">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-green-800 mb-1">🎉 Application Received!</h3>
            <p className="text-green-700 text-sm">Your payment is confirmed and your application has been received by the Walz Travels team. You'll receive a confirmation email shortly.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/portal/application" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
          <ArrowLeft className="w-4 h-4" /> All Applications
        </Link>
        <StatusBadge status={app.status} />
      </div>

      {/* Hero card */}
      <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{config?.flag ?? '🌍'}</span>
          <div className="flex-1">
            <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-wider">Visa Application</p>
            <h1 className="text-xl font-bold mt-0.5">{config?.name ?? app.destinationIso2} — {app.visaType}</h1>
            <p className="text-white/50 text-sm mt-1">{app.firstName} {app.lastName}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-[#C9A84C] text-xs mb-1">Reference</p>
            <p className="text-white font-mono font-bold text-sm">{app.referenceNumber}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-[#C9A84C] text-xs mb-1">Service Fee</p>
            <p className="text-white font-bold text-sm">{app.serviceFeePaid ? '✅ Paid' : '⏳ Pending'}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-[#C9A84C] text-xs mb-1">Travel Date</p>
            <p className="text-white text-sm font-semibold">{app.arrivalDate ? new Date(app.arrivalDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</p>
          </div>
        </div>
      </div>

      {/* Government fee action card */}
      {app.govtFeeInstructions && !app.govtFeePaid && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800 text-base">Action Required — Pay Government Fee</h3>
              <p className="text-amber-700 text-sm mt-0.5">Your application is ready. Please pay the government fee as instructed below.</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 mb-4 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed border border-amber-100">
            {app.govtFeeInstructions}
          </div>
          <button onClick={markGovtFeePaid} disabled={markingGovt}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors">
            {markingGovt ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            I Have Paid the Government Fee
          </button>
        </div>
      )}

      {app.govtFeePaid && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <p className="text-green-700 text-sm font-semibold">Government fee marked as paid — Walz Travels notified ✓</p>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-bold text-[#0B1F3A] mb-4">Application Progress</h2>
        <Timeline status={app.status} />
      </div>

      {/* Decision notes if refused */}
      {app.status === 'refused' && app.decisionNotes && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Refusal Details
          </h3>
          <p className="text-red-700 text-sm leading-relaxed">{app.decisionNotes}</p>
          <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white font-semibold text-sm rounded-xl">
            <MessageCircle className="w-4 h-4" /> Discuss Resubmission with Jade
          </a>
        </div>
      )}

      {/* What happens next */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold flex-shrink-0">J</div>
          <div>
            <p className="font-bold text-[#0B1F3A]">Jade's Update</p>
            <p className="text-xs text-gray-400">Your Walz Visa Coordinator</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          {app.status === 'received' && 'I\'ve received your application and will prepare your personalised document checklist within 1–2 business days. Check back here or watch for my email.'}
          {app.status === 'documents_pending' && 'Please upload your supporting documents using the button below. All documents must be clear, colour scans in PDF or JPG format.'}
          {app.status === 'under_review' && 'I\'m reviewing your complete application. I\'ll notify you if anything needs correction before we submit.'}
          {app.status === 'ready_to_submit' && 'Everything looks perfect. I\'m about to submit your application to the embassy on your behalf.'}
          {app.status === 'submitted_to_embassy' && `Your application has been officially submitted. Embassy reference: ${app.assignedTo ? `handled by ${AGENT_NAMES[app.assignedTo] ?? app.assignedTo}` : 'Walz Travels'}. We\'ll notify you the moment there\'s any news.`}
          {app.status === 'decision_pending' && 'The embassy is processing your application. Decision timelines vary but we\'re monitoring it daily.'}
          {app.status === 'approved' && '🎉 CONGRATULATIONS! Your visa has been approved! Check your email for the stamping / collection instructions.'}
          {app.status === 'refused' && 'I\'m sorry about this outcome. Please read the refusal details above. I\'m available on WhatsApp to discuss your options and resubmission strategy.'}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/portal/documents"
          className="flex items-center gap-3 p-4 bg-[#0B1F3A] rounded-xl hover:bg-[#0d2345] transition-colors">
          <Upload className="w-5 h-5 text-[#C9A84C]" />
          <div>
            <p className="text-white font-semibold text-sm">Upload Docs</p>
            <p className="text-white/40 text-xs">Add supporting files</p>
          </div>
        </Link>
        <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 bg-green-600 rounded-xl hover:bg-green-700 transition-colors">
          <MessageCircle className="w-5 h-5 text-white" />
          <div>
            <p className="text-white font-semibold text-sm">WhatsApp Jade</p>
            <p className="text-white/70 text-xs">+12317902336</p>
          </div>
        </a>
      </div>

      {/* Cross-sell */}
      {config && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/flights" className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <Plane className="w-4 h-4 text-blue-600" />
            <div>
              <p className="text-xs font-semibold text-blue-900">Flights to {config.name}</p>
              <p className="text-xs text-blue-500">Search →</p>
            </div>
          </Link>
          <Link href="/hotels" className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-100 rounded-xl">
            <Hotel className="w-4 h-4 text-purple-600" />
            <div>
              <p className="text-xs font-semibold text-purple-900">Hotels in {config.name}</p>
              <p className="text-xs text-purple-500">Book →</p>
            </div>
          </Link>
        </div>
      )}

      {/* Apply for another destination */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
            <Copy className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="font-bold text-[#0B1F3A] text-sm">Apply for Another Destination</p>
            <p className="text-xs text-gray-400">Re-use your details for a different country</p>
          </div>
        </div>
        {!showDup && !dupResult && (
          <button onClick={() => setShowDup(true)}
            className="w-full py-2.5 border border-purple-300 text-purple-700 rounded-xl text-sm font-semibold hover:bg-purple-50 transition-colors">
            Duplicate to New Destination
          </button>
        )}
        {showDup && !dupResult && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">New Destination *</label>
              <select value={dupDest} onChange={e => setDupDest(e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 bg-white">
                <option value="">Select destination…</option>
                {Object.entries(VISA_CONFIGS)
                  .filter(([iso2]) => iso2 !== app.destinationIso2 && iso2.length === 2)
                  .sort((a, b) => a[1].name.localeCompare(b[1].name))
                  .map(([iso2, cfg]) => (
                    <option key={iso2} value={iso2}>{cfg.flag} {cfg.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Visa Type</label>
              <select value={dupVisaType} onChange={e => setDupVisaType(e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 bg-white">
                <option value="tourist">Tourist</option>
                <option value="business">Business</option>
                <option value="student">Student</option>
                <option value="work">Work</option>
                <option value="transit">Transit</option>
                <option value="family">Family</option>
                <option value="medical">Medical</option>
              </select>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              Your personal details and supporting documents will be carried over. Travel dates, accommodation, and cover letters will <strong>not</strong> be copied — they are destination-specific.
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={dupConsent} onChange={e => setDupConsent(e.target.checked)}
                className="mt-0.5 accent-purple-600" />
              <span className="text-xs text-gray-600">
                I confirm I want to create a new separate application for a different destination using my existing personal details. I understand this does not replace my current application.
              </span>
            </label>
            {dupErr && <p className="text-red-500 text-xs">{dupErr}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowDup(false); setDupDest(''); setDupConsent(false); setDupErr('') }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={submitDuplicate} disabled={dupLoading || !dupDest || !dupConsent}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {dupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Create Application
              </button>
            </div>
          </div>
        )}
        {dupResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <p className="text-sm font-semibold text-green-700">New application created!</p>
            </div>
            <p className="text-xs text-gray-500">
              Reference: <span className="font-mono font-bold text-[#C9A84C]">{dupResult.referenceNumber}</span> · {dupResult.documentsCarried} document(s) carried over
            </p>
            {dupResult.added.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">New documents needed for this destination:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {dupResult.added.map(d => <li key={d}>{d}</li>)}
                </ul>
              </div>
            )}
            <Link href={`/portal/visa-application/${dupResult.id}`}
              className="block w-full py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-bold text-center">
              View New Application →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
