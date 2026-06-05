'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  ChevronRight, ChevronLeft, Save, CheckCircle, ArrowLeft,
  Loader2, Globe, Shield, AlertCircle, User, FileText,
  Phone, Briefcase, Plane, Clock, AlertTriangle, Lock,
} from 'lucide-react'
import { getVisaConfig, SLUG_TO_ISO2 } from '@/lib/visa-config'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface FormData {
  // Personal
  firstName: string; middleName: string; lastName: string
  dateOfBirth: string; sex: string; placeOfBirth: string
  nationality: string; maritalStatus: string
  // Passport
  passportNumber: string; passportType: string
  passportIssueDate: string; passportExpiryDate: string
  issuingAuthority: string; issuingCountry: string
  // Contact
  phone: string; email: string; homeAddress: string; homeAddress2: string
  city: string; stateRegion: string; country: string; postalCode: string
  // Employment
  employmentStatus: string; employerName: string; jobTitle: string
  employerAddress: string; monthlyIncome: string
  // Travel
  visaType: string; arrivalDate: string; returnDate: string
  purposeOfVisit: string; accommodationName: string
  accommodationAddress: string; portOfEntry: string
  // Visa history
  previousRefusal: boolean; previousRefusalDetails: string
  previousVisits: boolean; previousVisitDetails: string
  // Background
  criminalRecord: boolean; communicableDisease: boolean; deportedBefore: boolean
  // Country specific (flat keys)
  [key: string]: string | boolean
  // Declaration
  declarationAccurate: boolean; declarationAuthorise: boolean; declarationFeePolicy: boolean
}

const EMPTY_FORM: FormData = {
  firstName: '', middleName: '', lastName: '', dateOfBirth: '', sex: '',
  placeOfBirth: '', nationality: '', maritalStatus: '',
  passportNumber: '', passportType: 'ordinary', passportIssueDate: '',
  passportExpiryDate: '', issuingAuthority: '', issuingCountry: '',
  phone: '', email: '', homeAddress: '', homeAddress2: '', city: '',
  stateRegion: '', country: '', postalCode: '',
  employmentStatus: '', employerName: '', jobTitle: '', employerAddress: '', monthlyIncome: '',
  visaType: '', arrivalDate: '', returnDate: '', purposeOfVisit: '',
  accommodationName: '', accommodationAddress: '', portOfEntry: '',
  previousRefusal: false, previousRefusalDetails: '',
  previousVisits: false, previousVisitDetails: '',
  criminalRecord: false, communicableDisease: false, deportedBefore: false,
  declarationAccurate: false, declarationAuthorise: false, declarationFeePolicy: false,
}

const STEPS = [
  { label: 'Personal',    icon: User      },
  { label: 'Passport',    icon: Shield    },
  { label: 'Contact',     icon: Phone     },
  { label: 'Employment',  icon: Briefcase },
  { label: 'Travel',      icon: Plane     },
  { label: 'History',     icon: Clock     },
  { label: 'Background',  icon: AlertTriangle },
  { label: 'Declaration', icon: Lock      },
]

// ─── Field components ─────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#0B1F3A] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT = 'w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-colors bg-white'
const SELECT = `${INPUT} appearance-none cursor-pointer`

function TextInput({ value, onChange, placeholder, type = 'text', disabled }:
  { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} disabled={disabled}
    className={cn(INPUT, disabled && 'bg-gray-50 text-gray-400 cursor-not-allowed')} />
}

function SelectInput({ value, onChange, options, placeholder }:
  { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={SELECT}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function YesNoField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-3">
        {[['Yes', true], ['No', false]].map(([l, v]) => (
          <button key={String(l)} type="button"
            onClick={() => onChange(v as boolean)}
            className={cn(
              'flex-1 h-11 rounded-xl border-2 text-sm font-semibold transition-all',
              value === v
                ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
            )}>
            {String(l)}
          </button>
        ))}
      </div>
    </Field>
  )
}

