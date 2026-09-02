'use client'

import { useState, useEffect } from 'react'
import type {
  BenchmarkDefinition,
  PublishabilityVerdict,
  ReviewIssueType,
  BenchmarkReviewRecord,
} from '@/lib/orbit/benchmarks'
import {
  VERDICT_DESCRIPTORS,
  REVIEW_ISSUE_DESCRIPTORS,
  getVerdictDescriptor,
} from '@/lib/orbit/benchmarks'

interface Props {
  benchmark:   BenchmarkDefinition
  campaignId?: string
  onSave:      (record: BenchmarkReviewRecord) => void
  reviewerName: string
}

const DRAFT_KEY = (key: string) => `orbit_benchmark_draft_${key}`

export function BenchmarkReviewPanel({ benchmark, campaignId, onSave, reviewerName }: Props) {
  const [verdict,        setVerdict]        = useState<PublishabilityVerdict | null>(null)
  const [issues,         setIssues]         = useState<ReviewIssueType[]>([])
  const [notes,          setNotes]          = useState('')
  const [submitted,      setSubmitted]      = useState(false)
  const [submitting,     setSubmitting]     = useState(false)
  const [submitError,    setSubmitError]    = useState<string | null>(null)
  const [savedFromDb,    setSavedFromDb]    = useState(false)

  // On mount: load from API first, fall back to localStorage draft
  useEffect(() => {
    let cancelled = false
    async function fetchExisting() {
      try {
        const res = await fetch(`/api/admin/orbit/benchmarks/reviews?benchmarkKey=${encodeURIComponent(benchmark.key)}`)
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json() as { reviews: { verdict: string; issues: string[]; notes: string | null }[] }
        const existing = data.reviews[0]
        if (existing && !cancelled) {
          setVerdict(existing.verdict as PublishabilityVerdict)
          setIssues((existing.issues ?? []) as ReviewIssueType[])
          setNotes(existing.notes ?? '')
          setSubmitted(true)
          setSavedFromDb(true)
          return
        }
      } catch { /* API unavailable — fall back to localStorage draft */ }

      // localStorage draft recovery
      if (cancelled) return
      try {
        const raw = localStorage.getItem(DRAFT_KEY(benchmark.key))
        if (raw) {
          const draft = JSON.parse(raw) as { verdict?: string; issues?: string[]; notes?: string }
          if (draft.verdict) setVerdict(draft.verdict as PublishabilityVerdict)
          if (draft.issues)  setIssues(draft.issues as ReviewIssueType[])
          if (draft.notes)   setNotes(draft.notes)
        }
      } catch { /* ignore */ }
    }
    fetchExisting()
    return () => { cancelled = true }
  }, [benchmark.key])

  // Persist to localStorage as unsaved draft while editing (not yet submitted)
  useEffect(() => {
    if (submitted) return
    try {
      localStorage.setItem(DRAFT_KEY(benchmark.key), JSON.stringify({ verdict, issues, notes }))
    } catch { /* non-fatal */ }
  }, [verdict, issues, notes, submitted, benchmark.key])

  function toggleIssue(key: ReviewIssueType) {
    setIssues(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    if (!verdict) return
    setSubmitting(true)
    setSubmitError(null)
    const record: BenchmarkReviewRecord = {
      benchmarkKey: benchmark.key,
      campaignId,
      verdict,
      issues,
      notes,
      reviewedBy:   reviewerName,
      reviewedAt:   new Date().toISOString(),
    }
    try {
      const res = await fetch('/api/admin/orbit/benchmarks/reviews', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ benchmarkKey: benchmark.key, verdict, issues, notes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Save failed')
      }
      // Clear localStorage draft on successful API save
      try { localStorage.removeItem(DRAFT_KEY(benchmark.key)) } catch { /* non-fatal */ }
      setSavedFromDb(true)
      setSubmitted(true)
      onSave(record)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    const desc = verdict ? getVerdictDescriptor(verdict) : null
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-400">Review submitted</p>
          {savedFromDb && (
            <span className="text-xs bg-green-950 border border-green-800 text-green-400 px-2 py-0.5 rounded">
              Saved to database
            </span>
          )}
        </div>
        {desc && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${desc.border} ${desc.bg}`}>
            <span className={`text-sm font-bold ${desc.color}`}>{desc.label}</span>
          </div>
        )}
        {issues.length > 0 && (
          <p className="text-xs text-gray-500">{issues.length} issue(s) logged.</p>
        )}
        <button
          onClick={() => { setSubmitted(false); setSavedFromDb(false) }}
          className="text-xs text-indigo-400 hover:text-indigo-300 underline"
        >
          Revise review
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Benchmark meta */}
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">Benchmark</p>
        <h3 className="text-base font-bold text-white">{benchmark.label}</h3>
        <p className="text-xs text-gray-400">{benchmark.description}</p>
        <div className="flex gap-2 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400">
            {benchmark.templateKey}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400">
            {benchmark.canvas}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400">
            Min score: {benchmark.minimumPublishableScore}
          </span>
        </div>
      </div>

      {/* Reviewer guidance */}
      <div className="rounded-xl border border-indigo-900 bg-indigo-950/30 p-4">
        <p className="text-xs font-semibold text-indigo-300 mb-2">Reviewer Notes</p>
        <p className="text-xs text-indigo-200 leading-relaxed">{benchmark.reviewerNotes}</p>
      </div>

      {/* Verdict selection */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Publishability Verdict</p>
        <div className="grid grid-cols-2 gap-2">
          {VERDICT_DESCRIPTORS.map(d => (
            <button
              key={d.verdict}
              onClick={() => setVerdict(d.verdict)}
              className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                verdict === d.verdict
                  ? `${d.border} ${d.bg}`
                  : 'border-gray-800 bg-gray-900 hover:bg-gray-800'
              }`}
            >
              <p className={`text-xs font-bold ${verdict === d.verdict ? d.color : 'text-gray-300'}`}>
                {d.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{d.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Issue markers */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Issues Identified</p>
        <div className="space-y-1.5">
          {REVIEW_ISSUE_DESCRIPTORS.map(desc => (
            <button
              key={desc.key}
              onClick={() => toggleIssue(desc.key)}
              className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                issues.includes(desc.key)
                  ? 'border-indigo-700 bg-indigo-950'
                  : 'border-gray-800 bg-gray-900 hover:bg-gray-850'
              }`}
            >
              <span className="mt-0.5 text-xs text-gray-600 flex-shrink-0">
                {issues.includes(desc.key) ? '✓' : '○'}
              </span>
              <div>
                <p className={`text-xs font-medium ${issues.includes(desc.key) ? 'text-indigo-300' : 'text-gray-300'}`}>
                  {desc.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{desc.remediation}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Reviewer Notes</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional observations for this design…"
          rows={3}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </div>

      {/* Submit error */}
      {submitError && (
        <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{submitError}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSave}
        disabled={!verdict || submitting}
        className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors"
      >
        {submitting ? 'Saving…' : 'Save Review'}
      </button>
    </div>
  )
}
