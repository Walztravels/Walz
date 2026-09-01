'use client'

import { useState } from 'react'
import type { TextSegment } from '@/lib/orbit/composer/layer-model'

interface Props {
  /** Current structured segments; null means plain text mode */
  segments:   TextSegment[] | null
  plainText:  string
  accentColor: string
  onChange:   (segments: TextSegment[]) => void
  onClear:    () => void
}

type SegmentStyle = TextSegment['style']

const STYLE_LABELS: Record<SegmentStyle, string> = {
  default: 'Primary',
  accent:  'Accent',
  muted:   'Muted',
}

const STYLE_COLORS: Record<SegmentStyle, string> = {
  default: '#ffffff',
  accent:  '#d4af37',
  muted:   '#aaaaaa',
}

/**
 * Split a plain-text headline into word-level TextSegments with 'default' style.
 */
function parseToSegments(text: string): TextSegment[] {
  // Split on spaces, preserving line breaks as separate segments
  return text.split(/(\s+)/).filter(Boolean).map(token => ({
    text:  token,
    style: 'default' as SegmentStyle,
  }))
}

/**
 * Rebuild plain text from segments (for display).
 */
function segmentsToPlain(segments: TextSegment[]): string {
  return segments.map(s => s.text).join('')
}

export function AccentTextEditor({ segments, plainText, accentColor, onChange, onClear }: Props) {
  const [mode, setMode] = useState<'plain' | 'structured'>(segments ? 'structured' : 'plain')
  const [activeStyle, setActiveStyle] = useState<SegmentStyle>('accent')

  const workingSegments: TextSegment[] = segments ?? parseToSegments(plainText)

  function enterStructuredMode() {
    const segs = parseToSegments(plainText)
    onChange(segs)
    setMode('structured')
  }

  function applyStyleToSegment(index: number, style: SegmentStyle) {
    const updated = workingSegments.map((s, i) => i === index ? { ...s, style } : s)
    onChange(updated)
  }

  function resetAll() {
    const reset = workingSegments.map(s => ({ ...s, style: 'default' as SegmentStyle }))
    onChange(reset)
  }

  if (mode === 'plain') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Plain headline — enter text in the commercial fields above, then enable accent styling below.
        </p>
        <button
          onClick={enterStructuredMode}
          className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 rounded-lg text-xs text-indigo-300 transition-colors"
        >
          Enable accent word styling
        </button>
      </div>
    )
  }

  // Style picker
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">Accent word styling</p>
        <div className="flex gap-1.5">
          {(Object.keys(STYLE_LABELS) as SegmentStyle[]).map(s => (
            <button
              key={s}
              onClick={() => setActiveStyle(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                activeStyle === s
                  ? 'border-indigo-600 bg-indigo-900 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              style={activeStyle === s ? {} : { color: STYLE_COLORS[s] }}
            >
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Word tokens */}
      <div className="flex flex-wrap gap-1 p-3 bg-gray-900 border border-gray-800 rounded-xl min-h-12">
        {workingSegments.map((seg, i) => {
          if (!seg.text.trim()) {
            // Space — render as non-interactive gap
            return <span key={i} className="w-1.5 inline-block" />
          }
          const color = seg.style === 'accent'
            ? accentColor
            : seg.style === 'muted'
            ? '#aaaaaa'
            : '#ffffff'
          return (
            <button
              key={i}
              onClick={() => applyStyleToSegment(i, activeStyle)}
              className="px-2 py-0.5 rounded text-sm font-bold hover:ring-1 hover:ring-indigo-500 transition-all"
              style={{ color, background: 'transparent' }}
              title={`Click to mark as ${STYLE_LABELS[activeStyle]}`}
            >
              {seg.text}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-600">
        Select a style above, then click words to apply it.
        &quot;Accent&quot; words will render in the accent colour on export.
      </p>

      <div className="flex gap-2">
        <button
          onClick={resetAll}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 transition-colors"
        >
          Reset styles
        </button>
        <button
          onClick={() => { onClear(); setMode('plain') }}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 transition-colors"
        >
          Back to plain text
        </button>
      </div>

      <p className="text-xs text-gray-600">
        Preview: <span style={{ color: '#ffffff' }}>Primary</span> ·{' '}
        <span style={{ color: accentColor }}>Accent</span> ·{' '}
        <span style={{ color: '#aaaaaa' }}>Muted</span>
      </p>
    </div>
  )
}
