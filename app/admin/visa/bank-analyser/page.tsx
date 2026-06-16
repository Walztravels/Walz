'use client'

import { useState, useRef } from 'react'
import { Upload, Download, Mail, RefreshCw, CheckCircle, AlertTriangle, XCircle, ScanSearch } from 'lucide-react'

const DESTINATIONS = [
  { value: 'uk',        label: '🇬🇧 United Kingdom' },
  { value: 'canada',    label: '🇨🇦 Canada' },
  { value: 'usa',       label: '🇺🇸 United States' },
  { value: 'schengen',  label: '🇪🇺 Schengen (Europe)' },
  { value: 'uae',       label: '🇦🇪 UAE (Dubai)' },
  { value: 'australia', label: '🇦🇺 Australia' },
]

const PASSPORT_COUNTRIES = [
  'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Zimbabwe', 'Uganda', 'Tanzania',
  'India', 'Pakistan', 'Bangladesh', 'Philippines', 'Other',
]

const MAX_MB = 50

interface Analysis {
  status: 'PASS' | 'REVIEW' | 'FLAG'
  analysisEngine?: string
  currency?: string
  statementPeriod?: string
  monthsAnalyzed?: number
  averageMonthlyBalance?: number
  lowestBalance?: number
  highestBalance?: number
  closingBalance?: number
  totalCredits?: number
  totalDebits?: number
  estimatedMonthlyIncome?: number
  salaryCreditsDetected?: boolean
  salaryFrequency?: string
  embassyThresholdMet?: boolean
  embassyMinimumRequired?: number
  embassyCurrency?: string
  overdraftsDetected?: boolean
  overdraftCount?: number
  roundNumberDeposits?: boolean
  suspiciousTransactions?: Array<{ date: string; description: string; amount: number; reason: string; severity: string }>
  largeUnexplainedWithdrawals?: Array<{ date: string; amount: number; description: string }>
  balanceDipsBelow?: Array<{ date: string; balance: number; threshold: number }>
  recommendations?: string[]
  summary?: string
  agentNotes?: string
  confidence?: string
  warnings?: string[]
}

