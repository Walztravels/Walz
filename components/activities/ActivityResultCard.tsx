'use client'

import { Clock, Compass } from 'lucide-react'

export interface ActivityModality {
  code:      string
  name:      string
  amountFrom?: string | null
  currency?: string | null
  duration?: { value?: number; metric?: string } | null
}

export interface ActivityResult {
  code:        string
  name:        string
  description?: string | null
  imageUrl?:   string | null
  modalities?: ActivityModality[]
  minAmount?:  string | null
  currency?:   string | null
}

interface Props {
  activity: ActivityResult
  onSelect: (a: ActivityResult) => void
}

function fmt(amount?: string | null, currency?: string | null) {
  if (!amount) return null
  const n = parseFloat(amount)
  if (isNaN(n)) return null
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency ?? 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function truncate(s?: string | null, max = 130) {
  if (!s) return ''
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s
}

function durationLabel(m: ActivityModality) {
  if (!m.duration?.value) return null
  const { value, metric } = m.duration
  if (metric === 'DAYS') return value === 1 ? 'Full day' : `${value} days`
  if (metric === 'HOURS') return `${value}h`
  return `${value}${(metric ?? '').toLowerCase().slice(0, 1) || 'h'}`
}

export function ActivityResultCard({ activity, onSelect }: Props) {
  const price      = fmt(activity.minAmount, activity.currency)
  const modalities = activity.modalities ?? []
  const modCount   = modalities.length

  // Pick shortest duration to display (or first)
  const firstMod   = modalities[0]
  const dur        = firstMod ? durationLabel(firstMod) : null

  return (
    <article
      className="group relative rounded-2xl overflow-hidden flex flex-col sm:flex-row bg-[#0d2347] border border-white/8 hover:border-[#C9A84C]/30 transition-all duration-300 hover:shadow-[0_8px_40px_rgba(0,0,0,0.5)] cursor-pointer"
      style={{ minHeight: 200 }}
      onClick={() => onSelect(activity)}
    >
      {/* ── Left: image ── */}
      <div className="relative w-full sm:w-60 lg:w-72 flex-shrink-0 overflow-hidden bg-gradient-to-br from-[#1a3558] to-[#0B1F3A]" style={{ minHeight: 200 }}>
        {activity.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activity.imageUrl}
            alt={activity.name}
            className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-700 ease-out"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Compass className="w-10 h-10 text-[#C9A84C]/25" strokeWidth={1} />
          </div>
        )}

        {/* Dark gradient over image */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0d2347]/60 hidden sm:block" />

        {/* Options badge */}
        {modCount > 0 && (
          <span className="absolute top-3 left-3 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
            {modCount} option{modCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Duration badge */}
        {dur && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white/80 text-[10px] font-medium px-2.5 py-1 rounded-full border border-white/10">
            <Clock className="w-3 h-3" />
            {dur}
          </span>
        )}
      </div>

      {/* ── Right: content ── */}
      <div className="flex flex-col flex-1 px-5 py-5 gap-3 min-w-0">

        {/* Name */}
        <h3 className="font-display font-bold text-white text-base lg:text-lg leading-snug group-hover:text-[#C9A84C] transition-colors duration-300 line-clamp-2">
          {activity.name}
        </h3>

        {/* Description */}
        {activity.description && (
          <p className="text-white/45 text-xs leading-relaxed line-clamp-2">
            {truncate(activity.description)}
          </p>
        )}

        {/* Modality pills */}
        {modalities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {modalities.slice(0, 3).map(m => (
              <span
                key={m.code + m.name}
                className="inline-flex items-center gap-1 text-[10px] bg-white/6 border border-white/10 text-white/55 rounded-full px-2.5 py-0.5"
              >
                {durationLabel(m) && (
                  <>
                    <Clock className="w-2.5 h-2.5 text-[#C9A84C]/60" />
                    {durationLabel(m)}&nbsp;·&nbsp;
                  </>
                )}
                <span className="truncate max-w-[140px]">{m.name}</span>
              </span>
            ))}
            {modCount > 3 && (
              <span className="text-[10px] text-white/30">+{modCount - 3} more</span>
            )}
          </div>
        )}

        {/* Price + CTA — pushed to bottom */}
        <div className="flex items-end justify-between mt-auto pt-3 border-t border-white/8">
          <div>
            {price ? (
              <>
                <p className="text-[10px] text-white/35 uppercase tracking-wider">From</p>
                <p className="text-2xl font-extrabold text-[#C9A84C] leading-none">{price}</p>
                <p className="text-[10px] text-white/35 mt-0.5">per person</p>
              </>
            ) : (
              <p className="text-xs text-white/30">Price on request</p>
            )}
          </div>

          <button
            onClick={e => { e.stopPropagation(); onSelect(activity) }}
            className="bg-[#C9A84C] hover:bg-[#d4b05a] active:scale-95 text-[#0B1F3A] font-bold text-xs px-5 py-2.5 rounded-xl transition-all duration-200 flex-shrink-0"
          >
            Book Activity
          </button>
        </div>
      </div>

      {/* Hover: gold left border accent */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#C9A84C] scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center" />
    </article>
  )
}
