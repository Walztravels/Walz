'use client'

import type { DesignControls } from '@/lib/orbit/composer/design-controls'
import { ALL_TYPOGRAPHY_PRESETS } from '@/lib/orbit/composer/typography-presets'
import { POLISH_ACTIONS, applyPolishAction, type PolishAction } from '@/lib/orbit/composer/one-click-polish'
import { DESIGN_VARIATIONS, type DesignVariation } from '@/lib/orbit/composer/design-variations'
import type { QualityScoreResult } from '@/lib/orbit/composer/quality-score'

interface Props {
  controls:        DesignControls
  onChange:        (c: DesignControls) => void
  onPolish:        (action: PolishAction) => void
  onVariation:     (variation: DesignVariation) => void
  qualityScore?:   QualityScoreResult
  generating?:     boolean
}

function Seg<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex gap-1 flex-wrap">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              value === o.value
                ? 'bg-indigo-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function scoreColorClass(score?: QualityScoreResult): string {
  if (!score) return 'text-gray-500'
  if (score.total >= 75) return 'text-green-400'
  if (score.total >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export function DesignerControlsPanel({ controls, onChange, onPolish, onVariation, qualityScore, generating }: Props) {
  function set<K extends keyof DesignControls>(key: K, value: DesignControls[K]) {
    onChange({ ...controls, [key]: value })
  }

  return (
    <div className="space-y-5">

      {/* Quality Score */}
      {qualityScore && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Design Quality</span>
            <span className={`text-lg font-bold ${scoreColorClass(qualityScore)}`}>
              {qualityScore.total}/100
            </span>
          </div>
          {qualityScore.warnings.length > 0 && (
            <div className="space-y-1">
              {qualityScore.warnings.slice(0, 3).map((w, i) => (
                <p key={i} className={`text-xs ${w.blocking ? 'text-red-400' : 'text-yellow-600'}`}>
                  {w.blocking ? '⛔ ' : '⚠️ '}{w.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* One-click Polish */}
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Polish</p>
        <div className="flex flex-wrap gap-1.5">
          {POLISH_ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => onPolish(a.key)}
              title={a.description}
              className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition-colors"
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Design Variations */}
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Variations</p>
        <div className="space-y-1.5">
          {DESIGN_VARIATIONS.map(v => (
            <button
              key={v.key}
              onClick={() => onVariation(v)}
              disabled={generating}
              className="w-full text-left px-3 py-2 bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-lg transition-colors"
            >
              <p className="text-xs font-medium text-white">{v.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800" />

      {/* Image controls */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Image</p>

        <Seg
          label="Subject position"
          value={controls.subjectPosition}
          options={[
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ]}
          onChange={v => set('subjectPosition', v)}
        />

        <Seg
          label="Subject scale"
          value={controls.subjectScale}
          options={[
            { value: 'small',  label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large',  label: 'Large' },
          ]}
          onChange={v => set('subjectScale', v)}
        />

        <Seg
          label="Image crop"
          value={controls.imageCrop}
          options={[
            { value: 'cover',         label: 'Cover' },
            { value: 'contain',       label: 'Contain' },
            { value: 'focus_top',     label: 'Top' },
            { value: 'focus_center',  label: 'Mid' },
            { value: 'focus_bottom',  label: 'Bottom' },
          ]}
          onChange={v => set('imageCrop', v)}
        />

        <Seg
          label="Background intensity"
          value={controls.backgroundIntensity}
          options={[
            { value: 'soft',     label: 'Soft' },
            { value: 'normal',   label: 'Normal' },
            { value: 'dramatic', label: 'Dramatic' },
          ]}
          onChange={v => set('backgroundIntensity', v)}
        />

        <div>
          <p className="text-xs text-gray-500 mb-1">Overlay strength — {controls.overlayStrength}%</p>
          <input
            type="range" min={0} max={100} value={controls.overlayStrength}
            onChange={e => set('overlayStrength', Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>
      </div>

      {/* Text controls */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Text</p>

        <Seg
          label="Text alignment"
          value={controls.textAlignment}
          options={[
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ]}
          onChange={v => set('textAlignment', v)}
        />

        <div>
          <p className="text-xs text-gray-500 mb-1">Typography preset</p>
          <select
            value={controls.typographyPreset}
            onChange={e => set('typographyPreset', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5"
          >
            {ALL_TYPOGRAPHY_PRESETS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Accent colour</p>
          <input
            type="color"
            value={controls.accentColor}
            onChange={e => set('accentColor', e.target.value)}
            className="w-full h-8 bg-gray-800 border border-gray-700 rounded cursor-pointer px-1"
          />
        </div>
      </div>

      {/* Layout controls */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Layout</p>

        <Seg
          label="Content density"
          value={controls.contentDensity}
          options={[
            { value: 'minimal',            label: 'Minimal' },
            { value: 'balanced',           label: 'Balanced' },
            { value: 'information_heavy',  label: 'Info-heavy' },
          ]}
          onChange={v => set('contentDensity', v)}
        />

        <Seg
          label="Footer"
          value={controls.footer}
          options={[
            { value: 'full',    label: 'Full' },
            { value: 'compact', label: 'Compact' },
            { value: 'minimal', label: 'Minimal' },
          ]}
          onChange={v => set('footer', v)}
        />

        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={controls.showGuides}
            onChange={e => set('showGuides', e.target.checked)}
            className="rounded"
          />
          Show canvas guides
        </label>
      </div>

    </div>
  )
}
