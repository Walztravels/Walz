'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, FileText, Ticket, History,
  CheckCircle, AlertTriangle, XCircle, Loader2,
  Copy, Check, Printer, ChevronDown, Eye,
  ShieldCheck, FileSearch, MailOpen, Plane, Hotel,
  ArrowRight, Send,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'upload' | 'form-check' | 'letters' | 'dummy-ticket' | 'history'
type Verdict = 'all' | 'authentic' | 'suspicious' | 'fraudulent'

interface DocCheck {
  id:                string
  applicationId:     string
  documentType:      string
  fileName:          string
  verdict:           'authentic' | 'suspicious' | 'fraudulent'
  authenticityScore: number
  stampDetected:     boolean
  signatureDetected: boolean
  flags:             string[]
  evidence:          string | null
  checkedAt:         string
}

interface AppSearchResult {
  id:              string
  referenceNumber: string
  firstName:       string | null
  lastName:        string | null
  destinationIso2: string
  status:          string
  passportNumber?: string | null
  nationality?:    string | null
  arrivalDate?:    string | null
  returnDate?:     string | null
}

interface FullVisaApp {
  id:               string
  firstName?:       string | null
  lastName?:        string | null
  middleName?:      string | null
  passportNumber?:  string | null
  nationality?:     string | null
  destinationIso2?: string
  arrivalDate?:     string | null
  returnDate?:      string | null
  branch?:          string | null
}

interface UploadAnalysis {
  authenticityScore:      number
  verdict:                string
  stampDetected:          boolean
  signatureDetected:      boolean
  holderName:             string | null
  documentNumber:         string | null
  expiryDate:             string | null
  issuingCountry:         string | null
  embassyReadinessRating: string
  flags:                  string[]
  officerNotes:           string
  recommendedActions:     string[]
  qualityIssues:          string[]
  consistencyChecks:      Record<string, string>
}

interface FormCheckResult {
  overallRisk:          string
  summaryStatement:     string
  criticalErrors:       Array<{ field: string; formValue: string; expectedValue: string; embassyImpact: string; correction: string }>
  warnings:             Array<{ field: string; issue: string; suggestion: string }>
  fieldVerifications:   Array<{ field: string; status: string; formValue: string; dbValue: string }>
  missingFields:        string[]
  recommendedNextSteps: string[]
  embassyReadiness:     string
}

interface ErrorMeta {
  tried?:      string[]
  params?:     Record<string, string>
  suggestion?: string
}

// ─── ISO2 → major IATA (for instant autofill before fetch) ───────────────────
const COUNTRY_IATA: Record<string, string> = {
  GB: 'LHR', US: 'JFK', FR: 'CDG', DE: 'FRA', AE: 'DXB',
  CA: 'YYZ', AU: 'SYD', NL: 'AMS', ES: 'MAD', IT: 'FCO',
  PT: 'LIS', IE: 'DUB', BE: 'BRU', CH: 'ZRH', AT: 'VIE',
  SE: 'ARN', DK: 'CPH', NO: 'OSL', FI: 'HEL', PL: 'WAW',
  GH: 'ACC', NG: 'LOS', KE: 'NBO', ZA: 'JNB', ET: 'ADD',
  EG: 'CAI', MA: 'CMN', SN: 'DKR', TZ: 'DAR', UG: 'EBB',
  IN: 'BOM', PK: 'KHI', BD: 'DAC', LK: 'CMB', NP: 'KTM',
  CN: 'PEK', JP: 'NRT', KR: 'ICN', SG: 'SIN', MY: 'KUL',
  BR: 'GRU', MX: 'MEX', AR: 'EZE', CO: 'BOG', PE: 'LIM',
  QA: 'DOH', SA: 'RUH', TR: 'IST', RU: 'SVO', OM: 'MCT',
  CM: 'DLA', CI: 'ABJ', SL: 'FNA', RW: 'KGL', ZW: 'HRE', ZM: 'LUN',
}

// ─── Nationality string → nearest major IATA airport ──────────────────────────
const NATIONALITY_IATA: Record<string, string> = {
  Nigerian: 'LOS', Ghanaian: 'ACC', Kenyan: 'NBO', 'South African': 'JNB',
  Ethiopian: 'ADD', Egyptian: 'CAI', Moroccan: 'CMN', Senegalese: 'DKR',
  Tanzanian: 'DAR', Ugandan: 'EBB', Rwandan: 'KGL', Zimbabwean: 'HRE',
  Zambian: 'LUN', Cameroonian: 'DLA', Ivorian: 'ABJ', 'Sierra Leonean': 'FNA',
  British: 'LHR', American: 'JFK', Canadian: 'YYZ', Australian: 'SYD',
  French: 'CDG', German: 'FRA', Dutch: 'AMS', Spanish: 'MAD',
  Italian: 'FCO', Portuguese: 'LIS', Irish: 'DUB', Belgian: 'BRU',
  Swiss: 'ZRH', Austrian: 'VIE', Swedish: 'ARN', Norwegian: 'OSL',
  Indian: 'BOM', Pakistani: 'KHI', Bangladeshi: 'DAC', 'Sri Lankan': 'CMB',
  Nepali: 'KTM', Chinese: 'PEK', Japanese: 'NRT', Korean: 'ICN',
  Singaporean: 'SIN', Malaysian: 'KUL', Brazilian: 'GRU', Mexican: 'MEX',
  Qatari: 'DOH', 'Saudi Arabian': 'RUH', Turkish: 'IST', Lebanese: 'BEY',
  Omani: 'MCT', Kuwaiti: 'KWI',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType; desc: string }> = [
  { id: 'upload',       label: 'Document Upload & Analysis', icon: Upload,     desc: 'AI forensic analysis' },
  { id: 'form-check',   label: 'Embassy Form Cross-Checker', icon: FileSearch, desc: 'World first' },
  { id: 'letters',      label: 'Letter Generator',           icon: MailOpen,   desc: '9 letter types' },
  { id: 'dummy-ticket', label: 'Dummy Ticket Generator',     icon: Ticket,     desc: 'Flight & hotel' },
  { id: 'history',      label: 'Document History',           icon: History,    desc: 'All checks' },
]

