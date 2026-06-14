'use client'

import { useState } from 'react'
import {
  FileText, CheckCircle, Upload, AlertTriangle,
  Loader2, RefreshCw, Copy, MessageCircle,
} from 'lucide-react'
import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'

export interface BankStatementPanelProps {
  applicationId: string
  destination: string
  applicantName: string
  applicantPhone: string | null
  passportCountry: string
  clientFileUrl: string | null
  adminFileUrl: string | null
  analysis: BankStatementAnalysis | null
  analyzedAt: string | null
  uploadedBy: string | null
}

export function BankStatementPanel({
  applicationId,
  destination,
  applicantName,
  applicantPhone,
  passportCountry,
  clientFileUrl,
  analysis: initialAnalysis,
  analyzedAt: initialAnalyzedAt,
}: BankStatementPanelProps) {
  const [file, setFile]               = useState<File | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [analyzing, setAnalyzing]     = useState(false)
  const [analysis, setAnalysis]       = useState<BankStatementAnalysis | null>(initialAnalysis)
  const [analyzedAt, setAnalyzedAt]   = useState<string | null>(initialAnalyzedAt)
  const [scanned, setScanned]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [copied, setCopied]           = useState(false)
  const [adminFileUrl, setAdminFileUrl] = useState<string | null>(null)

  async function doUploadAndAnalyze() {
    if (!file) return
    setUploading(true)
    setScanned(false)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('uploadedBy', 'admin')
    const upRes = await fetch(`/api/visa-application/${applicationId}/upload-bank-statement`, { method: 'POST', body: fd })
    if (!upRes.ok) { setUploading(false); return }
    const { fileUrl } = await upRes.json()
    setAdminFileUrl(fileUrl)
    setUploading(false)
    setAnalyzing(true)
    const anRes = await fetch('/api/analyze-bank-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        fileUrl,
        destination,
        applicantName,
        passportCountry,
        uploadedBy: 'admin',
      }),
    })
    const anData = await anRes.json()
    setAnalyzing(false)
    if (anData.scanned) { setScanned(true); return }
    if (anData.analysis) {
      setAnalysis(anData.analysis)
      setAnalyzedAt(new Date().toISOString())
    }
    setFile(null)
    setShowConfirm(false)
  }

  async function reAnalyze() {
    const url = adminFileUrl ?? clientFileUrl
    if (!url) return
    setAnalyzing(true)
    const anRes = await fetch('/api/analyze-bank-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        fileUrl: url,
        destination,
        applicantName,
        passportCountry,
        uploadedBy: 'admin',
      }),
    })
    const anData = await anRes.json()
    setAnalyzing(false)
    if (anData.analysis) {
      setAnalysis(anData.analysis)
      setAnalyzedAt(new Date().toISOString())
    }
  }

  function copyNotes() {
    if (!analysis) return
    navigator.clipboard.writeText(analysis.agentNotes ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const waUrl = applicantPhone
    ? `https://wa.me/${applicantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi ${applicantName.split(' ')[0] ?? 'there'}, we've reviewed your bank statement for your ${destination.toUpperCase()} visa application. Our team would like to discuss a few points before we proceed. When is a good time to chat?`
      )}`
    : null

  const statusCfg = {
    PASS:   { bg: 'bg-green-50',  border: 'border-green-200',  icon: '✅', label: 'PASS — Statement looks strong',          text: 'text-green-800' },
    REVIEW: { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: '🟡', label: 'REVIEW — One item needs attention',       text: 'text-amber-800' },
    FLAG:   { bg: 'bg-red-50',    border: 'border-red-200',    icon: '🔴', label: 'FLAG — Embassy likely to raise concerns',  text: 'text-red-800'   },
  }
  const cfg = analysis ? (statusCfg[analysis.status] ?? statusCfg.REVIEW) : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
        <FileText className="w-4 h-4 text-[#C9A84C]" />
        <h3 className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider">Bank Statement Analysis</h3>
      </div>

      {/* Client upload status */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1.5 font-medium">Client upload</p>
        {clientFileUrl ? (
          <div className="flex items-center gap-3">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 font-medium">Document received</span>
            <a href={clientFileUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#C9A84C] hover:underline font-semibold">View PDF →</a>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No client upload yet</p>
        )}
      </div>

      {/* Admin upload */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1.5 font-medium">Upload on behalf of client (replaces &amp; archives client file)</p>
        <label className={`flex flex-col items-center gap-2 px-4 py-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-gray-300'}`}>
          <Upload className="w-5 h-5 text-gray-400" />
          <span className="text-xs text-gray-500 text-center">
            {file
              ? <span className="text-[#C9A84C] font-semibold">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
              : 'Drop PDF here or click to browse · max 25MB'}
          </span>
          <input type="file" accept="application/pdf" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
        </label>
        {file && (
          <button
            onClick={() => clientFileUrl ? setShowConfirm(true) : doUploadAndAnalyze()}
            disabled={uploading || analyzing}
            className="mt-2 w-full py-2.5 bg-[#0B1F3A] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
            {uploading  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
            : analyzing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing (15–30s)…</>
            : <><Upload className="w-3.5 h-3.5" /> Upload &amp; Analyze</>}
          </button>
        )}
        {scanned && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            ⚠️ This PDF appears to be scanned. Ask the client to provide a digitally generated statement from their bank app or website.
          </div>
        )}
      </div>

      {/* Archive confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <h3 className="font-bold text-[#0B1F3A] text-center mb-2">Replace client upload?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">The original file will be archived, not deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={doUploadAndAnalyze}
                className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl">
                Replace &amp; Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analyzing spinner */}
      {analyzing && !analysis && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Analyzing statement — usually takes 15–30 seconds…
        </div>
      )}

      {/* Analysis result */}
      {analysis && cfg && (
        <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`font-bold text-sm ${cfg.text}`}>{cfg.icon} {cfg.label}</span>
            {analyzedAt && (
              <span className="text-xs text-gray-400">
                Analyzed {new Date(analyzedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-3 text-xs">
            <div><span className="text-gray-500">Period: </span><span className="font-medium text-gray-800">{analysis.statementPeriod}</span></div>
            <div><span className="text-gray-500">Confidence: </span><span className="font-medium text-gray-800 capitalize">{analysis.confidence}</span></div>
            <div><span className="text-gray-500">Avg balance: </span><span className="font-bold text-gray-800">{analysis.currency} {analysis.averageMonthlyBalance.toLocaleString()}</span></div>
            <div><span className="text-gray-500">Lowest: </span><span className="font-bold text-gray-800">{analysis.currency} {analysis.lowestBalance.toLocaleString()}</span></div>
            <div><span className="text-gray-500">Monthly income: </span><span className="font-medium text-gray-800">{analysis.currency} {analysis.estimatedMonthlyIncome.toLocaleString()}{analysis.salaryCreditsDetected && ' ✅'}</span></div>
            <div>
              <span className="text-gray-500">Embassy threshold: </span>
              <span className={`font-bold ${analysis.embassyThresholdMet ? 'text-green-700' : 'text-red-700'}`}>
                {analysis.embassyThresholdMet ? '✅ Met' : '❌ Not met'} (min {analysis.embassyCurrency} {analysis.embassyMinimumRequired.toLocaleString()})
              </span>
            </div>
          </div>

          {/* Suspicious transactions */}
          {analysis.suspiciousTransactions.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-bold text-gray-600 mb-1.5">Suspicious transactions:</p>
              {analysis.suspiciousTransactions.map((t, i) => (
                <div key={i} className={`flex items-start gap-1.5 text-xs mb-1 ${t.severity === 'high' ? 'text-red-700' : 'text-amber-700'}`}>
                  <span>{t.severity === 'high' ? '🔴' : '🟡'}</span>
                  <span>{t.date} · {t.description} {analysis.currency} {t.amount.toLocaleString()} — {t.reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Large withdrawals */}
          {analysis.largeUnexplainedWithdrawals.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-bold text-gray-600 mb-1.5">Large unexplained withdrawals:</p>
              {analysis.largeUnexplainedWithdrawals.map((w, i) => (
                <div key={i} className="text-xs text-red-700">
                  • {w.date} · {analysis.currency} {w.amount.toLocaleString()} — &quot;{w.description}&quot;
                </div>
              ))}
            </div>
          )}

          {/* Agent notes */}
          {analysis.agentNotes && (
            <div className="mt-3 pt-3 border-t border-black/10">
              <p className="text-xs font-bold text-gray-600 mb-1">Agent Notes:</p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{analysis.agentNotes}</p>
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-black/10">
              <p className="text-xs font-bold text-gray-600 mb-1">Recommendations:</p>
              {analysis.recommendations.map((r, i) => (
                <p key={i} className="text-xs text-gray-600 mt-0.5">• {r}</p>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-black/10">
            <button onClick={reAnalyze} disabled={analyzing || (!adminFileUrl && !clientFileUrl)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className="w-3 h-3" /> Re-analyze
            </button>
            <button onClick={copyNotes}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy Notes'}
            </button>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
