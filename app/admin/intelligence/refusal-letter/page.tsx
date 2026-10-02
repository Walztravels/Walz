'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Loader2, AlertTriangle, ShieldAlert, CheckCircle2, FileWarning } from 'lucide-react'
import IntelligenceCaseSelector from '@/components/admin/intelligence/IntelligenceCaseSelector'
import type { ActiveCaseRef } from '@/lib/intelligence/active-case-client'

/**
 * Visa Refusal Letter Analyzer — STAFF ONLY.
 *
 * This page never shows a client. It is reached only through the admin
 * Intelligence Hub, gated by the same getAdminSession() check as every
 * other Document Intelligence surface. No part of its output is ever
 * routed to a client-facing page or a Jade tool.
 *
 * UI-LEVEL HARD GATE: the checklist section below has NO code path that
 * can render for MISREPRESENTATION_OR_FRAUD or REQUIRES_HUMAN_REVIEW —
 * it is not just fed an empty array, the JSX block itself is conditioned
 * on classification === 'DOCUMENTATION_OR_ELIGIBILITY'.
 */

type Classification = 'DOCUMENTATION_OR_ELIGIBILITY' | 'MISREPRESENTATION_OR_FRAUD' | 'REQUIRES_HUMAN_REVIEW'

interface RefusalReasonView {
  rawQuote: string
  plainEnglish: string
  category: string
  sourcePageHint: number | null
  quoteVerified?: boolean
}
interface ChecklistItemView { item: string; reason: string }