const DOC_TYPES = [
  { value: 'passport',               label: 'Passport' },
  { value: 'bank_statement',         label: 'Bank Statement' },
  { value: 'payslip',                label: 'Payslip' },
  { value: 'employment_letter',      label: 'Employment Letter' },
  { value: 'utility_bill',           label: 'Utility Bill' },
  { value: 'invitation_letter',      label: 'Invitation Letter' },
  { value: 'insurance',              label: 'Insurance Certificate' },
  { value: 'hotel_booking',          label: 'Hotel Booking' },
  { value: 'flight_itinerary',       label: 'Flight Itinerary' },
  { value: 'travel_history',         label: 'Travel History' },
  { value: 'tax_return',             label: 'Tax Return' },
  { value: 'business_registration',  label: 'Business Registration' },
]

const LETTER_TYPES = [
  { id: 'cover',          label: 'Cover Letter' },
  { id: 'sponsor',        label: 'Sponsor Letter' },
  { id: 'employment',     label: 'Employment Letter' },
  { id: 'introduction',   label: 'Introduction Letter' },
  { id: 'invitation',     label: 'Invitation Letter' },
  { id: 'financial',      label: 'Financial Support Letter' },
  { id: 'travel_purpose', label: 'Travel Purpose Statement' },
  { id: 'noc',            label: 'No Objection Certificate' },
  { id: 'hotel',          label: 'Hotel Confirmation Letter' },
]

const FORM_TYPES = [
  'VAF1A (UK Standard Visitor)',
  'VAF2 (UK Family Visitor)',
  'DS-160 (USA Non-Immigrant)',
  'IMM5257 (Canada Visitor)',
  'Schengen Visa Application',
  'UAE Tourist Visa Form',
  'Australia Tourist Visa (600)',
  'Ireland Short Stay C',
  'Other Embassy Form',
]

const VERDICT_TABS: Verdict[] = ['all', 'authentic', 'suspicious', 'fraudulent']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    authentic:  'bg-green-100 text-green-700',
    suspicious: 'bg-yellow-100 text-yellow-700',
    fraudulent: 'bg-red-100 text-red-700',
    low:        'bg-green-100 text-green-700',
    medium:     'bg-yellow-100 text-yellow-700',
    high:       'bg-orange-100 text-orange-700',
    critical:   'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[verdict] ?? 'bg-gray-100 text-gray-500'}`}>
      {verdict}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700">{score}</span>
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#C9A84C] hover:text-[#0B1F3A] text-gray-500 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ─── Application search ───────────────────────────────────────────────────────

