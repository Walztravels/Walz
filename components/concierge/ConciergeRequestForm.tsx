'use client'

import { useState, useCallback } from 'react'
import type { FormField, FieldGroup } from '@/lib/concierge/form-schema'
import { STEP_ORDER, groupFields } from '@/lib/concierge/form-schema'

// ── Built-in contact step fields ──────────────────────────────────────────────

const CONTACT_FIELDS: FormField[] = [
  {
    key:         'contactName',
    label:       'Your name',
    type:        'text',
    group:       'contact',
    required:    true,
    placeholder: 'Full name',
  },
  {
    key:         'contactEmail',
    label:       'Email address',
    type:        'text',
    group:       'contact',
    required:    true,
    placeholder: 'you@example.com',
  },
  {
    key:         'contactPhone',
    label:       'Phone / WhatsApp',
    type:        'text',
    group:       'contact',
    required:    false,
    placeholder: '+1 555 000 0000',
    helpText:    'Preferred for concierge updates',
  },
]

const BUDGET_OPTIONS = [
  { value: 'under_5k',    label: 'Under $5,000'        },
  { value: '5k_15k',      label: '$5,000 – $15,000'    },
  { value: '15k_50k',     label: '$15,000 – $50,000'   },
  { value: '50k_plus',    label: '$50,000+'             },
  { value: 'prefer_not',  label: 'Prefer not to say'   },
]

