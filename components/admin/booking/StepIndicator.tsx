'use client'
import { Check } from 'lucide-react'

interface StepIndicatorProps {
  steps:         string[]
  current:       number    // 0-indexed
  onStepClick?:  (index: number) => void
}

export default function StepIndicator({ steps, current, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Booking progress" className="flex items-center gap-0 overflow-x-auto">
      {steps.map((label, i) => {
        const done    = i < current
        const active  = i === current
        const future  = i > current
        const canClick = done && !!onStepClick

        return (
          <div key={label} className="flex items-center">
            {/* connector */}
            {i > 0 && (
              <div className={`h-px w-6 sm:w-10 flex-shrink-0 transition-colors ${
                done ? 'bg-[#C9A84C]' : 'bg-[#2a3f5f]'
              }`} />
            )}

            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick(i)}
              className={`flex flex-col items-center gap-1 group transition-opacity ${
                canClick ? 'cursor-pointer' : 'cursor-default'
              } ${future ? 'opacity-40' : ''}`}
            >
              {/* circle */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done
                  ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0B1F3A]'
                  : active
                  ? 'bg-transparent border-[#C9A84C] text-[#C9A84C]'
                  : 'bg-transparent border-[#2a3f5f] text-[#4a5f7f]'
              }`}>
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : i + 1}
              </div>

              {/* label */}
              <span className={`text-[10px] font-medium tracking-wide whitespace-nowrap hidden sm:block ${
                active ? 'text-[#C9A84C]' : done ? 'text-[#C9A84C]/70' : 'text-[#4a5f7f]'
              }`}>
                {label}
              </span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