// ─── Step content ─────────────────────────────────────────────────────────────
function StepPersonal({ form, update }: { form: FormData; update: (k: string, v: string | boolean) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="First Name" required>
        <TextInput value={form.firstName} onChange={v => update('firstName', v)} placeholder="As in passport" />
      </Field>
      <Field label="Middle Name">
        <TextInput value={form.middleName} onChange={v => update('middleName', v)} placeholder="If applicable" />
      </Field>
      <Field label="Last / Surname" required>
        <TextInput value={form.lastName} onChange={v => update('lastName', v)} placeholder="As in passport" />
      </Field>
      <Field label="Date of Birth" required>
        <TextInput type="date" value={form.dateOfBirth} onChange={v => update('dateOfBirth', v)} />
      </Field>
      <Field label="Sex" required>
        <SelectInput value={form.sex} onChange={v => update('sex', v)}
          options={['Male', 'Female', 'Other']} placeholder="Select" />
      </Field>
      <Field label="Place of Birth" required>
        <TextInput value={form.placeOfBirth} onChange={v => update('placeOfBirth', v)} placeholder="City, Country" />
      </Field>
      <Field label="Nationality" required>
        <TextInput value={form.nationality} onChange={v => update('nationality', v)} placeholder="e.g. Nigerian" />
      </Field>
      <Field label="Marital Status" required>
        <SelectInput value={form.maritalStatus} onChange={v => update('maritalStatus', v)}
          options={['Single', 'Married', 'Divorced', 'Widowed', 'Separated']} placeholder="Select" />
      </Field>
    </div>
  )
}

function StepPassport({ form, update }: { form: FormData; update: (k: string, v: string | boolean) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Passport Number" required>
        <TextInput value={form.passportNumber} onChange={v => update('passportNumber', v.toUpperCase())} placeholder="e.g. A12345678" />
      </Field>
      <Field label="Passport Type" required>
        <SelectInput value={form.passportType} onChange={v => update('passportType', v)}
          options={['Ordinary', 'Official', 'Diplomatic', 'Emergency']} placeholder="Select type" />
      </Field>
      <Field label="Issue Date" required>
        <TextInput type="date" value={form.passportIssueDate} onChange={v => update('passportIssueDate', v)} />
      </Field>
      <Field label="Expiry Date" required>
        <TextInput type="date" value={form.passportExpiryDate} onChange={v => update('passportExpiryDate', v)} />
      </Field>
      <Field label="Issuing Authority" required>
        <TextInput value={form.issuingAuthority} onChange={v => update('issuingAuthority', v)} placeholder="e.g. Nigerian Immigration Service" />
      </Field>
      <Field label="Issuing Country" required>
        <TextInput value={form.issuingCountry} onChange={v => update('issuingCountry', v)} placeholder="e.g. Nigeria" />
      </Field>
    </div>
  )
}

function StepContact({ form, update }: { form: FormData; update: (k: string, v: string | boolean) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Phone Number (with country code)" required>
        <TextInput value={form.phone} onChange={v => update('phone', v)} placeholder="+234 80 0000 0000" />
      </Field>
      <Field label="Email Address" required>
        <TextInput type="email" value={form.email} onChange={v => update('email', v)} placeholder="your@email.com" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Home Address Line 1" required>
          <TextInput value={form.homeAddress} onChange={v => update('homeAddress', v)} placeholder="Street address" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Home Address Line 2">
          <TextInput value={form.homeAddress2} onChange={v => update('homeAddress2', v)} placeholder="Apartment, suite, etc." />
        </Field>
      </div>
      <Field label="City" required>
        <TextInput value={form.city} onChange={v => update('city', v)} placeholder="City" />
      </Field>
      <Field label="State / Region">
        <TextInput value={form.stateRegion} onChange={v => update('stateRegion', v)} placeholder="State or region" />
      </Field>
      <Field label="Country of Residence" required>
        <TextInput value={form.country} onChange={v => update('country', v)} placeholder="e.g. Nigeria" />
      </Field>
      <Field label="Postal / ZIP Code">
        <TextInput value={form.postalCode} onChange={v => update('postalCode', v)} placeholder="Postal code" />
      </Field>
    </div>
  )
}