function AppSearch({
  value, onChange, onSelect,
}: {
  value:     string
  onChange:  (id: string, label: string) => void
  onSelect?: (app: AppSearchResult) => void
}) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<AppSearchResult[]>([])
  const [open,    setOpen]    = useState(false)
  const [label,   setLabel]   = useState(value ? `Selected: ${value}` : '')

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    try {
      const res  = await fetch(`/api/admin/intelligence/visa-applications/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.applications ?? [])
      setOpen(true)
    } catch { setResults([]) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const select = (app: AppSearchResult) => {
    const lbl = `${app.referenceNumber} — ${app.firstName ?? ''} ${app.lastName ?? ''} (${app.destinationIso2})`
    setLabel(lbl); setQuery(''); setOpen(false)
    onChange(app.id, lbl)
    onSelect?.(app)
  }

  return (
    <div className="relative">
      {label && (
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">{label}</span>
          <button onClick={() => { setLabel(''); onChange('', '') }} className="text-xs text-gray-400 hover:text-red-500">✕</button>
        </div>
      )}
      <input className={INPUT} placeholder="Search by reference, name or destination…"
        value={query} onChange={e => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)} />
      {open && results.length > 0 && (
        <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {results.map(app => (
            <button key={app.id} onClick={() => select(app)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
              <div className="text-sm font-semibold text-[#0B1F3A]">{app.referenceNumber}</div>
              <div className="text-xs text-gray-500">{app.firstName} {app.lastName} · {app.destinationIso2} · {app.status}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Document Upload & Analysis ─────────────────────────────────────────

function UploadTab() {
  const [file,        setFile]        = useState<File | null>(null)
  const [dragging,    setDragging]    = useState(false)
  const [docType,     setDocType]     = useState('passport')
  const [appId,       setAppId]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [analysis,    setAnalysis]    = useState<UploadAnalysis | null>(null)
  const [checkRecord, setCheckRecord] = useState<DocCheck | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const submit = async () => {
    if (!file) return
    setLoading(true); setAnalysis(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('documentType', docType)
      fd.append('applicationId', appId)
      const res  = await fetch('/api/admin/intelligence/visa-doc-upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.analysis)  setAnalysis(data.analysis)
      if (data.check)     setCheckRecord(data.check)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const scoreColor = !analysis ? '' : analysis.authenticityScore >= 80 ? 'text-green-600' : analysis.authenticityScore >= 50 ? 'text-yellow-600' : 'text-red-600'
  const scoreBg    = !analysis ? '' : analysis.authenticityScore >= 80 ? 'bg-green-50 border-green-200' : analysis.authenticityScore >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#C9A84C]" /> Upload Document for AI Analysis
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Document Type</label>
            <select className={INPUT} value={docType} onChange={e => setDocType(e.target.value)}>
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Linked Application (optional)</label>
            <AppSearch value={appId} onChange={(id) => setAppId(id)} />
          </div>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragging ? 'border-[#C9A84C] bg-[#C9A84C]/5' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#C9A84C] hover:bg-gray-50'
          }`}>
          <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
          {file ? (
            <div>
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-green-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              <button onClick={e => { e.stopPropagation(); setFile(null) }} className="text-xs text-red-400 hover:text-red-600 mt-2">Remove</button>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-600">Drop document here or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">Supports: JPG, PNG, PDF · Max 10MB</p>
            </div>
          )}
        </div>

        <button onClick={() => void submit()} disabled={!file || loading}
          className="mt-4 h-10 px-6 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-40 transition-colors flex items-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing with AI…</> : <><ShieldCheck className="w-4 h-4" /> Run AI Analysis</>}
        </button>
      </div>

      {analysis && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b ${scoreBg} border`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Verdict</div>
                <div className={`text-3xl font-black mt-1 ${scoreColor}`}>{analysis.authenticityScore}/100</div>
                <VerdictBadge verdict={analysis.verdict} />
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Embassy Readiness</div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                  analysis.embassyReadinessRating === 'excellent' ? 'bg-green-100 text-green-700' :
                  analysis.embassyReadinessRating === 'good'      ? 'bg-blue-100 text-blue-700' :
                  analysis.embassyReadinessRating === 'fair'      ? 'bg-yellow-100 text-yellow-700' :
                                                                     'bg-red-100 text-red-700'
                }`}>{analysis.embassyReadinessRating}</span>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Document Details</h3>
              {[
                ['Holder Name',     analysis.holderName     ?? 'Not detected'],
                ['Document Number', analysis.documentNumber ?? 'Not detected'],
                ['Expiry Date',     analysis.expiryDate     ?? 'Not detected'],
                ['Issuing Country', analysis.issuingCountry ?? 'Not detected'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-[#0B1F3A]">{v}</span>
                </div>
              ))}
              <div className="flex gap-4 pt-1">
                <div className="text-sm">
                  <span className="text-gray-500">Stamp: </span>
                  <span className={`font-semibold ${analysis.stampDetected ? 'text-green-600' : 'text-gray-400'}`}>
                    {analysis.stampDetected ? 'Detected' : 'None'}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Signature: </span>
                  <span className={`font-semibold ${analysis.signatureDetected ? 'text-green-600' : 'text-gray-400'}`}>
                    {analysis.signatureDetected ? 'Detected' : 'None'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Consistency Checks</h3>
              {analysis.consistencyChecks && Object.entries(analysis.consistencyChecks).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className={`font-semibold ${v === 'pass' ? 'text-green-600' : v === 'fail' ? 'text-red-600' : 'text-gray-400'}`}>{v}</span>
                </div>
              ))}
            </div>

            {analysis.flags.length > 0 && (
              <div className="sm:col-span-2">
                <h3 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Flags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.flags.map((f, i) => (
                    <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 font-medium">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {analysis.officerNotes && (
              <div className="sm:col-span-2 bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Immigration Officer Notes</h3>
                <p className="text-sm text-blue-900 leading-relaxed">{analysis.officerNotes}</p>
              </div>
            )}

            {analysis.recommendedActions.length > 0 && (
              <div className="sm:col-span-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Recommended Actions</h3>
                <ol className="space-y-1.5">
                  {analysis.recommendedActions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0B1F3A] text-white text-xs flex items-center justify-center font-bold">{i+1}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {checkRecord && (
            <div className="px-6 pb-4">
              <p className="text-xs text-gray-400">Saved to database · ID: <span className="font-mono">{checkRecord.id}</span></p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Embassy Form Cross-Checker ─────────────────────────────────────────

function FormCheckTab() {
  const [file,     setFile]     = useState<File | null>(null)
  const [formType, setFormType] = useState(FORM_TYPES[0])
  const [appId,    setAppId]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<FormCheckResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    if (!appId) return
    setLoading(true); setResult(null)
    try {
      const fd = new FormData()
      if (file) fd.append('file', file)
      fd.append('formType', formType)
      fd.append('applicationId', appId)
      const res  = await fetch('/api/admin/intelligence/embassy-form-check', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.result) setResult(data.result)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const riskColor = !result ? '' : { low: 'text-green-600', medium: 'text-yellow-600', high: 'text-orange-600', critical: 'text-red-600' }[result.overallRisk] ?? 'text-gray-600'

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-1 flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-[#C9A84C]" /> Embassy Form Cross-Checker
        </h2>
        <p className="text-xs text-gray-500 mb-5">Upload a completed embassy form — AI cross-references every field against the client&apos;s database record and highlights errors.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Form Type</label>
            <select className={INPUT} value={formType} onChange={e => setFormType(e.target.value)}>
              {FORM_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Visa Application <span className="text-red-500">*</span></label>
            <AppSearch value={appId} onChange={(id) => setAppId(id)} />
          </div>
        </div>

        <div onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4 ${
            file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#C9A84C] hover:bg-gray-50'
          }`}>
          <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
          {file
            ? <p className="text-sm font-semibold text-green-700">{file.name} · {(file.size/1024).toFixed(1)} KB</p>
            : <div><FileSearch className="w-7 h-7 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">Upload the completed form image (optional — we&apos;ll pre-check from DB if no form)</p></div>
          }
        </div>

        <button onClick={() => void submit()} disabled={!appId || loading}
          className="h-10 px-6 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-40 transition-colors flex items-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Cross-checking…</> : <><FileSearch className="w-4 h-4" /> Run Cross-Check</>}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Risk Level</div>
                <div className={`text-2xl font-black capitalize mt-0.5 ${riskColor}`}>{result.overallRisk}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Embassy Readiness</div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#0B1F3A] text-[#C9A84C] uppercase">{result.embassyReadiness?.replace(/_/g,' ')}</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">{result.summaryStatement}</p>
          </div>

          {result.criticalErrors?.length > 0 && (
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> Critical Errors ({result.criticalErrors.length})
              </h3>
              <div className="space-y-3">
                {result.criticalErrors.map((err, i) => (
                  <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="font-semibold text-sm text-red-800 mb-2">{err.field}</div>
                    <div className="grid grid-cols-2 gap-3 text-xs mb-2">
                      <div><span className="text-red-600 font-semibold">Form says:</span> <span className="text-gray-700">{err.formValue}</span></div>
                      <div><span className="text-green-600 font-semibold">Should be:</span> <span className="text-gray-700">{err.expectedValue}</span></div>
                    </div>
                    {err.embassyImpact && <p className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded mb-1"><strong>Embassy impact:</strong> {err.embassyImpact}</p>}
                    {err.correction    && <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded"><strong>Correction:</strong> {err.correction}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.warnings?.length > 0 && (
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xs font-bold text-yellow-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({result.warnings.length})
              </h3>
              <div className="space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                    <div className="text-xs font-semibold text-yellow-800 mb-1">{w.field}</div>
                    <p className="text-xs text-yellow-700">{w.issue}</p>
                    {w.suggestion && <p className="text-xs text-gray-600 mt-1"><strong>Suggestion:</strong> {w.suggestion}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.missingFields?.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Missing Fields</h3>
              <div className="flex flex-wrap gap-2">
                {result.missingFields.map((f, i) => (
                  <span key={i} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg">{f}</span>
                ))}
              </div>
            </div>
          )}

          {result.recommendedNextSteps?.length > 0 && (
            <div className="px-6 py-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Next Steps</h3>
              <ol className="space-y-2">
                {result.recommendedNextSteps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#C9A84C] text-[#0B1F3A] text-xs flex items-center justify-center font-bold">{i+1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Letter Generator ────────────────────────────────────────────────────

function LettersTab() {
  const [letterType,   setLetterType]   = useState(LETTER_TYPES[0].id)
  const [appId,        setAppId]        = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [loading,      setLoading]      = useState(false)
  const [letter,       setLetter]       = useState('')
  const [letterLabel,  setLetterLabel]  = useState('')

  const generate = async () => {
    if (!appId) return
    setLoading(true); setLetter('')
    try {
      const res  = await fetch('/api/admin/intelligence/letter-generator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterType, applicationId: appId, extraContext }),
      })
      const data = await res.json()
      if (data.letter) { setLetter(data.letter); setLetterLabel(data.letterLabel ?? letterType) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-1 flex items-center gap-2">
          <MailOpen className="w-4 h-4 text-[#C9A84C]" /> Letter Generator
        </h2>
        <p className="text-xs text-gray-500 mb-5">Auto-filled from the visa application. AI writes complete, embassy-quality letters.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Letter Type</label>
            <select className={INPUT} value={letterType} onChange={e => setLetterType(e.target.value)}>
              {LETTER_TYPES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Visa Application <span className="text-red-500">*</span></label>
            <AppSearch value={appId} onChange={(id) => setAppId(id)} />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Additional Context (optional)</label>
          <textarea className={`${INPUT} h-20 py-2 resize-none`}
            placeholder="e.g. Sponsor is the applicant's uncle living in London. Sponsor works at NHS as a nurse…"
            value={extraContext} onChange={e => setExtraContext(e.target.value)} />
        </div>

        <button onClick={() => void generate()} disabled={!appId || loading}
          className="h-10 px-6 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-40 transition-colors flex items-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing letter…</> : <><MailOpen className="w-4 h-4" /> Generate Letter</>}
        </button>
      </div>

      {letter && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0B1F3A]">{letterLabel}</h3>
            <div className="flex gap-2">
              <CopyBtn text={letter} />
              <button onClick={() => { const w = window.open(); if (w) { w.document.write(`<pre style="font-family:serif;font-size:14px;line-height:1.8;max-width:700px;margin:40px auto;white-space:pre-wrap;">${letter}</pre>`); w.print() } }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#C9A84C] hover:text-[#0B1F3A] text-gray-500 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Print / PDF
              </button>
            </div>
          </div>
          <div className="p-6">
            <pre className="whitespace-pre-wrap font-serif text-sm text-gray-800 leading-relaxed">{letter}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Dummy Ticket Generator ──────────────────────────────────────────────

interface FlightDetails {
  airline:      string
  airlineCode?: string
  flightNumber: string
  fromCode:     string
  fromCity:     string
  toCode:       string
  toCity:       string
  departureAt:  string
  arrivalAt:    string
  duration:     string
  stops:        number
  cabin:        string
  baggage:      string
  price?:       string
  seat:         string
  pnr:          string
}

// ─── Send to Client inline form ───────────────────────────────────────────────

function SendToClientForm({
  pdfBase64, mode, clientName, flightDetails, ticketData,
}: {
  pdfBase64:      string
  mode:           string
  clientName:     string
  flightDetails?: FlightDetails | null
  ticketData?:    Record<string, unknown> | null
}) {
  const [email,    setEmail]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [sendErr,  setSendErr]  = useState('')

  const send = async () => {
    if (!email) return
    setSending(true); setSent(false); setSendErr('')
    try {
      const res  = await fetch('/api/admin/intelligence/send-ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, clientName, mode, pdf_base64: pdfBase64,
          flightDetails: flightDetails ?? undefined,
          ticketData:    ticketData    ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSendErr(data.error ?? 'Failed to send'); return }
      setSent(true)
    } catch (e) { setSendErr(String(e)) }
    finally { setSending(false) }
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-3">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
          type="email"
          placeholder="Client email address…"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void send()}
        />
        <button onClick={() => void send()} disabled={!email || sending}
          className={`flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 ${
            sent ? 'bg-green-600 text-white' : 'bg-[#0B1F3A] text-white hover:bg-[#0d2345]'
          }`}>
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sent ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending…' : sent ? 'Sent!' : 'Send Email'}
        </button>
      </div>
      {sendErr && <p className="text-xs text-red-500 mt-1.5">{sendErr}</p>}
      {sent    && <p className="text-xs text-green-600 mt-1.5">✓ Itinerary sent to {email}</p>}
    </div>
  )
}

function DummyTicketTab() {
  type TicketMode = 'live' | 'manual' | 'hotel'
  const [mode,          setMode]          = useState<TicketMode>('live')
  const [appId,         setAppId]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [pdfUrl,        setPdfUrl]        = useState('')
  const [pdfBase64,     setPdfBase64]     = useState('')
  const [blobUrl,       setBlobUrl]       = useState('')
  const [flightDetails, setFlightDetails] = useState<FlightDetails | null>(null)
  const [ticketData,    setTicketData]    = useState<Record<string, unknown> | null>(null)
  const [error,         setError]         = useState('')
  const [errorMeta,     setErrorMeta]     = useState<ErrorMeta | null>(null)
  const [showSendForm,  setShowSendForm]  = useState(false)

  // Live mode fields
  const [originIata, setOriginIata] = useState('')
  const [destIata,   setDestIata]   = useState('')
  const [depDate,    setDepDate]    = useState('')
  const [retDate,    setRetDate]    = useState('')
  const [cabin,      setCabin]      = useState('economy')
  const [clientName, setClientName] = useState('')
  const [passportNo, setPassportNo] = useState('')

  // Manual mode fields
  const [mFromCode, setMFromCode] = useState('')
  const [mFromCity, setMFromCity] = useState('')
  const [mToCode,   setMToCode]   = useState('')
  const [mToCity,   setMToCity]   = useState('')
  const [mAirline,  setMAirline]  = useState('')
  const [mFlightNo, setMFlightNo] = useState('')
  const [mDepDT,    setMDepDT]    = useState('')
  const [mArrDT,    setMArrDT]    = useState('')
  const [mDuration, setMDuration] = useState('')
  const [mCabin,    setMCabin]    = useState('ECONOMY')
  const [mSeat,     setMSeat]     = useState('')
  const [mBaggage,  setMBaggage]  = useState('1 × 23kg checked + 7kg cabin')
  const [mTerminal, setMTerminal] = useState('')
  const [mGate,     setMGate]     = useState('')
  const [mPNR,      setMPNR]      = useState('')
  const [mMessage,  setMMMessage] = useState('')

  // Hotel fields
  const [hName,     setHName]     = useState('')
  const [hAddress,  setHAddress]  = useState('')
  const [hCheckIn,  setHCheckIn]  = useState('')
  const [hCheckOut, setHCheckOut] = useState('')
  const [hRoomType, setHRoomType] = useState('Standard Double Room')
  const [hGuests,   setHGuests]   = useState('1')

  // ── Revoke blob URL on cleanup ────────────────────────────────────────────
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  // ── Autofill: fetch full app details when appId changes ───────────────────
  useEffect(() => {
    if (!appId) return
    fetch(`/api/admin/visa-applications/${appId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { application?: FullVisaApp } | FullVisaApp | null) => {
        if (!data) return
        const app: FullVisaApp = (data as { application?: FullVisaApp }).application ?? (data as FullVisaApp)
        if (!app) return
        const name = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' ')
        if (name)               setClientName(name)
        if (app.passportNumber) setPassportNo(app.passportNumber)
        const destCode = app.destinationIso2 ? (COUNTRY_IATA[app.destinationIso2] ?? '') : ''
        if (destCode) { setDestIata(destCode); setMToCode(destCode) }
        // Origin IATA from Walz branch office only — branch = where client departs from
        const BRANCH_IATA: Record<string, string> = {
          nigeria: 'LOS', ghana: 'ACC', uk: 'LHR', uae: 'DXB', canada: 'YYZ',
        }
        const branchCode = app.branch ? (BRANCH_IATA[String(app.branch).toLowerCase()] ?? '') : ''
        if (branchCode) { setOriginIata(branchCode); setMFromCode(branchCode) }
        if (app.arrivalDate) {
          const d = String(app.arrivalDate).slice(0, 10)
          setDepDate(d); setMDepDT(d + 'T08:00')
          if (mode === 'hotel') setHCheckIn(d)
        }
        if (app.returnDate) {
          const d = String(app.returnDate).slice(0, 10)
          setRetDate(d)
          if (mode === 'hotel') setHCheckOut(d)
        }
      })
      .catch(() => {})
  }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Immediate partial autofill from search result ─────────────────────────
  const handleAppSelect = (app: AppSearchResult) => {
    const name = [app.firstName, app.lastName].filter(Boolean).join(' ')
    if (name) setClientName(name)
    const destCode = app.destinationIso2 ? (COUNTRY_IATA[app.destinationIso2] ?? '') : ''
    if (destCode) { setDestIata(destCode); setMToCode(destCode) }
  }

  const resetOutput = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    setPdfUrl(''); setPdfBase64(''); setBlobUrl(''); setFlightDetails(null)
    setTicketData(null); setError(''); setErrorMeta(null); setShowSendForm(false)
  }

  const generate = async () => {
    resetOutput()
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        mode,
        applicationId:  appId || undefined,
        clientName:     clientName || undefined,
        passportNumber: passportNo || undefined,
      }

      if (mode === 'live') {
        Object.assign(payload, { originIata, destIata, departureDate: depDate, returnDate: retDate || undefined, cabinClass: cabin })
      } else if (mode === 'manual') {
        Object.assign(payload, {
          fromCode: mFromCode, fromCity: mFromCity,
          toCode: mToCode, toCity: mToCity,
          airline: mAirline, flightNumber: mFlightNo,
          departureDateTime: mDepDT, arrivalDateTime: mArrDT,
          duration: mDuration, cabin: mCabin,
          seat: mSeat, baggage: mBaggage,
          terminal: mTerminal, gate: mGate,
          pnr: mPNR, message: mMessage,
        })
      } else {
        Object.assign(payload, { hotelName: hName, hotelAddress: hAddress, checkIn: hCheckIn, checkOut: hCheckOut, roomType: hRoomType, numGuests: hGuests })
      }

      const res  = await fetch('/api/admin/intelligence/dummy-ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Unknown error')
        setErrorMeta({ tried: data.tried, params: data.params, suggestion: data.suggestion })
        return
      }

      if (data.pdfUrl)   setPdfUrl(data.pdfUrl)
      if (data.ticketData) setTicketData(data.ticketData as Record<string, unknown>)
      if (data.flight_details) setFlightDetails(data.flight_details as FlightDetails)

      // Bug fix: convert base64 → Blob URL immediately so iframe always renders
      if (data.pdf_base64) {
        setPdfBase64(data.pdf_base64)
        const bytes  = Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))
        const blob   = new Blob([bytes], { type: 'application/pdf' })
        const newUrl = URL.createObjectURL(blob)
        setBlobUrl(newUrl)
      }
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  const downloadPDF = () => {
    if (!pdfBase64) return
    const a    = document.createElement('a')
    a.href     = `data:application/pdf;base64,${pdfBase64}`
    a.download = `walz-ticket-${Date.now()}.pdf`
    a.click()
  }

  const MODES: Array<{ id: TicketMode; icon: React.ElementType; label: string; desc: string }> = [
    { id: 'live',   icon: Plane,    label: 'Live Flight Search', desc: 'Duffel · Amadeus' },
    { id: 'manual', icon: FileText, label: 'Manual Entry',       desc: 'Enter all fields' },
    { id: 'hotel',  icon: Hotel,    label: 'Hotel Voucher',      desc: 'Accommodation' },
  ]

  const hasPDF = !!(blobUrl || pdfUrl || pdfBase64)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-1 flex items-center gap-2">
          <Ticket className="w-4 h-4 text-[#C9A84C]" /> Flight Itinerary Generator
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          Live mode searches real scheduled flights via Duffel (Amadeus fallback) and generates a branded PDF.
          Manual mode lets you enter any details. Hotel mode generates an accommodation voucher.
          Link an application to auto-fill passenger details.
        </p>

        {/* Mode selector */}
        <div className="flex gap-2 mb-5">
          {MODES.map(m => {
            const Icon = m.icon
            return (
              <button key={m.id} onClick={() => { setMode(m.id); resetOutput() }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  mode === m.id ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'text-gray-600 border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {m.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${mode === m.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{m.desc}</span>
              </button>
            )
          })}
        </div>

        {/* Shared: application link + passenger */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 pb-5 border-b border-gray-100">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Link Visa Application (optional — auto-fills all 6 fields)</label>
            <AppSearch
              value={appId}
              onChange={(id) => { setAppId(id); if (!id) { setClientName(''); setPassportNo(''); setDestIata(''); setOriginIata(''); setDepDate(''); setRetDate('') } }}
              onSelect={handleAppSelect}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Passenger Name</label>
            <input className={INPUT} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name (or auto-filled)" />
          </div>
          {(mode === 'live' || mode === 'manual') && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Passport Number</label>
              <input className={INPUT} value={passportNo} onChange={e => setPassportNo(e.target.value)} placeholder="Optional" />
            </div>
          )}
        </div>

        {/* LIVE MODE fields */}
        {mode === 'live' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Origin IATA (where client flies from) <span className="text-red-500">*</span></label>
              <input className={INPUT} value={originIata} onChange={e => setOriginIata(e.target.value.toUpperCase().slice(0,3))} placeholder="e.g. LHR" maxLength={3} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Destination IATA <span className="text-red-500">*</span></label>
              <input className={INPUT} value={destIata} onChange={e => setDestIata(e.target.value.toUpperCase().slice(0,3))} placeholder="LHR" maxLength={3} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Cabin Class</label>
              <select className={INPUT} value={cabin} onChange={e => setCabin(e.target.value)}>
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium Economy</option>
                <option value="business">Business</option>
                <option value="first">First Class</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Departure Date <span className="text-red-500">*</span></label>
              <input className={INPUT} type="date" value={depDate} onChange={e => setDepDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Return Date (optional)</label>
              <input className={INPUT} type="date" value={retDate} onChange={e => setRetDate(e.target.value)} />
            </div>
          </div>
        )}

        {/* MANUAL MODE fields */}
        {mode === 'manual' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">From IATA</label><input className={INPUT} value={mFromCode} onChange={e => setMFromCode(e.target.value.toUpperCase().slice(0,3))} placeholder="LOS" maxLength={3} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">From City</label><input className={INPUT} value={mFromCity} onChange={e => setMFromCity(e.target.value)} placeholder="Lagos" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">To IATA</label><input className={INPUT} value={mToCode} onChange={e => setMToCode(e.target.value.toUpperCase().slice(0,3))} placeholder="LHR" maxLength={3} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">To City</label><input className={INPUT} value={mToCity} onChange={e => setMToCity(e.target.value)} placeholder="London" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Airline</label><input className={INPUT} value={mAirline} onChange={e => setMAirline(e.target.value)} placeholder="British Airways" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Flight Number</label><input className={INPUT} value={mFlightNo} onChange={e => setMFlightNo(e.target.value)} placeholder="BA 076" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Departure (date + time)</label><input className={INPUT} type="datetime-local" value={mDepDT} onChange={e => setMDepDT(e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Arrival (date + time)</label><input className={INPUT} type="datetime-local" value={mArrDT} onChange={e => setMArrDT(e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Duration</label><input className={INPUT} value={mDuration} onChange={e => setMDuration(e.target.value)} placeholder="6h 30m" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Cabin</label><input className={INPUT} value={mCabin} onChange={e => setMCabin(e.target.value)} placeholder="ECONOMY" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Seat</label><input className={INPUT} value={mSeat} onChange={e => setMSeat(e.target.value)} placeholder="24A" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Baggage</label><input className={INPUT} value={mBaggage} onChange={e => setMBaggage(e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Terminal</label><input className={INPUT} value={mTerminal} onChange={e => setMTerminal(e.target.value)} placeholder="Terminal 5" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Gate</label><input className={INPUT} value={mGate} onChange={e => setMGate(e.target.value)} placeholder="B24" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">PNR</label><input className={INPUT} value={mPNR} onChange={e => setMPNR(e.target.value)} placeholder="Auto-generated if blank" /></div>
            <div className="sm:col-span-3"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Message from Walz Travels (optional)</label><input className={INPUT} value={mMessage} onChange={e => setMMMessage(e.target.value)} placeholder="Thank you for choosing Walz Travels…" /></div>
          </div>
        )}

        {/* HOTEL MODE fields */}
        {mode === 'hotel' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
            <div className="sm:col-span-2"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Hotel Name</label><input className={INPUT} value={hName} onChange={e => setHName(e.target.value)} placeholder="Hilton London Metropole" /></div>
            <div className="sm:col-span-3"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Hotel Address</label><input className={INPUT} value={hAddress} onChange={e => setHAddress(e.target.value)} placeholder="225 Edgware Road, London W2 1JU" /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Check-In Date</label><input className={INPUT} type="date" value={hCheckIn} onChange={e => setHCheckIn(e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Check-Out Date</label><input className={INPUT} type="date" value={hCheckOut} onChange={e => setHCheckOut(e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Room Type</label><input className={INPUT} value={hRoomType} onChange={e => setHRoomType(e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Number of Guests</label><input className={INPUT} type="number" min="1" value={hGuests} onChange={e => setHGuests(e.target.value)} /></div>
          </div>
        )}

        <button onClick={() => void generate()}
          disabled={loading || (mode === 'live' && (!originIata || !destIata || !depDate))}
          className="h-10 px-6 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-40 transition-colors flex items-center gap-2">
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'live' ? 'Searching flights…' : 'Generating PDF…'}</>
            : <><Ticket className="w-4 h-4" /> {mode === 'live' ? 'Search & Generate PDF' : mode === 'hotel' ? 'Generate Hotel Voucher' : 'Generate Flight Ticket'}</>
          }
        </button>

        {/* Error card */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700 mb-1">
              {errorMeta?.tried ? `No flights found (tried: ${errorMeta.tried.join(', ')})` : 'Error'}
            </p>
            <p className="text-sm text-red-600">{error}</p>
            {errorMeta?.suggestion && <p className="text-xs text-gray-500 mt-1.5">{errorMeta.suggestion}</p>}
            {errorMeta?.params && (
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {errorMeta.params.origin} → {errorMeta.params.destination} · {errorMeta.params.departureDate}
              </p>
            )}
            {errorMeta?.tried && mode === 'live' && (
              <button onClick={() => { setMode('manual'); setError(''); setErrorMeta(null) }}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] hover:text-[#C9A84C] transition-colors">
                <ArrowRight className="w-3.5 h-3.5" /> Switch to Manual Entry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Flight details card (live mode) */}
      {flightDetails && (
        <div className="bg-white rounded-xl border border-[#C9A84C]/30 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-[#0B1F3A] flex items-center justify-between">
            <span className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider">Flight Found</span>
            <span className="text-xs text-white/70">{flightDetails.price}</span>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-gray-400 mb-0.5">Airline</div><div className="font-bold text-[#0B1F3A]">{flightDetails.airline}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Flight</div><div className="font-bold text-[#0B1F3A]">{flightDetails.flightNumber}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Route</div><div className="font-bold text-[#0B1F3A]">{flightDetails.fromCode} → {flightDetails.toCode}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Duration</div><div className="font-bold text-[#0B1F3A]">{flightDetails.duration} · {flightDetails.stops === 0 ? 'Direct' : `${flightDetails.stops} stop`}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Departure</div><div className="font-semibold">{new Date(flightDetails.departureAt).toLocaleString('en-GB', { day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' })}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Arrival</div><div className="font-semibold">{new Date(flightDetails.arrivalAt).toLocaleString('en-GB', { day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' })}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Cabin</div><div className="font-semibold">{flightDetails.cabin}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Baggage</div><div className="font-semibold">{flightDetails.baggage}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">Seat</div><div className="font-bold text-[#C9A84C]">{flightDetails.seat}</div></div>
            <div><div className="text-xs text-gray-400 mb-0.5">PNR</div><div className="font-bold font-mono tracking-wider">{flightDetails.pnr}</div></div>
          </div>
        </div>
      )}

      {/* PDF display — shows whenever ANY of blobUrl / pdfUrl / pdfBase64 is available */}
      {hasPDF && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                {mode === 'hotel' ? 'Hotel Voucher PDF' : 'Flight Itinerary PDF'}
              </h3>
              <div className="flex items-center gap-2">
                {/* Download — always visible, uses base64 */}
                {pdfBase64 && (
                  <button onClick={downloadPDF}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white transition-colors font-semibold">
                    <Printer className="w-3.5 h-3.5" /> Download PDF
                  </button>
                )}
                {/* Open in tab — only when Supabase URL available */}
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#C9A84C] text-gray-500 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> Open in tab
                  </a>
                )}
                {/* Send to Client — toggles inline form */}
                {pdfBase64 && (
                  <button onClick={() => setShowSendForm(s => !s)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                      showSendForm
                        ? 'bg-[#C9A84C] text-[#0B1F3A] border-[#C9A84C]'
                        : 'border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C] hover:text-[#0B1F3A]'
                    }`}>
                    <Send className="w-3.5 h-3.5" /> Send to Client
                  </button>
                )}
              </div>
            </div>

            {/* Inline send form */}
            {showSendForm && pdfBase64 && (
              <SendToClientForm
                pdfBase64={pdfBase64}
                mode={mode}
                clientName={clientName}
                flightDetails={flightDetails}
                ticketData={ticketData}
              />
            )}
          </div>

          {/* iframe — blobUrl primary (works offline), pdfUrl as fallback */}
          <iframe
            src={blobUrl || pdfUrl}
            className="w-full h-[700px] border-0"
            title="Ticket PDF Preview"
          />
        </div>
      )}
    </div>
  )
}

// ─── Tab: Document History ────────────────────────────────────────────────────

function HistoryTab() {
  const [checks,   setChecks]   = useState<DocCheck[]>([])
  const [loading,  setLoading]  = useState(true)
  const [verdict,  setVerdict]  = useState<Verdict>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/intelligence/doc-auth')
      const data = await res.json()
      setChecks(data.checks ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = verdict === 'all' ? checks : checks.filter(c => c.verdict === verdict)

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {VERDICT_TABS.map(v => (
          <button key={v} onClick={() => setVerdict(v)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              verdict === v ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {v}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C] mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No document checks found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Application', 'Type', 'Verdict', 'Score', 'Stamp', 'Sig', 'Flags', 'Checked', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <>
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-gray-500 truncate max-w-[100px]">{c.applicationId}</td>
                      <td className="px-4 py-3 text-xs capitalize">{c.documentType?.replace(/_/g,' ')}</td>
                      <td className="px-4 py-3"><VerdictBadge verdict={c.verdict} /></td>
                      <td className="px-4 py-3"><ScoreBar score={c.authenticityScore} /></td>
                      <td className="px-4 py-3">
                        {c.stampDetected     ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                      </td>
                      <td className="px-4 py-3">
                        {c.signatureDetected ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                      </td>
                      <td className="px-4 py-3">
                        {c.flags?.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {c.flags.slice(0,2).map((f,i) => <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">{f}</span>)}
                            {c.flags.length > 2 && <span className="text-xs text-gray-400">+{c.flags.length-2}</span>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(c.checkedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        {c.evidence && (
                          <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                            className="text-xs text-[#C9A84C] hover:underline flex items-center gap-0.5">
                            <ChevronDown className={`w-3 h-3 transition-transform ${expanded === c.id ? 'rotate-180' : ''}`} />
                            Details
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === c.id && c.evidence && (() => {
                      try {
                        const ev = JSON.parse(c.evidence)
                        return (
                          <tr key={`${c.id}-expanded`}>
                            <td colSpan={9} className="px-4 py-4 bg-blue-50 border-t border-blue-100">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                {ev.officerNotes && <div className="col-span-2"><strong className="text-blue-700">Officer Notes:</strong> <span className="text-gray-700">{ev.officerNotes}</span></div>}
                                {ev.holderName   && <div><strong>Holder:</strong> {ev.holderName}</div>}
                                {ev.expiryDate   && <div><strong>Expiry:</strong> {ev.expiryDate}</div>}
                                {ev.embassyReadinessRating && <div><strong>Embassy Readiness:</strong> {ev.embassyReadinessRating}</div>}
                                {ev.recommendedActions?.length > 0 && (
                                  <div className="col-span-2"><strong>Actions:</strong> {ev.recommendedActions.join(' · ')}</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      } catch { return null }
                    })()}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocAuthPage() {
  const [activeTab, setActiveTab] = useState<TabId>('upload')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Document Intelligence Centre</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered document forensics, form cross-checking, letter generation & dummy tickets</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0B1F3A] rounded-lg">
          <ShieldCheck className="w-4 h-4 text-[#C9A84C]" />
          <span className="text-xs font-semibold text-white">Powered by Claude Sonnet</span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto pb-px">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-[#C9A84C] text-[#0B1F3A]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.desc && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#92400E] font-medium">
                  {tab.desc}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'upload'       && <UploadTab />}
      {activeTab === 'form-check'   && <FormCheckTab />}
      {activeTab === 'letters'      && <LettersTab />}
      {activeTab === 'dummy-ticket' && <DummyTicketTab />}
      {activeTab === 'history'      && <HistoryTab />}
    </div>
  )
}
