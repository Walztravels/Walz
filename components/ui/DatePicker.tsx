'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, isValid } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import 'react-day-picker/dist/style.css'

interface DatePickerFieldProps {
  label:        string
  value:        Date | undefined
  onChange:     (date: Date | undefined) => void
  minDate?:     Date
  placeholder?: string
  error?:       string
  disabled?:    boolean
}

export function DatePickerField({
  label,
  value,
  onChange,
  minDate,
  placeholder = 'Select date',
  error,
  disabled,
}: DatePickerFieldProps) {
  const [open, setOpen]   = useState(false)
  const ref               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  const displayValue = value && isValid(value) ? format(value, 'EEE, dd MMM yyyy') : placeholder
  const hasValue     = !!(value && isValid(value))

  const triggerCls = [
    'flex items-center gap-2 h-14 px-4 rounded-xl border bg-white transition-all w-full text-left',
    error
      ? 'border-red-400'
      : open
        ? 'border-[#C9A84C] ring-2 ring-[#C9A84C]/10'
        : 'border-[#0B1F3A]/10 hover:border-[#C9A84C]/40',
    disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
  ].join(' ')

  return (
    <div ref={ref} className="relative w-full">
      <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5">
        {label}
      </label>

      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)} className={triggerCls}>
        <Calendar className="w-4 h-4 text-[#0B1F3A]/30 flex-shrink-0" strokeWidth={1.5} />
        <span className={`text-sm font-medium flex-1 truncate ${hasValue ? 'text-[#0B1F3A]' : 'text-[#0B1F3A]/30'}`}>
          {displayValue}
        </span>
      </button>

      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}

      {open && (
        <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-[#0B1F3A]/10 rounded-2xl shadow-2xl overflow-hidden">
          <DayPicker
            mode="single"
            selected={value}
            onSelect={date => { onChange(date); setOpen(false) }}
            defaultMonth={value ?? minDate ?? new Date()}
            disabled={minDate ? { before: minDate } : undefined}
            components={{
              IconLeft:  () => <ChevronLeft  className="w-4 h-4" />,
              IconRight: () => <ChevronRight className="w-4 h-4" />,
            }}
            styles={{
              root: { '--rdp-accent-color': '#C9A84C', '--rdp-background-color': 'rgba(201,168,76,0.1)' } as React.CSSProperties,
            }}
            classNames={{
              root:                  'p-3 min-w-[280px]',
              months:                'flex gap-4',
              month:                 'space-y-2',
              caption:               'flex justify-center items-center relative py-1',
              caption_label:         'text-[#0B1F3A] text-sm font-bold',
              nav:                   'flex items-center gap-1',
              nav_button:            'w-7 h-7 rounded-lg bg-[#0B1F3A]/5 hover:bg-[#C9A84C]/15 flex items-center justify-center text-[#0B1F3A]/50 hover:text-[#0B1F3A] transition-colors',
              nav_button_previous:   'absolute left-0',
              nav_button_next:       'absolute right-0',
              table:                 'w-full border-collapse',
              head_row:              'flex',
              head_cell:             'w-9 h-9 text-[#0B1F3A]/30 text-xs font-semibold flex items-center justify-center',
              row:                   'flex mt-1',
              cell:                  'relative',
              day:                   'w-9 h-9 rounded-xl text-sm text-[#0B1F3A]/70 hover:bg-[#C9A84C]/10 hover:text-[#0B1F3A] transition-colors flex items-center justify-center',
              day_selected:          '!bg-[#C9A84C] !text-[#0B1F3A] font-bold hover:!bg-[#C9A84C]/90',
              day_today:             'text-[#C9A84C] font-bold',
              day_disabled:          'text-[#0B1F3A]/20 cursor-not-allowed hover:bg-transparent hover:text-[#0B1F3A]/20',
              day_outside:           'text-[#0B1F3A]/15',
            }}
          />
        </div>
      )}
    </div>
  )
}