const GROUP_LABELS: Record<FieldGroup, string> = {
  service:     'Service details',
  logistics:   'Logistics',
  party:       'Your party',
  preferences: 'Preferences',
  contact:     'Your details',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConciergeRequestFormProps {
  categorySlug: string
  categoryName: string
  fields:       FormField[]
}

// ── State types ───────────────────────────────────────────────────────────────

type FormState = Record<string, string | string[]>

interface ConfirmationState {
  reference: string
  sla:       string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConciergeRequestForm({
  categorySlug,
  categoryName,
  fields,
}: ConciergeRequestFormProps) {
  // Build steps: grouped DB fields + always-present contact step
  const grouped = groupFields(fields)

  // Ensure contact step is present
  if (!grouped.has('contact')) {
    grouped.set('contact', CONTACT_FIELDS)
  } else {
    // Merge built-in contact fields with any DB-sourced ones, deduplicating by key
    const existing = grouped.get('contact')!
    const existingKeys = new Set(existing.map(f => f.key))
    const merged = [
      ...existing,
      ...CONTACT_FIELDS.filter(f => !existingKeys.has(f.key)),
    ]
    grouped.set('contact', merged)
  }

  // Steps in correct order — only groups with fields
  const steps: { group: FieldGroup; fields: FormField[] }[] = STEP_ORDER
    .filter(g => grouped.has(g))
    .map(g => ({ group: g, fields: grouped.get(g)! }))

  const totalSteps  = steps.length
  const [stepIdx, setStepIdx]     = useState(0)
  const [formState, setFormState] = useState<FormState>({})
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)

  const currentStep = steps[stepIdx]

  // ── Field value helpers ───────────────────────────────────────────────────

  const getValue = (key: string): string => {
    const v = formState[key]
    return typeof v === 'string' ? v : ''
  }

  const getMultiValue = (key: string): string[] => {
    const v = formState[key]
    return Array.isArray(v) ? v : []
  }

  const setValue = useCallback((key: string, value: string | string[]) => {
    setFormState(prev => ({ ...prev, [key]: value }))
    setErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const toggleMulti = useCallback((key: string, option: string) => {
    setFormState(prev => {
      const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : []
      const next = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option]
      return { ...prev, [key]: next }
    })
  }, [])

  // ── Validation ────────────────────────────────────────────────────────────

  function validateStep(stepFields: FormField[]): boolean {
    const newErrors: Record<string, string> = {}
    for (const field of stepFields) {
      if (!field.required) continue
      const val = formState[field.key]
      const isEmpty = !val || (Array.isArray(val) ? val.length === 0 : val.trim() === '')
      if (isEmpty) {
        newErrors[field.key] = `${field.label} is required`
      }
      // Basic email validation for the contactEmail field
      if (field.key === 'contactEmail' && val && typeof val === 'string') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          newErrors[field.key] = 'Please enter a valid email address'
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    if (validateStep(currentStep.fields)) {
      setStepIdx(i => Math.min(i + 1, totalSteps - 1))
    }
  }

  function handleBack() {
    setStepIdx(i => Math.max(i - 1, 0))
    setErrors({})
  }

  // ── Submission ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateStep(currentStep.fields)) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/concierge/requests', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ categorySlug, fields: formState }),
      })

      const data: unknown = await res.json()

      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? 'Something went wrong. Please try again.'
        setSubmitError(errMsg)
        return
      }

      const result = data as { reference: string; sla: string }
      setConfirmation({ reference: result.reference, sla: result.sla })
    } catch {
      setSubmitError('A network error occurred. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Confirmation view ─────────────────────────────────────────────────────

  if (confirmation) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center max-w-lg mx-auto">
        <div
          className="w-12 h-12 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/40
            flex items-center justify-center mx-auto mb-5"
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M4 11l5 5 9-9" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] mb-3">
          Request received
        </p>
        <h2 className="font-display text-2xl font-bold text-white mb-4">
          {confirmation.reference}
        </h2>
        <p className="text-white/60 text-sm leading-relaxed mb-6">
          Your request is with our concierge team. We'll come back to you with options and pricing within a few hours.
        </p>

        <div className="bg-white/5 rounded-xl px-5 py-3 inline-flex items-center gap-2 text-white/50 text-xs mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0" aria-hidden="true" />
          Typical response within {confirmation.sla}
        </div>

        <div>
          <a
            href={`https://wa.me/12317902336?text=Hi%2C%20my%20concierge%20reference%20is%20${confirmation.reference}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-[#C9A84C]/50 text-[#C9A84C] font-semibold
              px-6 py-3 rounded-full hover:bg-[#C9A84C]/10 transition-colors text-sm"
          >
            Message us on WhatsApp
          </a>
        </div>
      </div>
    )
  }

  // ── Form view ─────────────────────────────────────────────────────────────

  const isLastStep = stepIdx === totalSteps - 1

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em]">
            {GROUP_LABELS[currentStep.group]}
          </p>
          <p className="text-white/40 text-xs">
            Step {stepIdx + 1} of {totalSteps}
          </p>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuenow={stepIdx + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= stepIdx ? 'bg-[#C9A84C]' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step fields */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-5 mb-8">
          {currentStep.fields.map(field => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={getValue(field.key)}
              multiValue={getMultiValue(field.key)}
              error={errors[field.key]}
              onChange={val => setValue(field.key, val)}
              onToggleMulti={opt => toggleMulti(field.key, opt)}
            />
          ))}
        </div>

        {/* Submit error */}
        {submitError && (
          <p className="text-red-400 text-sm mb-5 text-center" role="alert">
            {submitError}
          </p>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {stepIdx > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 border border-white/20 text-white/70 font-semibold px-6 py-3.5
                rounded-xl hover:border-white/40 hover:text-white transition-all duration-200 text-sm"
            >
              ← Back
            </button>
          )}

          {isLastStep ? (
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3.5 rounded-xl
                hover:bg-[#d4b86e] transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending request…' : 'Submit request →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3.5 rounded-xl
                hover:bg-[#d4b86e] transition-colors text-sm"
            >
              Continue →
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// ── Field renderer ────────────────────────────────────────────────────────────

const INPUT_BASE =
  'w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm ' +
  'focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] ' +
  'placeholder:text-white/30 transition-colors duration-200'

interface FieldRendererProps {
  field:         FormField
  value:         string
  multiValue:    string[]
  error?:        string
  onChange:      (val: string) => void
  onToggleMulti: (opt: string) => void
}

function FieldRenderer({
  field,
  value,
  multiValue,
  error,
  onChange,
  onToggleMulti,
}: FieldRendererProps) {
  const id = `field-${field.key}`

  return (
    <div>
      <label htmlFor={id} className="block text-white/80 text-sm font-medium mb-1.5">
        {field.label}
        {field.required && (
          <span className="text-[#C9A84C] ml-1" aria-label="required">*</span>
        )}
      </label>

      {field.helpText && (
        <p className="text-white/40 text-xs mb-2">{field.helpText}</p>
      )}

      {field.type === 'textarea' && (
        <textarea
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={`${INPUT_BASE} resize-none`}
          aria-required={field.required}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      )}

      {field.type === 'daterange' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-from`} className="block text-white/40 text-xs mb-1">From</label>
            <input
              id={`${id}-from`}
              type="date"
              value={value.split('|')[0] ?? ''}
              onChange={e => {
                const to = value.split('|')[1] ?? ''
                onChange(`${e.target.value}|${to}`)
              }}
              className={INPUT_BASE}
              aria-required={field.required}
            />
          </div>
          <div>
            <label htmlFor={`${id}-to`} className="block text-white/40 text-xs mb-1">To</label>
            <input
              id={`${id}-to`}
              type="date"
              value={value.split('|')[1] ?? ''}
              onChange={e => {
                const from = value.split('|')[0] ?? ''
                onChange(`${from}|${e.target.value}`)
              }}
              className={INPUT_BASE}
              aria-required={field.required}
            />
          </div>
        </div>
      )}

      {field.type === 'select' && (
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${INPUT_BASE} cursor-pointer`}
          aria-required={field.required}
          aria-describedby={error ? `${id}-err` : undefined}
        >
          <option value="" disabled className="bg-[#0B1F3A]">
            {field.placeholder ?? 'Select…'}
          </option>
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#0B1F3A]">
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'budget' && (
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${INPUT_BASE} cursor-pointer`}
          aria-required={field.required}
          aria-describedby={error ? `${id}-err` : undefined}
        >
          <option value="" disabled className="bg-[#0B1F3A]">Select budget range…</option>
          {BUDGET_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#0B1F3A]">
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'multiselect' && (
        <div className="space-y-2">
          {field.options?.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={multiValue.includes(opt.value)}
                onChange={() => onToggleMulti(opt.value)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#C9A84C]
                  focus:ring-[#C9A84C] focus:ring-offset-0 cursor-pointer accent-[#C9A84C]"
              />
              <span className="text-white/70 text-sm group-hover:text-white transition-colors">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      )}

      {field.type === 'number' && (
        <input
          id={id}
          type="number"
          value={value}
          min={field.min}
          max={field.max}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={INPUT_BASE}
          aria-required={field.required}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      )}

      {/* All remaining single-input types */}
      {(field.type === 'text' || field.type === 'city' || field.type === 'date' || field.type === 'time') && (
        <input
          id={id}
          type={field.type === 'city' || field.type === 'text' ? 'text' : field.type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={
            field.type === 'city'
              ? (field.placeholder ?? 'City or location')
              : field.placeholder
          }
          className={INPUT_BASE}
          aria-required={field.required}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      )}

      {/* Error message */}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-red-400 text-xs mt-1.5">
          {error}
        </p>
      )}
    </div>
  )
}