interface AnalysisView {
  classification: Classification
  confidence: 'high' | 'medium' | 'low'
  detectedJurisdiction: string
  detectedJurisdictionIso2: string | null
  jurisdictionVerificationStatus: 'VERIFIED' | 'UNVERIFIED'
  references: string[]
  refusalReasons: RefusalReasonView[]
  previousRefusalLanguageDetected: boolean
  officerConcerns: string[]
  checklist: ChecklistItemView[]
  legalReviewFlag: boolean
  staffFacingDisclaimer: string
  categoryADisclaimer: string | null
  summary: string
  flaggedQuotes: string[]
  warnings: string[]
  analysisEngine: string
}

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  DOCUMENTATION_OR_ELIGIBILITY: 'Documentation / Eligibility',
  MISREPRESENTATION_OR_FRAUD:   'Misrepresentation or Fraud — Legal Review',
  REQUIRES_HUMAN_REVIEW:        'Requires Human Review',
}
const CLASSIFICATION_STYLE: Record<Classification, string> = {
  DOCUMENTATION_OR_ELIGIBILITY: 'bg-green-50 border-green-200 text-green-800',
  MISREPRESENTATION_OR_FRAUD:   'bg-red-50 border-red-200 text-red-800',
  REQUIRES_HUMAN_REVIEW:        'bg-amber-50 border-amber-200 text-amber-800',
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function RefusalLetterAnalyzerPage() {
  const [activeCase, setActiveCase] = useState<ActiveCaseRef | null>(null)
  const [applicantName, setApplicantName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null)
  const [persisted, setPersisted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load any previously saved analysis for the selected case.
  const loadSaved = useCallback(async (applicationId: string) => {
    try {
      const res = await fetch(`/api/admin/intelligence/refusal-letter?applicationId=${encodeURIComponent(applicationId)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.saved?.analysis) {
        setAnalysis(data.saved.analysis)
        setPersisted(true)
      }
    } catch { /* best-effort — a fresh upload still works */ }
  }, [])

  useEffect(() => {
    if (activeCase?.applicationId) void loadSaved(activeCase.applicationId)
  }, [activeCase?.applicationId, loadSaved])

  const submit = async () => {
    if (!file) return
    setLoading(true); setError(''); setAnalysis(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (activeCase?.applicationId) fd.append('applicationId', activeCase.applicationId)
      if (applicantName) fd.append('applicantName', applicantName)
      const res  = await fetch('/api/admin/intelligence/refusal-letter', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.analysis) {
        setError((data.message as string) ?? `Analysis failed (HTTP ${res.status}). Please try again.`)
        return
      }
      setAnalysis(data.analysis as AnalysisView)
      setPersisted(Boolean(data.persisted))
    } catch {
      setError('Network error during analysis — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#0B1F3A] rounded-2xl px-8 py-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-7 h-7 text-[#C9A84C]" />
          <h1 className="text-2xl font-bold text-white">Visa Refusal Letter Analyzer</h1>
        </div>
        <p className="text-[#C9A84C]/80 text-sm max-w-2xl">
          Staff-only classification tool. It never predicts outcomes, never states an exact inadmissibility
          period, and never generates reapplication guidance for a possible misrepresentation finding —
          those always route straight to legal review.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-[#0B1F3A] mb-4">Upload Refusal Letter</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <IntelligenceCaseSelector value={activeCase} onSelect={setActiveCase} label="Linked Application (optional)" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Applicant Name (optional)</label>
            <input className={INPUT} value={applicantName} onChange={e => setApplicantName(e.target.value)} placeholder="Full name as on the letter" />
          </div>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#C9A84C] hover:bg-gray-50'}`}
        >
          <input ref={fileRef} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
          {file ? (
            <p className="text-sm font-semibold text-green-700">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>
          ) : (
            <div>
              <Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Drop the refusal letter here or click to upload — PDF, JPG, PNG or WEBP, max 15MB</p>
            </div>
          )}
        </div>

        <button onClick={() => void submit()} disabled={!file || loading}
          className="mt-4 h-10 px-6 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-40 transition-colors flex items-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><ShieldAlert className="w-4 h-4" /> Analyze Letter</>}
        </button>
        {error && <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">{error}</p>}
      </div>

      {analysis && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b ${CLASSIFICATION_STYLE[analysis.classification]}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Classification</div>
                <div className="text-xl font-black mt-0.5">{CLASSIFICATION_LABEL[analysis.classification]}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/70 capitalize">Confidence: {analysis.confidence}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${analysis.jurisdictionVerificationStatus === 'VERIFIED' ? 'bg-white/70' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                  {analysis.detectedJurisdiction} · {analysis.jurisdictionVerificationStatus}
                </span>
              </div>
            </div>
            {persisted && <p className="text-[10px] mt-2 opacity-70">Saved to this case.</p>}
          </div>

          <div className="p-6 space-y-5">
            {analysis.summary && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Summary (staff only)</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary}</p>
              </div>
            )}

            {analysis.references.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">References</h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.references.map((r, i) => (
                    <span key={i} className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono">{r}</span>
                  ))}
                </div>
              </div>
            )}

            {analysis.previousRefusalLanguageDetected && (
              <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> This letter references a previous refusal.
              </div>
            )}

            {analysis.refusalReasons.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Officer&apos;s Stated Reasons</h3>
                <div className="space-y-2">
                  {analysis.refusalReasons.map((r, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${r.quoteVerified === false ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>
                      <p className="text-sm italic text-gray-800">&quot;{r.rawQuote}&quot;</p>
                      <p className="text-xs text-gray-500 mt-1">{r.plainEnglish}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">{r.category.replace(/_/g, ' ')}</span>
                        {r.quoteVerified === false && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
                            <FileWarning className="w-3 h-3" /> Could not verify this quote against the extracted document text — check the source letter directly.
                          </span>
                        )}
                        {r.quoteVerified === true && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-700">
                            <CheckCircle2 className="w-3 h-3" /> Verified against source text
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.officerConcerns.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Officer Concerns</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {analysis.officerConcerns.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            {/* ── HARD UI GATE ───────────────────────────────────────────────
                The ONLY place a checklist can ever render. This block is
                conditioned on classification being EXACTLY
                DOCUMENTATION_OR_ELIGIBILITY — there is no other code path
                anywhere in this component that renders checklist items. */}
            {analysis.classification === 'DOCUMENTATION_OR_ELIGIBILITY' && analysis.checklist.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Evidence Checklist</h3>
                <ul className="space-y-2 mb-3">
                  {analysis.checklist.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0B1F3A] text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <div><span className="font-semibold">{c.item}</span>{c.reason && <span className="text-gray-500"> — {c.reason}</span>}</div>
                    </li>
                  ))}
                </ul>
                {analysis.categoryADisclaimer && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">{analysis.categoryADisclaimer}</p>
                )}
              </div>
            )}

            {(analysis.classification === 'MISREPRESENTATION_OR_FRAUD' || analysis.classification === 'REQUIRES_HUMAN_REVIEW') && (
              <div className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="font-semibold">{analysis.staffFacingDisclaimer || 'This refusal may involve a misrepresentation finding. Legal consultation is required before proceeding with any reapplication.'}</p>
              </div>
            )}

            {analysis.warnings.length > 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 space-y-1">
                <p className="font-semibold text-gray-600">System notes</p>
                {analysis.warnings.map((w, i) => <p key={i}>• {w}</p>)}
              </div>
            )}

            <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
              AI classification is a review aid, not a legal conclusion. Engine: {analysis.analysisEngine}.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