function StepEmployment({ form, update }: { form: FormData; update: (k: string, v: string | boolean) => void }) {
  const status = form.employmentStatus
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <Field label="Employment Status" required>
          <SelectInput value={status} onChange={v => update('employmentStatus', v)}
            options={['Employed (Full-time)', 'Employed (Part-time)', 'Self-employed / Business owner', 'Student', 'Retired', 'Unemployed', 'Homemaker', 'Other']}
            placeholder="Select status" />
        </Field>
      </div>
      {(status.startsWith('Employed') || status === 'Self-employed / Business owner') && <>
        <Field label="Employer / Business Name">
          <TextInput value={form.employerName} onChange={v => update('employerName', v)} placeholder="Company name" />
        </Field>
        <Field label="Job Title">
          <TextInput value={form.jobTitle} onChange={v => update('jobTitle', v)} placeholder="Your role" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Employer Address">
            <TextInput value={form.employerAddress} onChange={v => update('employerAddress', v)} placeholder="Full company address" />
          </Field>
        </div>
      </>}
      <div className="sm:col-span-2">
        <Field label="Monthly Income Range">
          <SelectInput value={form.monthlyIncome} onChange={v => update('monthlyIncome', v)}
            options={['Below $500', '$500–$1,000', '$1,000–$2,000', '$2,000–$3,500', '$3,500–$5,000', '$5,000–$10,000', 'Above $10,000', 'Prefer not to say']}
            placeholder="Select range" />
        </Field>
      </div>
    </div>
  )
}

