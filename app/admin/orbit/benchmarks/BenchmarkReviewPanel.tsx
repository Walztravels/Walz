'use client'

import { useState } from 'react'
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

export function BenchmarkReviewPanel({ benchmark, campaignId, onSave, reviewerName }: Props) {
  const [verdict,   setVerdict]   = useState<PublishabilityVerdict | null>(null)
  const [issues,    setIssues]    = useState<ReviewIssueType[]>([])
  const [notes,     setNotes]     = useState('')
  const [submitted, setSubmitted] = useState(false)

  function toggleIssue(key: ReviewIssueType) {
    setIssues(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function handleSave() {
    if (!verdict) return
    const record: BenchmarkReviewRecord = {
      benchmarkKey: benchmark.key,
      campaignId,
      verdict,
      issues,
      notes,
      reviewedBy:   reviewerName,
      reviewedAt:   new Date().toISOString(),
    }
    onSave(record)
    setSubmitted(true)
  }

  if (submitted) {
    const desc = verdict ? getVerdictDescriptor(verdict) : null
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-3">
        <p className="text-sm text-gray-400">Review submitted</p>
        {desc && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${desc.border} ${desc.bg}`}>
            <span className={`text-sm font-bold ${desc.color}`}>{desc.label}</span>
          </div>
        )}
        {issues.length > 0 && (
          <p className="text-xs text-gray-500">{issues.length} issue(s) logged.</p>
        )}
        <button
          onClick={() => { setSubmitted(false); setVerdict(null); setIssues([]); setNotes('') }}
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

      {/* Submit */}
      <button
        onClick={handleSave}
        disabled={!verdict}
        className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors"
      >
        Save Review
      </button>
    </div>
  )
}
