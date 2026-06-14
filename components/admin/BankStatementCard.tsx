'use client'

import { useState, useEffect } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const MAX_FILE_SIZE = 25 * 1024 * 1024

interface Analysis {
  status: 'PASS' | 'REVIEW' | 'FLAG'
  currency?: string
  statementPeriod?: string
  averageMonthlyBalance?: number
  lowestBalance?: number
  closingBalance?: number
  estimatedMonthlyIncome?: number
  salaryCreditsDetected?: boolean
  embassyThresholdMet?: boolean
  embassyMinimumRequired?: number
  embassyCurrency?: string
  suspiciousTransactions?: Array<{ date: string; description: string; amount: number; reason: string; severity: string }>
  largeUnexplainedWithdrawals?: Array<{ date: string; amount: number; description: string }>
  recommendations?: string[]
  agentNotes?: string
  confidence?: string
  warnings?: string[]
}

interface BSRecord {
  file_url?: string | null
  admin_file_url?: string | null
  analysis?: Analysis | null
  analyzed_at?: string | null
}

interface Props {
  applicationId: string
  destination: string
  applicantName: string
  applicantPhone?: string
  passportCountry?: string
}

async function sbFetch(path: string, opts?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts?.headers ?? {}),
    },
  })
}

export default function BankStatementCard({
  applicationId,
  destination,
  applicantName,
  applicantPhone,
  passportCountry = 'Nigeria',
}: Props) {
  const [open, setOpen]           = useState(false)
  const [record, setRecord]       = useState<BSRecord | null>(null)
  const [loading, setLoading]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [file, setFile]           = useState<File | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [dragOver, setDragOver]   = useState(false)

  useEffect(() => {
    if (!open || record !== null) return
    setLoading(true)
    sbFetch(`/bank_statement_analyses?application_id=eq.${encodeURIComponent(applicationId)}&select=*`)
      .then(r => r.json())
      .then((rows: BSRecord[]) => { setRecord(rows?.[0] ?? {}); setLoading(false) })
      .catch(() => { setRecord({}); setLoading(false) })
  }, [open, applicationId, record])

  const analysis = record?.analysis ?? null

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') { setError('PDF only.'); return }
    if (f.size > MAX_FILE_SIZE) { setError('Max 25MB.'); return }
    setError(null)
    setFile(f)
    if (record?.file_url || record?.admin_file_url) setShowConfirm(true)
  }

  const run = async () => {
    if (!file) return
    setShowConfirm(false)
    setUploading(true)
    setError(null)
    try {
      const storagePath = `${applicationId}/bank-statement-admin.pdf`
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/visa-documents/${storagePath}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true',
        },
        body: file,
      })
      if (!up.ok) throw new Error('Upload failed')
      const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/visa-documents/${storagePath}`

      await sbFetch('/bank_statement_analyses', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ application_id: applicationId, admin_file_url: fileUrl, uploaded_by: 'admin' }),
      })

      setRecord(p => ({ ...p, admin_file_url: fileUrl }))
      setUploading(false)
      setAnalyzing(true)

      const res = await fetch('/api/analyze-bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-target-table': 'bank_statement_analyses' },
        body: JSON.stringify({ applicationId, fileUrl, destination, applicantName, passportCountry, uploadedBy: 'admin' }),
      })
      const data = await res.json()
      if (data.success) {
        setRecord(p => ({ ...p, analysis: data.analysis, analyzed_at: new Date().toISOString() }))
      } else {
        setError(
          data.scanned
            ? 'Scanned PDF — text could not be extracted. Ask client for a digital statement.'
            : data.error ?? 'Analysis failed.'
        )
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  const STATUS = {
    PASS:   { icon: '✅', label: 'PASS — Statement looks strong',          bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-700' },
    REVIEW: { icon: '🟡', label: 'REVIEW — One item needs attention',       bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    FLAG:   { icon: '🔴', label: 'FLAG — Embassy likely to raise concerns', bg: 'bg-red-50 border-red-200',    badge: 'bg-red-100 text-red-700'   },
  }
  const cfg = analysis ? STATUS[analysis.status] : null

  const waLink = applicantPhone
    ? `https://wa.me/${applicantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi ${applicantName.split(' ')[0]}, we've reviewed your bank statement for your ${destination} visa. Our team would like to discuss a few points before we proceed. When is a good time to chat?`
      )}`
    : null

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-[#0B1F3A] transition-colors"
      >
        <span>📄</span>
        <span>Bank Statement</span>
        {analysis && cfg && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>{analysis.status}</span>
        )}
        {!analysis && (record?.file_url || record?.admin_file_url) && (
          <span className="text-gray-400">· uploaded, not analyzed</span>
        )}
        <span className="ml-auto">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
          ) : (
            <>
              {/* Existing files */}
              {(record?.file_url || record?.admin_file_url) && (
                <div className="flex gap-4 text-xs">
                  {record?.file_url && (
                    <a href={record.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      📎 Client upload
                    </a>
                  )}
                  {record?.admin_file_url && (
                    <a href={record.admin_file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      📎 Admin upload
                    </a>
                  )}
                </div>
              )}

              {/* Upload zone */}
              <div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  onClick={() => document.getElementById(`bs-${applicationId}`)?.click()}
                  className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors text-xs
                    ${dragOver ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <input
                    id={`bs-${applicationId}`}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                  />
                  {file
                    ? <span className="text-gray-700 font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                    : <span className="text-gray-400">Drop PDF · Max 25MB · Click to browse</span>}
                </div>

                {showConfirm && file && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2">
                    <p className="text-amber-800 font-medium">Replace existing statement?</p>
                    <div className="flex gap-2">
                      <button onClick={run} className="flex-1 bg-amber-600 text-white py-1.5 rounded-lg font-medium">
                        Yes, replace &amp; analyze
                      </button>
                      <button
                        onClick={() => { setShowConfirm(false); setFile(null) }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 py-1.5 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {file && !showConfirm && (
                  <button
                    onClick={run}
                    disabled={uploading || analyzing}
                    className="mt-2 w-full text-xs bg-[#0B1F3A] text-white py-2 rounded-lg font-medium hover:bg-[#1a3358] disabled:opacity-50 transition-colors"
                  >
                    {uploading ? 'Uploading…' : analyzing ? 'Analyzing — 15–30 seconds…' : 'Upload & Analyze'}
                  </button>
                )}

                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </div>

              {/* Result */}
              {analysis && cfg && (
                <div className={`rounded-lg border p-4 space-y-3 text-xs ${cfg.bg}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{cfg.icon} {cfg.label}</p>
                      {record?.analyzed_at && (
                        <p className="text-gray-400 mt-0.5">
                          {new Date(record.analyzed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {analysis.confidence ? ` · Confidence: ${analysis.confidence}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setRecord(null); setFile(null) }}
                      className="text-gray-400 hover:text-gray-600 underline text-xs"
                    >
                      Re-run
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {analysis.statementPeriod && (
                      <div><span className="text-gray-400">Period: </span>{analysis.statementPeriod}</div>
                    )}
                    {(analysis.averageMonthlyBalance ?? 0) > 0 && (
                      <div><span className="text-gray-400">Avg balance: </span>{analysis.currency} {analysis.averageMonthlyBalance?.toLocaleString()}</div>
                    )}
                    {(analysis.lowestBalance ?? 0) > 0 && (
                      <div><span className="text-gray-400">Lowest: </span>{analysis.currency} {analysis.lowestBalance?.toLocaleString()}</div>
                    )}
                    {(analysis.estimatedMonthlyIncome ?? 0) > 0 && (
                      <div>
                        <span className="text-gray-400">Income: </span>
                        {analysis.currency} {analysis.estimatedMonthlyIncome?.toLocaleString()}
                        {analysis.salaryCreditsDetected ? ' ✅' : ''}
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400">Threshold: </span>
                      {analysis.embassyThresholdMet ? '✅' : '❌'} {analysis.embassyCurrency} {analysis.embassyMinimumRequired?.toLocaleString()}
                    </div>
                  </div>

                  {(analysis.suspiciousTransactions?.length ?? 0) > 0 && (
                    <div>
                      <p className="font-medium mb-1">Suspicious transactions:</p>
                      {analysis.suspiciousTransactions!.map((t, i) => (
                        <p key={i}>
                          {t.severity === 'high' ? '🔴' : t.severity === 'medium' ? '🟡' : '⚪'} {t.date} · {t.description} — {t.reason}
                        </p>
                      ))}
                    </div>
                  )}

                  {(analysis.largeUnexplainedWithdrawals?.length ?? 0) > 0 && (
                    <div>
                      <p className="font-medium mb-1">Large withdrawals:</p>
                      {analysis.largeUnexplainedWithdrawals!.map((w, i) => (
                        <p key={i}>• {w.date} · {w.description} · {analysis.currency} {w.amount?.toLocaleString()}</p>
                      ))}
                    </div>
                  )}

                  {(analysis.recommendations?.length ?? 0) > 0 && (
                    <div>
                      <p className="font-medium mb-1">Recommendations:</p>
                      {analysis.recommendations!.map((r, i) => <p key={i}>• {r}</p>)}
                    </div>
                  )}

                  {analysis.agentNotes && (
                    <div className="bg-white/70 rounded-lg p-3 border border-gray-200">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Agent Notes</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{analysis.agentNotes}</p>
                    </div>
                  )}

                  {(analysis.warnings?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-amber-600 uppercase mb-1">⚠️ Verify manually</p>
                      {analysis.warnings!.map((w, i) => <p key={i} className="text-amber-700">• {w}</p>)}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => navigator.clipboard.writeText(analysis.agentNotes ?? '')}
                      className="flex-1 border border-gray-300 text-gray-700 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Copy Notes
                    </button>
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-green-600 text-white text-center py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        WhatsApp Client
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