export default function BankAnalyserPage() {
  const [clientName, setClientName]           = useState('')
  const [clientEmail, setClientEmail]         = useState('')
  const [destination, setDestination]         = useState('uk')
  const [passportCountry, setPassportCountry] = useState('Nigeria')
  const [file, setFile]                       = useState<File | null>(null)
  const [dragOver, setDragOver]               = useState(false)
  const [uploading, setUploading]             = useState(false)
  const [analyzing, setAnalyzing]             = useState(false)
  const [analysis, setAnalysis]               = useState<Analysis | null>(null)
  const [analyzedFor, setAnalyzedFor]         = useState<{ name: string; email: string; dest: string } | null>(null)
  const [error, setError]                     = useState<string | null>(null)
  const [emailSent, setEmailSent]             = useState(false)
  const [emailSending, setEmailSending]       = useState(false)
  const [emailError, setEmailError]           = useState<string | null>(null)
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') { setError('PDF files only.'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`File too large. Maximum ${MAX_MB}MB.`); return }
    setError(null)
    setFile(f)
  }

  const handleAnalyse = async () => {
    if (!file) { setError('Please upload a bank statement PDF.'); return }
    if (!clientName.trim()) { setError('Please enter the client name.'); return }

    setUploading(true)
    setError(null)
    setAnalysis(null)
    setEmailSent(false)

    try {
      // Step 1: Get a signed upload URL (tiny JSON — no file payload through Vercel)
      const presignRes = await fetch('/api/admin/bank-analyser/presign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fileSize: file.size }),
      })
      if (!presignRes.ok) throw new Error('Upload failed: ' + await presignRes.text())
      const { refId, uploadUrl, fileUrl } = await presignRes.json()

      // Step 2: Upload directly to Supabase Storage (bypasses Vercel — no size limit)
      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body:    file,
      })
      if (!putRes.ok) throw new Error(`Storage upload failed (${putRes.status})`)

      setUploading(false)
      setAnalyzing(true)

      const res = await fetch('/api/analyze-bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-target-table': 'bank_statement_analyses' },
        body: JSON.stringify({
          applicationId: refId,
          fileUrl,
          destination,
          applicantName: clientName,
          passportCountry,
          uploadedBy: 'admin',
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        let errMsg = `Analysis failed (${res.status})`
        try { errMsg = JSON.parse(errText).error ?? errMsg } catch { /* non-JSON body */ }
        throw new Error(errMsg)
      }

      const data = await res.json()
      if (data.success) {
        setAnalysis(data.analysis)
        setAnalyzedFor({ name: clientName, email: clientEmail, dest: destination })
      } else if (data.scanned) {
        setError('This PDF appears to be a scanned image — text could not be extracted. Please ask the client to download a statement directly from their bank app or website.')
      } else {
        setError(data.error ?? 'Analysis failed. Please try again.')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  const handleSendEmail = async () => {
    if (!analysis || !analyzedFor?.email) {
      setEmailError('No email address provided.')
      return
    }
    setEmailSending(true)
    setEmailError(null)
    const res = await fetch('/api/admin/bank-analyser/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientEmail: analyzedFor.email,
        clientName: analyzedFor.name,
        destination: analyzedFor.dest,
        analysis,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setEmailSent(true)
    } else {
      setEmailError(data.error ?? 'Failed to send email.')
    }
    setEmailSending(false)
  }

  const reset = () => {
    setFile(null); setAnalysis(null); setAnalyzedFor(null)
    setError(null); setEmailSent(false); setEmailError(null)
    setClientName(''); setClientEmail('')
    setDestination('uk'); setPassportCountry('Nigeria')
  }

  const STATUS_CONFIG = {
    PASS:   { icon: CheckCircle,   color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'PASS — Statement looks strong' },
    REVIEW: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'REVIEW — One item needs attention' },
    FLAG:   { icon: XCircle,       color: 'text-red-600',   bg: 'bg-red-50 border-red-200',     label: 'FLAG — Embassy likely to raise concerns' },
  }
  const cfg = analysis ? STATUS_CONFIG[analysis.status] : null
  const destLabel = DESTINATIONS.find(d => d.value === (analyzedFor?.dest ?? destination))?.label ?? destination.toUpperCase()

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div className="no-print flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
          <ScanSearch className="w-5 h-5 text-[#C9A84C]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Bank Statement Analyser</h1>
          <p className="text-sm text-gray-500">Upload a client's PDF → instant AI visa readiness report.</p>
        </div>
      </div>

      {/* Input form */}
      {!analysis && (
        <div className="no-print bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-[#0B1F3A]">Client Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Client Full Name *</label>
              <input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Amara Osei"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Client Email (for report delivery)</label>
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="e.g. amara@example.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Visa Destination *</label>
              <select
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] transition-colors"
              >
                {DESTINATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Passport / Nationality</label>
              <select
                value={passportCountry}
                onChange={e => setPassportCountry(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] transition-colors"
              >
                {PASSPORT_COUNTRIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Upload zone */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Bank Statement PDF *</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${dragOver ? 'border-[#C9A84C] bg-amber-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <Upload className={`w-8 h-8 mx-auto mb-3 ${file ? 'text-green-500' : 'text-gray-300'}`} />
              {file ? (
                <div>
                  <p className="font-semibold text-green-700 text-sm">{file.name}</p>
                  <p className="text-xs text-green-600 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to analyse</p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-gray-600 text-sm">Drop PDF here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">PDF only · Maximum {MAX_MB}MB</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleAnalyse}
            disabled={uploading || analyzing || !file || !clientName.trim()}
            className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl text-sm
              hover:bg-[#1a3358] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</>
              : analyzing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analysing — usually 15–30 seconds…</>
              : <><ScanSearch className="w-4 h-4" /> Analyse Statement</>}
          </button>
        </div>
      )}

      {/* Result */}
      {analysis && cfg && (
        <>
          {/* Action bar */}
          <div className="no-print flex items-center justify-between gap-3 flex-wrap">
            <button onClick={reset} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
              <RefreshCw className="w-4 h-4" /> New Analysis
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              {analyzedFor?.email && (
                <div className="flex items-center gap-2">
                  {emailSent ? (
                    <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                      <CheckCircle className="w-4 h-4" /> Sent to {analyzedFor.email}
                    </span>
                  ) : (
                    <button
                      onClick={handleSendEmail}
                      disabled={emailSending}
                      className="flex items-center gap-2 bg-[#0B1F3A] text-white text-sm font-semibold px-4 py-2 rounded-xl
                        hover:bg-[#1a3358] disabled:opacity-50 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      {emailSending ? 'Sending…' : `Send to ${analyzedFor.email}`}
                    </button>
                  )}
                  {emailError && <span className="text-xs text-red-600">{emailError}</span>}
                </div>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold px-4 py-2 rounded-xl hover:bg-[#d4b45f] transition-colors"
              >
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          </div>

          {/* Report card */}
          <div id="bank-analyser-report" className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

            {/* Header */}
            <div className="bg-[#0B1F3A] px-8 py-6">
              <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-widest">Walz Travels</p>
              <h2 className="text-white text-xl font-bold mt-1">Bank Statement Analysis Report</h2>
              <p className="text-white/60 text-sm mt-1">
                {analyzedFor?.name} · {destLabel} Visa · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="p-8 space-y-6">

              {/* Status */}
              <div className={`print-section rounded-xl border p-5 ${cfg.bg}`}>
                <div className="flex items-center gap-3">
                  <cfg.icon className={`w-7 h-7 flex-shrink-0 ${cfg.color}`} />
                  <div>
                    <p className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</p>
                    {analysis.statementPeriod && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        Period reviewed: {analysis.statementPeriod}
                        {analysis.monthsAnalyzed ? ` (${analysis.monthsAnalyzed} months)` : ''}
                      </p>
                    )}
                    {analysis.confidence && (
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">AI confidence: {analysis.confidence}</p>
                    )}
                    {analysis.analysisEngine && analysis.analysisEngine !== 'none' && (
                      <p className="text-xs text-gray-400 mt-0.5">Analysed by: {analysis.analysisEngine}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              {analysis.summary && (
                <div className="print-section">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Summary</h3>
                  <p className="text-gray-700 text-sm leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100 border-l-4 border-l-[#C9A84C]">
                    {analysis.summary}
                  </p>
                </div>
              )}

              {/* Financial snapshot */}
              <div className="print-section">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Financial Snapshot</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Avg Monthly Balance',  value: `${analysis.currency ?? ''} ${(analysis.averageMonthlyBalance ?? 0).toLocaleString()}` },
                    { label: 'Lowest Balance',        value: `${analysis.currency ?? ''} ${(analysis.lowestBalance ?? 0).toLocaleString()}` },
                    { label: 'Closing Balance',       value: `${analysis.currency ?? ''} ${(analysis.closingBalance ?? 0).toLocaleString()}` },
                    { label: 'Monthly Income',        value: `${analysis.currency ?? ''} ${(analysis.estimatedMonthlyIncome ?? 0).toLocaleString()}` },
                    { label: 'Income Regular',        value: analysis.salaryCreditsDetected ? `✅ Yes (${analysis.salaryFrequency ?? 'salary'})` : '❌ Irregular' },
                    { label: 'Embassy Threshold',     value: analysis.embassyThresholdMet ? `✅ Met (min ${analysis.embassyCurrency} ${analysis.embassyMinimumRequired?.toLocaleString()})` : `❌ Not met (min ${analysis.embassyCurrency} ${analysis.embassyMinimumRequired?.toLocaleString()})` },
                    { label: 'Total Credits',         value: `${analysis.currency ?? ''} ${(analysis.totalCredits ?? 0).toLocaleString()}` },
                    { label: 'Total Debits',          value: `${analysis.currency ?? ''} ${(analysis.totalDebits ?? 0).toLocaleString()}` },
                    { label: 'Overdrafts',            value: analysis.overdraftsDetected ? `❌ Yes (${analysis.overdraftCount ?? 0}×)` : '✅ None' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
                      <p className="text-sm font-semibold text-[#0B1F3A]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Flagged transactions */}
              {(analysis.suspiciousTransactions?.length ?? 0) > 0 && (
                <div className="print-section">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Flagged Transactions</h3>
                  <div className="space-y-2">
                    {analysis.suspiciousTransactions!.map((t, i) => (
                      <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100 text-sm">
                        <span className="flex-shrink-0 mt-0.5">{t.severity === 'high' ? '🔴' : t.severity === 'medium' ? '🟡' : '⚪'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800">{t.date} · {t.description}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{t.reason}</p>
                        </div>
                        <span className="text-gray-700 font-semibold flex-shrink-0">{analysis.currency} {t.amount?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Large withdrawals */}
              {(analysis.largeUnexplainedWithdrawals?.length ?? 0) > 0 && (
                <div className="print-section">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Large Unexplained Withdrawals</h3>
                  <div className="space-y-2">
                    {analysis.largeUnexplainedWithdrawals!.map((w, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100 text-sm">
                        <span>⚠️</span>
                        <span className="flex-1 text-gray-700">{w.date} · {w.description}</span>
                        <span className="font-semibold text-gray-800 flex-shrink-0">{analysis.currency} {w.amount?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {(analysis.recommendations?.length ?? 0) > 0 && (
                <div className="print-section">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Recommendations</h3>
                  <div className="space-y-2">
                    {analysis.recommendations!.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-[#C9A84C]/20 text-[#0B1F3A] flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">{i + 1}</span>
                        <p className="text-gray-700">{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent notes */}
              {analysis.agentNotes && (
                <div className="print-section bg-[#0B1F3A]/5 border border-[#0B1F3A]/10 rounded-xl p-5">
                  <h3 className="text-xs font-semibold text-[#0B1F3A] uppercase tracking-widest mb-2">Internal Agent Notes</h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{analysis.agentNotes}</p>
                </div>
              )}

              {/* Warnings */}
              {(analysis.warnings?.length ?? 0) > 0 && (
                <div className="print-section">
                  <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-2">⚠️ Verify Manually</h3>
                  {analysis.warnings!.map((w, i) => (
                    <p key={i} className="text-sm text-amber-700">• {w}</p>
                  ))}
                </div>
              )}

              {/* Report footer */}
              <div className="border-t border-gray-100 pt-5 text-xs text-gray-400 leading-relaxed">
                This analysis was prepared by Walz Travels using AI-assisted document review. It is advisory only and
                does not constitute a guarantee of visa outcome. Entry decisions are made solely by destination country
                immigration authorities. © {new Date().getFullYear()} Walz Travels · contact@walztravels.com
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