function StepTravel({ form, update, config }: {
  form: FormData; update: (k: string, v: string | boolean) => void
  config: NonNullable<ReturnType<typeof getVisaConfig>>
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <Field label="Visa Type" required>
          <SelectInput value={form.visaType} onChange={v => update('visaType', v)}
            options={config.visaTypes} placeholder="Select visa type" />
        </Field>
      </div>
      <Field label="Intended Arrival Date" required>
        <TextInput type="date" value={form.arrivalDate} onChange={v => update('arrivalDate', v)} />
      </Field>
      <Field label="Intended Return Date" required>
        <TextInput type="date" value={form.returnDate} onChange={v => update('returnDate', v)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Purpose of Visit" required>
          <SelectInput value={form.purposeOfVisit} onChange={v => update('purposeOfVisit', v)}
            options={config.purposeOptions} placeholder="Select purpose" />
        </Field>
      </div>
      <Field label="Accommodation Name">
        <TextInput value={form.accommodationName} onChange={v => update('accommodationName', v)} placeholder="Hotel / host name" />
      </Field>
      <Field label="Accommodation Address">
        <TextInput value={form.accommodationAddress} onChange={v => update('accommodationAddress', v)} placeholder="Full address" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Intended Port of Entry">
          <SelectInput value={form.portOfEntry} onChange={v => update('portOfEntry', v)}
            options={config.portOfEntryOptions} placeholder="Select airport / port" />
        </Field>
      </div>
    </div>
  )
}

function StepHistory({ form, update }: { form: FormData; update: (k: string, v: string | boolean) => void }) {
  return (
    <div className="space-y-6">
      <YesNoField label="Have you ever been refused a visa to any country?" value={form.previousRefusal} onChange={v => update('previousRefusal', v)} />
      {form.previousRefusal && (
        <Field label="Please provide details — country, date and reason for refusal" required>
          <textarea value={form.previousRefusalDetails as string} onChange={e => update('previousRefusalDetails', e.target.value)}
            rows={3} placeholder="e.g. UK Visa — March 2022 — Insufficient funds"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
        </Field>
      )}
      <div className="border-t border-gray-100 pt-6" />
      <YesNoField label="Have you previously visited the destination country?" value={form.previousVisits} onChange={v => update('previousVisits', v)} />
      {form.previousVisits && (
        <Field label="When did you last visit and how long did you stay?" required>
          <TextInput value={form.previousVisitDetails as string} onChange={v => update('previousVisitDetails', v)}
            placeholder="e.g. June 2021, 2 weeks" />
        </Field>
      )}
    </div>
  )
}

function StepBackground({ form, update, config }: {
  form: FormData; update: (k: string, v: string | boolean) => void
  config: NonNullable<ReturnType<typeof getVisaConfig>>
}) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">Answer honestly. Consular officers verify all background information. False declarations can result in permanent visa bans.</p>
      </div>

      <YesNoField label="Do you have a criminal record in any country?" value={form.criminalRecord} onChange={v => update('criminalRecord', v)} />
      <YesNoField label="Do you have or have you ever had a communicable disease (e.g. TB)?" value={form.communicableDisease} onChange={v => update('communicableDisease', v)} />
      <YesNoField label="Have you ever been deported or removed from any country?" value={form.deportedBefore} onChange={v => update('deportedBefore', v)} />

      {/* Country-specific extra fields */}
      {config.extraFields.filter(f => f.section === 'country').length > 0 && (
        <>
          <div className="border-t border-gray-100 pt-4">
            <h3 className="font-bold text-[#0B1F3A] mb-4">{config.flag} {config.name} — Additional Questions</h3>
          </div>
          {config.extraFields.filter(f => f.section === 'country').map(field => {
            if (field.conditional && !form[field.conditional]) return null
            return (
              <div key={field.key}>
                {field.type === 'boolean' ? (
                  <YesNoField label={field.label} value={form[field.key] as boolean} onChange={v => update(field.key, v)} />
                ) : field.type === 'select' ? (
                  <Field label={field.label} required={field.required}>
                    <SelectInput value={form[field.key] as string} onChange={v => update(field.key, v)}
                      options={field.options ?? []} placeholder="Select…" />
                  </Field>
                ) : field.type === 'textarea' ? (
                  <Field label={field.label} required={field.required}>
                    <textarea value={form[field.key] as string} onChange={e => update(field.key, e.target.value)}
                      rows={3} placeholder={field.placeholder}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
                  </Field>
                ) : (
                  <Field label={field.label} required={field.required}>
                    <TextInput value={form[field.key] as string} onChange={v => update(field.key, v)} placeholder={field.placeholder} />
                  </Field>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function StepDeclaration({ form, update, config }: {
  form: FormData; update: (k: string, v: string | boolean) => void
  config: NonNullable<ReturnType<typeof getVisaConfig>>
}) {
  const items = [
    { key: 'declarationAccurate', text: 'I confirm all information provided in this application is accurate and complete. I understand that providing false or misleading information may result in visa refusal, future bans, and legal consequences.' },
    { key: 'declarationAuthorise', text: `I authorise Walz Travels Ltd to prepare and submit my visa application to the ${config.name} embassy or immigration authority on my behalf.` },
    { key: 'declarationFeePolicy', text: 'I understand the Walz Travels service fee is non-refundable once my application has been prepared and submitted. Government fees are paid separately when instructed by Walz Travels.' },
  ]
  return (
    <div className="space-y-4">
      <div className="bg-[#0B1F3A] rounded-xl p-5">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-[#C9A84C] flex items-center justify-center font-bold text-[#0B1F3A] flex-shrink-0 text-sm">J</div>
          <p className="text-white/80 text-sm leading-relaxed">
            You're almost there! Please read each declaration carefully and tick all three boxes to confirm.
            This is a legal authorisation for Walz Travels to act on your behalf.
          </p>
        </div>
      </div>
      {items.map(({ key, text }) => (
        <button key={key} type="button"
          onClick={() => update(key, !form[key])}
          className={cn(
            'w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 transition-all',
            form[key] ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-gray-300',
          )}>
          <div className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
            form[key] ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-gray-300',
          )}>
            {form[key] && <CheckCircle className="w-3.5 h-3.5 text-[#0B1F3A]" />}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
        </button>
      ))}
      <p className="text-xs text-gray-400 text-center pt-2">
        By submitting this form you enter into a service agreement with Walz Travels Ltd.
        All data is handled securely in accordance with our privacy policy.
      </p>
    </div>
  )
}

// ─── Auto-save hook ───────────────────────────────────────────────────────────
function useAutoSave(appId: string | null, data: FormData, delay = 800) {
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (patch: Partial<FormData>) => {
    if (!appId) return
    setSaving(true)
    try {
      await fetch(`/api/visa-application/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setLastSaved(new Date())
    } catch { /* silent */ }
    setSaving(false)
  }, [appId])

  const debouncedSave = useCallback((patch: Partial<FormData>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(patch), delay)
  }, [save, delay])

  return { debouncedSave, saving, lastSaved }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wider">
          Step {step + 1} of {total} — {STEPS[step].label}
        </span>
        <span className="text-xs text-gray-400">{Math.round(((step + 1) / total) * 100)}% complete</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#C9A84C] rounded-full transition-all duration-500"
          style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
      {/* Step dots */}
      <div className="flex items-center justify-between mt-3">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                i < step ? 'bg-[#C9A84C] text-[#0B1F3A]' :
                i === step ? 'bg-[#0B1F3A] text-white ring-2 ring-[#C9A84C]/30' :
                'bg-gray-100 text-gray-400',
              )}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : <StepIcon className="w-3.5 h-3.5" />}
              </div>
              <span className={cn('text-[10px] font-medium hidden sm:block',
                i === step ? 'text-[#0B1F3A]' : i < step ? 'text-[#C9A84C]' : 'text-gray-400'
              )}>{s.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VisaApplyPage() {
  const params = useParams<{ country: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status: authStatus } = useSession()

  const iso2 = SLUG_TO_ISO2[params.country?.toLowerCase() ?? ''] ?? params.country?.toUpperCase()
  const config = getVisaConfig(iso2)

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [appId, setAppId] = useState<string | null>(null)
  const [refNumber, setRefNumber] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const { debouncedSave, saving, lastSaved } = useAutoSave(appId, form)

  // Load existing draft or create new one
  useEffect(() => {
    if (authStatus === 'loading') return
    if (authStatus === 'unauthenticated') {
      router.push(`/login?callbackUrl=/visa/apply/${params.country}`)
      return
    }
    if (!config) { setLoading(false); return }

    const draftId = searchParams.get('draft')

    async function init() {
      setCreating(true)
      if (draftId) {
        // Load existing draft
        const res = await fetch(`/api/visa-application/${draftId}`)
        if (res.ok) {
          const { application: app } = await res.json()
          setAppId(app.id)
          setRefNumber(app.referenceNumber)
          // Map DB fields to form
          const f: Partial<FormData> = {}
          for (const key of Object.keys(EMPTY_FORM)) {
            const v = app[key]
            if (v !== null && v !== undefined) {
              if (typeof EMPTY_FORM[key] === 'boolean') f[key] = Boolean(v)
              else if (key.endsWith('Date') || key === 'dateOfBirth') {
                f[key] = v ? new Date(v).toISOString().split('T')[0] : ''
              } else {
                f[key] = String(v ?? '')
              }
            }
          }
          // Country-specific
          if (app.countrySpecific) {
            for (const [k, v] of Object.entries(app.countrySpecific as Record<string, unknown>)) {
              f[k] = v as string | boolean
            }
          }
          setForm(prev => ({ ...prev, ...f } as FormData))
          setCreating(false)
          setLoading(false)
          return
        }
      }

      // Create new draft
      const res = await fetch('/api/visa-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationIso2: iso2, visaType: config?.visaTypes[0] ?? '' }),
      })
      if (res.ok) {
        const { application } = await res.json()
        setAppId(application.id)
        setRefNumber(application.referenceNumber)
        // Pre-fill from returned app
        const f: Partial<FormData> = {}
        for (const key of Object.keys(EMPTY_FORM)) {
          const v = application[key]
          if (v !== null && v !== undefined) {
            if (typeof EMPTY_FORM[key] === 'boolean') f[key] = Boolean(v)
            else if (key.endsWith('Date') || key === 'dateOfBirth') {
              f[key] = v ? new Date(v).toISOString().split('T')[0] : ''
            } else {
              f[key] = String(v ?? '')
            }
          }
        }
        if (config) f.visaType = config.visaTypes[0]
        setForm(prev => ({ ...prev, ...f } as FormData))
        // Update URL without reload
        window.history.replaceState({}, '', `/visa/apply/${params.country}?draft=${application.id}`)
      }
      setCreating(false)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, iso2, params.country])

  function update(key: string, value: string | boolean) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Determine what to save: country-specific fields go into countrySpecific JSON
      const countryKeys = config?.extraFields.map(f => f.key) ?? []
      const base: Partial<FormData> = {}
      const extra: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(next)) {
        if (countryKeys.includes(k)) extra[k] = v
        else base[k] = v as string | boolean
      }
      debouncedSave({ ...base, countrySpecific: extra } as unknown as Partial<FormData>)
      return next
    })
  }

  function validate(): string | null {
    if (step === 0) {
      if (!form.firstName.trim()) return 'First name is required'
      if (!form.lastName.trim()) return 'Last name is required'
      if (!form.dateOfBirth) return 'Date of birth is required'
      if (!form.sex) return 'Sex is required'
      if (!form.nationality.trim()) return 'Nationality is required'
    }
    if (step === 1) {
      if (!form.passportNumber.trim()) return 'Passport number is required'
      if (!form.passportExpiryDate) return 'Passport expiry date is required'
    }
    if (step === 2) {
      if (!form.phone.trim()) return 'Phone number is required'
      if (!form.email.trim()) return 'Email is required'
      if (!form.homeAddress.trim()) return 'Home address is required'
      if (!form.country.trim()) return 'Country of residence is required'
    }
    if (step === 4) {
      if (!form.visaType) return 'Please select a visa type'
      if (!form.arrivalDate) return 'Arrival date is required'
      if (!form.purposeOfVisit) return 'Purpose of visit is required'
    }
    if (step === 7) {
      if (!form.declarationAccurate || !form.declarationAuthorise || !form.declarationFeePolicy) {
        return 'Please tick all three declarations to continue'
      }
    }
    return null
  }

  const [error, setError] = useState<string | null>(null)

  function goNext() {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      // Submit — go to payment
      if (appId) router.push(`/visa/apply/${params.country}/payment?id=${appId}`)
    }
  }

  function goBack() {
    setError(null)
    if (step > 0) { setStep(s => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  if (loading || authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Preparing your application…</p>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="font-bold text-[#0B1F3A] text-xl mb-2">Country not supported yet</h2>
          <p className="text-gray-500 text-sm mb-6">Online applications for this destination aren't available yet. WhatsApp us for direct assistance.</p>
          <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl">
            WhatsApp Jade
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Header */}
      <div className="bg-[#0B1F3A] px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <Link href={`/visa/${params.country}`}
            className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-4xl">{config.flag}</span>
            <div>
              <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-wider">Visa Application</p>
              <h1 className="text-white text-2xl font-bold">{config.name}</h1>
            </div>
          </div>
          {refNumber && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
              <Save className="w-3.5 h-3.5 text-[#C9A84C]" />
              <span className="text-white/60 text-xs">
                {saving ? 'Saving…' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Auto-saved'}
              </span>
              <span className="text-white/30 text-xs">·</span>
              <span className="text-[#C9A84C] text-xs font-mono font-semibold">{refNumber}</span>
            </div>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <ProgressBar step={step} total={STEPS.length} />

        <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 shadow-sm">
          {/* Step header */}
          <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
            {(() => { const S = STEPS[step].icon; return <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center"><S className="w-5 h-5 text-[#C9A84C]" /></div> })()}
            <div>
              <h2 className="font-bold text-[#0B1F3A] text-lg">{STEPS[step].label}</h2>
              <p className="text-gray-400 text-xs">Step {step + 1} of {STEPS.length}</p>
            </div>
            {saving && <Loader2 className="w-4 h-4 text-[#C9A84C] animate-spin ml-auto" />}
          </div>

          {/* Step content */}
          {step === 0 && <StepPersonal form={form} update={update} />}
          {step === 1 && <StepPassport form={form} update={update} />}
          {step === 2 && <StepContact form={form} update={update} />}
          {step === 3 && <StepEmployment form={form} update={update} />}
          {step === 4 && <StepTravel form={form} update={update} config={config} />}
          {step === 5 && <StepHistory form={form} update={update} />}
          {step === 6 && <StepBackground form={form} update={update} config={config} />}
          {step === 7 && <StepDeclaration form={form} update={update} config={config} />}

          {/* Error */}
          {error && (
            <div className="mt-5 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100">
            <button onClick={goBack} disabled={step === 0}
              className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-30 transition-all">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            <div className="text-center">
              <p className="text-xs text-gray-400">
                {saving ? '⏳ Saving…' : '✓ Progress saved automatically'}
              </p>
            </div>

            <button onClick={goNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors">
              {step === STEPS.length - 1 ? (
                <><FileText className="w-4 h-4" /> Review & Pay</>
              ) : (
                <>Next <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>

        {/* Fee summary */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#0B1F3A] text-sm">Fee Summary</h3>
            <span className="text-xs text-gray-400">{config.flag} {config.name}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Walz Travels Service Fee</span>
              <span className="font-bold text-[#0B1F3A]">USD ${config.serviceFeeUsd}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Government Fee (paid later)</span>
              <span className="text-gray-500">{config.govtFeeDisplay}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-bold">
              <span className="text-[#0B1F3A]">Due today</span>
              <span className="text-[#C9A84C]">USD ${config.serviceFeeUsd}</span>
            </div>
          </div>
        </div>

        {/* Jade tip */}
        <div className="mt-4 bg-[#0B1F3A] rounded-xl p-4 flex gap-3">
          <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">J</div>
          <p className="text-white/70 text-xs leading-relaxed">
            Your progress is saved automatically after every field. You can close this page and return any time — just use the same link or find it in your portal.
          </p>
        </div>
      </div>
    </div>
  )
}
