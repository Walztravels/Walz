import { ALL_BENCHMARKS } from '@/lib/orbit/benchmarks'
import { BenchmarkReviewPanel } from './BenchmarkReviewPanel'
import type { BenchmarkReviewRecord } from '@/lib/orbit/benchmarks'

export const dynamic = 'force-dynamic'

export default function BenchmarksPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold mb-1">Walz Orbit</p>
          <h1 className="text-2xl font-bold text-white">Design Benchmarks</h1>
          <p className="text-sm text-gray-400 mt-1">
            Compare Orbit output against calibration reference designs.
            Record a publishability verdict for each benchmark campaign.
          </p>
        </div>

        {/* Benchmark grid */}
        <div className="space-y-10">
          {ALL_BENCHMARKS.map(benchmark => (
            <BenchmarkCard key={benchmark.key} benchmark={benchmark} />
          ))}
        </div>

        {/* Guidance footer */}
        <div className="mt-12 border-t border-gray-800 pt-6">
          <p className="text-xs text-gray-600 leading-relaxed max-w-2xl">
            Benchmarks are calibration reference designs — not active campaigns.
            Use them to validate that Orbit is producing publishable-quality output
            for each template type. Verdict: <span className="text-green-500">Publishable</span>{' '}
            means the design could go live today with no changes.{' '}
            <span className="text-yellow-500">Needs Minor Edit</span> means one small tweak
            (e.g. overlay strength) would make it publishable.{' '}
            <span className="text-red-400">Reject</span> means fundamental issues —
            the template calibration or AI prompt needs fixing.
          </p>
        </div>

      </div>
    </div>
  )
}

// ── Benchmark card (server component — passes onSave stub to client panel) ────

function BenchmarkCard({ benchmark }: { benchmark: (typeof ALL_BENCHMARKS)[0] }) {
  function handleSave(_record: BenchmarkReviewRecord) {
    // In production: persist to Supabase orbit_benchmark_reviews table
    // For now: log to console
    console.log('[Benchmark review]', _record)
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">

      {/* Card header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-indigo-400 uppercase tracking-wider font-semibold">
            {benchmark.templateKey.replace('walz_', '').replace(/_/g, ' ')}
          </p>
          <h2 className="text-lg font-bold text-white mt-0.5">{benchmark.label}</h2>
          <p className="text-sm text-gray-400 mt-1">{benchmark.description}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-gray-500">Min quality score</p>
          <p className="text-xl font-bold text-white">{benchmark.minimumPublishableScore}</p>
        </div>
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-800">

        {/* Left: expected design profile */}
        <div className="px-6 py-5 space-y-5">
          <h3 className="text-sm font-semibold text-gray-200">Expected Design Profile</h3>

          {/* Visual */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Visual Style</p>
            <div className="space-y-1">
              <Row label="Palette"    value={benchmark.expectedVisual.palette.replace(/_/g, ' ')} />
              <Row label="Mood"       value={benchmark.expectedVisual.mood} />
              <Row label="Subject"    value={`${benchmark.expectedVisual.subjectPlacement} · ${benchmark.expectedVisual.subjectScale}`} />
              <Row label="Focus"      value={benchmark.expectedVisual.subjectFocus} />
            </div>
          </div>

          {/* Layout */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Layout</p>
            <div className="space-y-1">
              <Row label="Density"    value={benchmark.expectedLayout.contentDensity.replace(/_/g, ' ')} />
              <Row label="Footer"     value={benchmark.expectedLayout.footer} />
              <Row label="Overlay"    value={`${benchmark.expectedLayout.overlayStrength}/100`} />
              <Row label="Typography" value={benchmark.expectedLayout.typographyPreset.replace(/_/g, ' ')} />
            </div>
          </div>

          {/* Decoratives */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Decorative Elements</p>
            <p className="text-xs text-gray-300">
              {benchmark.expectedDecoratives.length === 0
                ? 'None — clean layout only'
                : benchmark.expectedDecoratives.join(', ')}
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{benchmark.decorativeNotes}</p>
          </div>

          {/* Subject placement */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Subject Placement</p>
            <p className="text-xs text-gray-400 leading-relaxed">{benchmark.subjectPlacementNotes}</p>
          </div>
        </div>

        {/* Right: review panel */}
        <div className="px-6 py-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Quality Review</h3>
          <BenchmarkReviewPanel
            benchmark={benchmark}
            reviewerName="admin"
            onSave={handleSave}
          />
        </div>

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className="text-xs text-gray-300 leading-snug">{value}</span>
    </div>
  )
}
