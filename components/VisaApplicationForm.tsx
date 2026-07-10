'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import Link from 'next/link'
import {
  ChevronRight, ChevronLeft, Save, CheckCircle, ArrowLeft,
  Loader2, Globe, Shield, AlertCircle, User, FileText,
  Phone, Briefcase, Plane, Clock, AlertTriangle, Lock, LogIn, Upload, CreditCard,
} from 'lucide-react'
import { getVisaConfig, ISO2_TO_SLUG, VisaCountryConfig, VisaExtraField } from '@/lib/visa-config'
import { PaymentStep } from '@/components/visa/PaymentStep'
import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VFormData {
  firstName: string; middleName: string; lastName: string
  dateOfBirth: string; sex: string; placeOfBirth: string
  nationality: string; maritalStatus: string
  passportNumber: string; passportType: string
  passportIssueDate: string; passportExpiryDate: string
  issuingAuthority: string; issuingCountry: string
  phone: string; email: string; homeAddress: string; homeAddress2: string
  city: string; stateRegion: string; country: string; postalCode: string
  employmentStatus: string; employerName: string; jobTitle: string
  employerAddress: string; monthlyIncome: string
  visaType: string; arrivalDate: string; returnDate: string
  purposeOfVisit: string; accommodationName: string
  accommodationAddress: string; portOfEntry: string
  previousRefusal: boolean; previousRefusalDetails: string
  previousVisits: boolean; previousVisitDetails: string
  criminalRecord: boolean; communicableDisease: boolean; deportedBefore: boolean
  declarationAccurate: boolean; declarationAuthorise: boolean; declarationFeePolicy: boolean
  [key: string]: string | boolean
}

const EMPTY_FORM: VFormData = {
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

interface FamilyApplicant {
  id: string
  relationship: string
  firstName: string
  lastName: string
  dateOfBirth: string
  nationality: string
  passportNumber: string
  passportExpiry: string
  isMinor: boolean
}

const STEPS = [
  { label: 'Personal',    icon: User          },
  { label: 'Passport',    icon: Shield        },
  { label: 'Contact',     icon: Phone         },
  { label: 'Employment',  icon: Briefcase     },
  { label: 'Travel',      icon: Plane         },
  { label: 'History',     icon: Clock         },
  { label: 'Background',  icon: AlertTriangle },
  { label: 'Documents',   icon: Upload        },
  { label: 'Declaration', icon: Lock          },
  { label: 'Payment',    icon: CreditCard    },
]

// ─── Generic fallback config for unsupported destinations ─────────────────────

function makeGenericConfig(name: string, flag: string): VisaCountryConfig {
  return {
    destinationIso2: '',
    name,
    flag,
    visaTypes: ['Tourist', 'Business', 'Student', 'Medical', 'Family Visit', 'Other'],
    serviceFeeUsd: 0,
    govtFeeDisplay: 'To be advised',
    govtFeeAmount: 0,
    govtFeeCurrency: 'USD',
    processingDaysMin: 0,
    processingDaysMax: 0,
    purposeOptions: ['Tourism / Holiday', 'Business Meeting', 'Family Visit', 'Education', 'Medical Treatment', 'Transit', 'Other'],
    portOfEntryOptions: ['Main International Airport', 'Other'],
    extraFields: [],
    notes: '',
  }
}

// ─── Field primitives ─────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/10 transition-colors bg-white'
const SELECT_CLS = `${INPUT_CLS} appearance-none cursor-pointer`

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#0B1F3A] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean
}) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} disabled={disabled}
    className={cn(INPUT_CLS, disabled && 'bg-gray-50 text-gray-400 cursor-not-allowed')} />
}

function SelectInput({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLS}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function YesNoField({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-3">
        {([['Yes', true], ['No', false]] as const).map(([l, v]) => (
          <button key={String(l)} type="button" onClick={() => onChange(v as boolean)}
            className={cn('flex-1 h-11 rounded-xl border-2 text-sm font-semibold transition-all',
              value === v ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')}>
            {String(l)}
          </button>
        ))}
      </div>
    </Field>
  )
}

function ExtraFields({
  config,
  form,
  update,
  sections,
  label,
}: {
  config: VisaCountryConfig
  form: VFormData
  update: (k: string, v: string | boolean) => void
  sections: VisaExtraField['section'][]
  label?: string
}) {
  const fields = config.extraFields.filter(f => sections.includes(f.section))
  if (fields.length === 0) return null
  return (
    <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
      <p className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider">
        {label ?? `${config.flag} ${config.name} — Additional Required Information`}
      </p>
      {fields.map(field => {
        if (field.conditional && !form[field.conditional]) return null
        if (field.conditionalFalse && form[field.conditionalFalse] !== false) return null
        return (
          <div key={field.key}>
            {field.type === 'boolean' ? (
              <YesNoField
                label={field.label}
                value={form[field.key] as boolean | undefined}
                onChange={v => update(field.key, v)}
              />
            ) : field.type === 'select' ? (
              <Field label={field.label} required={field.required}>
                <SelectInput
                  value={(form[field.key] as string) ?? ''}
                  onChange={v => update(field.key, v)}
                  options={field.options ?? []}
                  placeholder="Select…"
                />
              </Field>
            ) : field.type === 'textarea' ? (
              <Field label={field.label} required={field.required}>
                <textarea
                  value={(form[field.key] as string) ?? ''}
                  onChange={e => update(field.key, e.target.value)}
                  rows={4}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none"
                />
              </Field>
            ) : (
              <Field label={field.label} required={field.required}>
                <TextInput
                  value={(form[field.key] as string) ?? ''}
                  onChange={v => update(field.key, v)}
                  placeholder={field.placeholder}
                />
              </Field>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepPersonal({ form, update, config }: { form: VFormData; update: (k: string, v: string | boolean) => void; config: VisaCountryConfig }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First Name" required><TextInput value={form.firstName} onChange={v => update('firstName', v)} placeholder="As in passport" /></Field>
        <Field label="Middle Name"><TextInput value={form.middleName} onChange={v => update('middleName', v)} placeholder="If applicable" /></Field>
        <Field label="Last / Surname" required><TextInput value={form.lastName} onChange={v => update('lastName', v)} placeholder="As in passport" /></Field>
        <Field label="Date of Birth" required><TextInput type="date" value={form.dateOfBirth} onChange={v => update('dateOfBirth', v)} /></Field>
        <Field label="Sex" required><SelectInput value={form.sex} onChange={v => update('sex', v)} options={['Male', 'Female', 'Other']} placeholder="Select" /></Field>
        <Field label="Place of Birth" required><TextInput value={form.placeOfBirth} onChange={v => update('placeOfBirth', v)} placeholder="City, Country" /></Field>
        <Field label="Nationality" required><TextInput value={form.nationality} onChange={v => update('nationality', v)} placeholder="e.g. Nigerian" /></Field>
        <Field label="Marital Status" required><SelectInput value={form.maritalStatus} onChange={v => update('maritalStatus', v)} options={['Single', 'Married', 'Common-law', 'Divorced', 'Legally Separated', 'Widowed', 'Annulled Marriage']} placeholder="Select" /></Field>
      </div>
      <ExtraFields config={config} form={form} update={update} sections={['personal']} />
      <ExtraFields
        config={config}
        form={form}
        update={update}
        sections={['family']}
        label={`${config.flag} Family Information (IMM 5707) — Parents, Siblings & Children`}
      />
    </div>
  )
}

function StepPassport({ form, update }: { form: VFormData; update: (k: string, v: string | boolean) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Passport Number" required><TextInput value={form.passportNumber} onChange={v => update('passportNumber', v.toUpperCase())} placeholder="e.g. A12345678" /></Field>
      <Field label="Passport Type" required><SelectInput value={form.passportType} onChange={v => update('passportType', v)} options={['Ordinary', 'Official', 'Diplomatic', 'Emergency']} placeholder="Select type" /></Field>
      <Field label="Issue Date" required><TextInput type="date" value={form.passportIssueDate} onChange={v => update('passportIssueDate', v)} /></Field>
      <Field label="Expiry Date" required><TextInput type="date" value={form.passportExpiryDate} onChange={v => update('passportExpiryDate', v)} /></Field>
      <Field label="Issuing Authority" required><TextInput value={form.issuingAuthority} onChange={v => update('issuingAuthority', v)} placeholder="e.g. Nigerian Immigration Service" /></Field>
      <Field label="Issuing Country" required><TextInput value={form.issuingCountry} onChange={v => update('issuingCountry', v)} placeholder="e.g. Nigeria" /></Field>
    </div>
  )
}

function StepContact({ form, update }: { form: VFormData; update: (k: string, v: string | boolean) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Phone Number (with country code)" required><TextInput value={form.phone} onChange={v => update('phone', v)} placeholder="+234 80 0000 0000" /></Field>
      <Field label="Email Address" required><TextInput type="email" value={form.email} onChange={v => update('email', v)} placeholder="your@email.com" /></Field>
      <div className="sm:col-span-2"><Field label="Home Address Line 1" required><TextInput value={form.homeAddress} onChange={v => update('homeAddress', v)} placeholder="Street address" /></Field></div>
      <div className="sm:col-span-2"><Field label="Home Address Line 2"><TextInput value={form.homeAddress2} onChange={v => update('homeAddress2', v)} placeholder="Apartment, suite, etc." /></Field></div>
      <Field label="City" required><TextInput value={form.city} onChange={v => update('city', v)} placeholder="City" /></Field>
      <Field label="State / Region"><TextInput value={form.stateRegion} onChange={v => update('stateRegion', v)} placeholder="State or region" /></Field>
      <Field label="Country of Residence" required><TextInput value={form.country} onChange={v => update('country', v)} placeholder="e.g. Nigeria" /></Field>
      <Field label="Postal / ZIP Code"><TextInput value={form.postalCode} onChange={v => update('postalCode', v)} placeholder="Postal code" /></Field>
    </div>
  )
}

function StepEmployment({ form, update, config }: { form: VFormData; update: (k: string, v: string | boolean) => void; config: VisaCountryConfig }) {
  const status = form.employmentStatus
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Current Employment Status" required>
            <SelectInput value={status} onChange={v => update('employmentStatus', v)}
              options={['Employed (Full-time)', 'Employed (Part-time)', 'Self-employed / Business owner', 'Student', 'Retired', 'Unemployed', 'Homemaker', 'Other']}
              placeholder="Select status" />
          </Field>
        </div>
        {(status.startsWith('Employed') || status === 'Self-employed / Business owner') && <>
          <Field label="Employer / Business Name"><TextInput value={form.employerName} onChange={v => update('employerName', v)} placeholder="Company name" /></Field>
          <Field label="Job Title"><TextInput value={form.jobTitle} onChange={v => update('jobTitle', v)} placeholder="Your role" /></Field>
          <div className="sm:col-span-2"><Field label="Employer Address"><TextInput value={form.employerAddress} onChange={v => update('employerAddress', v)} placeholder="Full company address" /></Field></div>
        </>}
        <div className="sm:col-span-2">
          <Field label="Monthly Income Range">
            <SelectInput value={form.monthlyIncome} onChange={v => update('monthlyIncome', v)}
              options={['Below $500', '$500–$1,000', '$1,000–$2,000', '$2,000–$3,500', '$3,500–$5,000', '$5,000–$10,000', 'Above $10,000', 'Prefer not to say']}
              placeholder="Select range" />
          </Field>
        </div>
      </div>
      <ExtraFields config={config} form={form} update={update} sections={['education']} />
    </div>
  )
}

function StepTravel({ form, update, config }: { form: VFormData; update: (k: string, v: string | boolean) => void; config: VisaCountryConfig }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Visa Type" required>
            <SelectInput value={form.visaType} onChange={v => update('visaType', v)} options={config.visaTypes} placeholder="Select visa type" />
          </Field>
        </div>
        <Field label="Intended Arrival Date" required><TextInput type="date" value={form.arrivalDate} onChange={v => update('arrivalDate', v)} /></Field>
        <Field label="Intended Return Date" required><TextInput type="date" value={form.returnDate} onChange={v => update('returnDate', v)} /></Field>
        <div className="sm:col-span-2">
          <Field label="Purpose of Visit" required>
            <SelectInput value={form.purposeOfVisit} onChange={v => update('purposeOfVisit', v)} options={config.purposeOptions} placeholder="Select purpose" />
          </Field>
        </div>
        <Field label="Accommodation Name"><TextInput value={form.accommodationName} onChange={v => update('accommodationName', v)} placeholder="Hotel / host name" /></Field>
        <Field label="Accommodation Address"><TextInput value={form.accommodationAddress} onChange={v => update('accommodationAddress', v)} placeholder="Full address" /></Field>
        <div className="sm:col-span-2">
          <Field label="Intended Port of Entry">
            <SelectInput value={form.portOfEntry} onChange={v => update('portOfEntry', v)} options={config.portOfEntryOptions} placeholder="Select airport / port" />
          </Field>
        </div>
      </div>
      <ExtraFields config={config} form={form} update={update} sections={['travel']} />
    </div>
  )
}

function StepHistory({ form, update }: { form: VFormData; update: (k: string, v: string | boolean) => void }) {
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
          <TextInput value={form.previousVisitDetails as string} onChange={v => update('previousVisitDetails', v)} placeholder="e.g. June 2021, 2 weeks" />
        </Field>
      )}
    </div>
  )
}

function StepBackground({ form, update, config }: { form: VFormData; update: (k: string, v: string | boolean) => void; config: VisaCountryConfig }) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">Answer honestly. Consular officers verify all background information. False declarations can result in permanent visa bans.</p>
      </div>
      <YesNoField label="Do you have a criminal record in any country?" value={form.criminalRecord} onChange={v => update('criminalRecord', v)} />
      <YesNoField label="Do you have or have you ever had a communicable disease (e.g. TB)?" value={form.communicableDisease} onChange={v => update('communicableDisease', v)} />
      <YesNoField label="Have you ever been deported or removed from any country?" value={form.deportedBefore} onChange={v => update('deportedBefore', v)} />
      <ExtraFields config={config} form={form} update={update} sections={['background', 'country']} />
    </div>
  )
}

// ─── Step 8: Documents ────────────────────────────────────────────────────────

function StepDocuments({
  appId,
  destinationIso2,
  applicantName,
  passportCountry,
}: {
  appId: string | null
  destinationIso2: string
  applicantName: string
  passportCountry: string
}) {
  const [file, setFile]         = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis]   = useState<BankStatementAnalysis | null>(null)
  const [scanned, setScanned]     = useState(false)

  const destination = destinationIso2.toLowerCase() === 'gb' ? 'uk'
    : destinationIso2.toLowerCase() === 'fr' ? 'schengen'
    : destinationIso2.toLowerCase()

  async function uploadAndAnalyze() {
    if (!file || !appId) return
    setUploading(true)
    setScanned(false)
    setAnalysis(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('uploadedBy', 'client')
    const upRes = await fetch(`/api/visa-application/${appId}/upload-bank-statement`, { method: 'POST', body: fd })
    if (!upRes.ok) { setUploading(false); return }
    const { fileUrl } = await upRes.json()
    setUploading(false)
    setAnalyzing(true)
    const anRes = await fetch('/api/analyze-bank-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: appId,
        fileUrl,
        destination,
        applicantName,
        passportCountry,
        uploadedBy: 'client',
      }),
    })
    const anData = await anRes.json()
    setAnalyzing(false)
    if (anData.scanned) { setScanned(true); return }
    if (anData.analysis) setAnalysis(anData.analysis)
    setFile(null)
  }

  const clientMsg = analysis ? {
    PASS:   { icon: '✅', title: 'Statement looks great!',  body: 'Your bank statement meets the financial requirements for your visa application. We have everything we need for this section.',                                                                          bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', body_: 'text-green-700' },
    REVIEW: { icon: '📋', title: 'Statement received',      body: 'Our team will review your bank statement and may reach out with a few questions before submitting your application.',                                                                                     bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  body_: 'text-blue-700'  },
    FLAG:   { icon: '📋', title: 'Statement received',      body: 'Our team will carefully review your bank statement and will contact you if we need any additional information or clarification before we proceed.',                                                       bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  body_: 'text-blue-700'  },
  }[analysis.status] : null

  return (
    <div className="space-y-5">
      <div className="bg-[#0B1F3A]/5 rounded-xl p-4">
        <p className="font-semibold text-[#0B1F3A] text-sm mb-1">Why do we need this?</p>
        <p className="text-gray-500 text-xs leading-relaxed">Most embassies require 3–6 months of bank statements showing stable finances. Uploading now lets our team pre-check your financials and flag any issues before submission.</p>
      </div>

      {!analysis && !scanned && (
        <>
          <label className={`flex flex-col items-center gap-2 px-4 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-gray-300'}`}>
            <Upload className="w-6 h-6 text-gray-400" />
            <div className="text-center">
              {file ? (
                <span className="text-[#C9A84C] font-semibold text-sm">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">Drop your bank statement here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">PDF only · Max 25MB · 3–6 months recommended</p>
                </>
              )}
            </div>
            <input type="file" accept="application/pdf" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
          </label>

          {file && (
            <button onClick={uploadAndAnalyze} disabled={uploading || analyzing || !appId}
              className="w-full py-3 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing statement — usually takes 15–30 seconds…</>
                : <><Upload className="w-4 h-4" /> Upload &amp; Analyze</>}
            </button>
          )}

          {(uploading || analyzing) && (
            <p className="text-xs text-center text-gray-400">Please keep this page open while we process your statement.</p>
          )}
        </>
      )}

      {scanned && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-semibold text-amber-800 text-sm mb-1">⚠️ Scanned document detected</p>
          <p className="text-xs text-amber-700 leading-relaxed mb-3">For best results, please download a digital statement directly from your bank&apos;s app or website. Scanned images can be harder for embassies to verify.</p>
          <div className="flex gap-2">
            <label className="flex-1 py-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-800 text-center cursor-pointer hover:bg-amber-50">
              Try a different file
              <input type="file" accept="application/pdf" className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setScanned(false) } }} />
            </label>
            <button onClick={() => { setScanned(false); setFile(null) }}
              className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold">
              Continue anyway
            </button>
          </div>
        </div>
      )}

      {analysis && clientMsg && (
        <div className={`rounded-xl border p-4 ${clientMsg.bg} ${clientMsg.border}`}>
          <p className={`font-bold text-sm mb-1 ${clientMsg.text}`}>{clientMsg.icon} {clientMsg.title}</p>
          <p className={`text-xs leading-relaxed ${clientMsg.body_}`}>{clientMsg.body}</p>
          {analysis.status === 'PASS' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Avg balance</p>
                <p className="text-sm font-bold text-gray-800">{analysis.currency} {analysis.averageMonthlyBalance.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Monthly income</p>
                <p className="text-sm font-bold text-gray-800">{analysis.currency} {analysis.estimatedMonthlyIncome.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!analysis && !scanned && !file && (
        <p className="text-xs text-center text-gray-400">
          Don&apos;t have your statement ready? You can continue and add it later — our team will request it before submission.
        </p>
      )}
    </div>
  )
}

// ─── Step 9: Declaration ──────────────────────────────────────────────────────

function StepDeclaration({ form, update, config, isManual }: { form: VFormData; update: (k: string, v: string | boolean) => void; config: VisaCountryConfig; isManual: boolean }) {
  const items = [
    { key: 'declarationAccurate', text: 'I confirm all information provided in this application is accurate and complete. I understand that providing false or misleading information may result in visa refusal, future bans, and legal consequences.' },
    { key: 'declarationAuthorise', text: isManual
      ? `I authorise Walz Travels Ltd to review my details and contact me to discuss visa options for ${config.name}.`
      : `I authorise Walz Travels Ltd to prepare and submit my visa application to the ${config.name} embassy or immigration authority on my behalf.` },
    { key: 'declarationFeePolicy', text: isManual
      ? 'I understand that Walz Travels will contact me within 24 hours to discuss pricing and next steps.'
      : 'I understand the Walz Travels service fee is non-refundable once my application has been prepared and submitted. Government fees are paid separately when instructed by Walz Travels.' },
  ]
  return (
    <div className="space-y-4">
      <div className="bg-[#0B1F3A] rounded-xl p-5">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-[#C9A84C] flex items-center justify-center font-bold text-[#0B1F3A] flex-shrink-0 text-sm">J</div>
          <p className="text-white/80 text-sm leading-relaxed">
            You&apos;re almost there! Please read each declaration carefully and tick all three boxes to confirm.
            {isManual ? ' Our team will review your details and contact you shortly.' : ' This is a legal authorisation for Walz Travels to act on your behalf.'}
          </p>
        </div>
      </div>
      {items.map(({ key, text }) => (
        <button key={key} type="button" onClick={() => update(key, !form[key])}
          className={cn('w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 transition-all',
            form[key] ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-gray-300')}>
          <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
            form[key] ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-gray-300')}>
            {form[key] && <CheckCircle className="w-3.5 h-3.5 text-[#0B1F3A]" />}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
        </button>
      ))}
      <p className="text-xs text-gray-400 text-center pt-2">
        All data is handled securely in accordance with our privacy policy.
      </p>
    </div>
  )
}

// ─── Auto-save ────────────────────────────────────────────────────────────────

function useAutoSave(appId: string | null, token?: string, delay = 800) {
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (patch: Partial<VFormData> & Record<string, unknown>) => {
    if (!appId) return
    setSaving(true)
    try {
      await fetch(`/api/visa-application/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { ...patch, _token: token } : patch),
      })
      setLastSaved(new Date())
    } catch { /* silent */ }
    setSaving(false)
  }, [appId, token])

  const debouncedSave = useCallback((patch: Partial<VFormData> & Record<string, unknown>) => {
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
        <span className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wider">Step {step + 1} of {total} — {STEPS[step].label}</span>
        <span className="text-xs text-gray-400">{Math.round(((step + 1) / total) * 100)}% complete</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#C9A84C] rounded-full transition-all duration-500" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between mt-3">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-all',
                i < step ? 'bg-[#C9A84C] text-[#0B1F3A]' :
                i === step ? 'bg-[#0B1F3A] text-white ring-2 ring-[#C9A84C]/30' : 'bg-gray-100 text-gray-400')}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : <StepIcon className="w-3.5 h-3.5" />}
              </div>
              <span className={cn('text-[10px] font-medium hidden sm:block',
                i === step ? 'text-[#0B1F3A]' : i < step ? 'text-[#C9A84C]' : 'text-gray-400')}>{s.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Inline confirmation ───────────────────────────────────────────────────────

function InlineConfirmation({ refNumber, email, destinationName }: { refNumber: string; email: string; destinationName: string }) {
  return (
    <div className="bg-white rounded-2xl border border-green-200 p-8 text-center shadow-sm mt-4">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="font-bold text-[#0B1F3A] text-xl mb-3">Application Received</h3>
      <p className="text-gray-600 text-sm leading-relaxed mb-4">
        Our team will contact you within 24 hours on <span className="font-semibold text-[#0B1F3A]">{email || 'your provided email'}</span> to
        discuss your <span className="font-semibold">{destinationName}</span> visa options.
      </p>
      <p className="text-xs text-gray-400 mb-6">
        Reference: <span className="font-mono font-semibold text-[#C9A84C]">{refNumber}</span>
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/portal/application" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors">
          <FileText className="w-4 h-4" /> View My Applications
        </Link>
        <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-[#0B1F3A] text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
          Chat with Jade →
        </a>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface VisaApplicationFormProps {
  destinationIso2: string
  destinationName: string
  destinationFlag?: string
  source?: string
  inline?: boolean
  adminToken?: string
  initialDraftId?: string
  feeOverride?: {
    walzFee?: number | null
    walzCurrency?: string | null
    govFee?: number | null
    govCurrency?: string | null
    govFeeNote?: string | null
  }
}

export function VisaApplicationForm({
  destinationIso2,
  destinationName,
  destinationFlag,
  source,
  inline = false,
  adminToken,
  initialDraftId,
  feeOverride,
}: VisaApplicationFormProps) {
  const router = useRouter()
  const { data: session, status: authStatus } = useSession()

  const visaConfig = getVisaConfig(destinationIso2)
  const isUnsupported = !visaConfig
  const config = visaConfig ?? makeGenericConfig(destinationName, destinationFlag ?? '🌍')
  const isManual = isUnsupported || inline
  const countrySlug = ISO2_TO_SLUG[destinationIso2] ?? destinationIso2.toLowerCase()
  const isAdminFlow = Boolean(adminToken)

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<VFormData>(EMPTY_FORM)
  const [appId, setAppId] = useState<string | null>(null)
  const [refNumber, setRefNumber] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ refNumber: string; email: string } | null>(null)
  const [draftFees, setDraftFees] = useState<{ walzFee: number; walzCurrency: string; govFee: number | null } | null>(null)

  // Family mode
  const [mode, setMode] = useState<'single' | 'family' | null>(adminToken ? 'single' : null)
  const [applicants, setApplicants] = useState<FamilyApplicant[]>([
    { id: 'lead', relationship: 'lead', firstName: '', lastName: '', dateOfBirth: '', nationality: '', passportNumber: '', passportExpiry: '', isMinor: false },
  ])
  const [familyEmail, setFamilyEmail] = useState('')
  const [familyPhone, setFamilyPhone] = useState('')
  const [familyLoading, setFamilyLoading] = useState(false)
  const [familyError, setFamilyError] = useState<string | null>(null)
  const [familyConfirmed, setFamilyConfirmed] = useState<{ referenceNumber: string; totalApplicants: number } | null>(null)

  const { debouncedSave, saving, lastSaved } = useAutoSave(appId, adminToken)

  function mapAppToForm(app: Record<string, unknown>): Partial<VFormData> {
    const f: Partial<VFormData> = {}
    for (const key of Object.keys(EMPTY_FORM)) {
      const v = app[key]
      if (v !== null && v !== undefined) {
        if (typeof EMPTY_FORM[key] === 'boolean') f[key] = Boolean(v)
        else if (key.endsWith('Date') || key === 'dateOfBirth') {
          f[key] = v ? new Date(v as string).toISOString().split('T')[0] : ''
        } else {
          f[key] = String(v ?? '')
        }
      }
    }
    if (app.countrySpecific && typeof app.countrySpecific === 'object') {
      for (const [k, v] of Object.entries(app.countrySpecific as Record<string, unknown>)) {
        f[k] = v as string | boolean
      }
    }
    return f
  }

  useEffect(() => {
    if (!destinationIso2) { setLoading(false); return }
    if (mode === null || mode === 'family') { setLoading(false); return }

    async function init() {
      setCreating(true)

      if (adminToken) {
        const tokenRes = await fetch(`/api/visa-application/verify-token?t=${adminToken}`)
        const tokenData = await tokenRes.json()
        if (!tokenData.valid) {
          setTokenError(tokenData.error ?? 'This link is invalid or has expired.')
          setCreating(false)
          setLoading(false)
          return
        }
        const app = tokenData.application
        setAppId(app.id)
        setRefNumber(app.referenceNumber)
        setForm(prev => ({ ...prev, ...mapAppToForm(app) } as VFormData))
        setCreating(false)
        setLoading(false)
        return
      }

      if (authStatus === 'loading') return

      if (initialDraftId) {
        const res = await fetch(`/api/visa-application/${initialDraftId}`)
        if (res.ok) {
          const { application: app } = await res.json()
          setAppId(app.id)
          setRefNumber(app.referenceNumber)
          setForm(prev => ({ ...prev, ...mapAppToForm(app) } as VFormData))
          if (app.serviceFeeAmount != null) {
            setDraftFees({
              walzFee:     Number(app.serviceFeeAmount),
              walzCurrency: app.serviceFeeCurrency ?? 'USD',
              govFee:      app.govtFeeAmount != null ? Number(app.govtFeeAmount) : null,
            })
          }
          setCreating(false)
          setLoading(false)
          return
        }
      }

      const res = await fetch('/api/visa-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationIso2, visaType: config.visaTypes[0] ?? 'tourist' }),
      })
      if (res.ok) {
        const { application } = await res.json()
        setAppId(application.id)
        setRefNumber(application.referenceNumber)
        const f = mapAppToForm(application)
        f.visaType = config.visaTypes[0] ?? ''
        setForm(prev => ({ ...prev, ...f } as VFormData))
        if (!inline) {
          window.history.replaceState({}, '', `/visa/apply/${countrySlug}?draft=${application.id}`)
        }
      }
      setCreating(false)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, destinationIso2, adminToken, mode])

  function update(key: string, value: string | boolean) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      const countryKeys = config.extraFields.map(f => f.key)
      const base: Partial<VFormData> = {}
      const extra: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(next)) {
        if (countryKeys.includes(k)) extra[k] = v
        else base[k] = v as string | boolean
      }
      debouncedSave({ ...base, countrySpecific: extra } as unknown as Partial<VFormData>)
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
    if (step === 8) {
      if (!form.declarationAccurate || !form.declarationAuthorise || !form.declarationFeePolicy) {
        return 'Please tick all three declarations to continue'
      }
    }
    return null
  }

  async function handleFamilySubmit(e: React.FormEvent) {
    e.preventDefault()
    setFamilyError(null)

    // Validate
    if (!familyEmail.trim()) { setFamilyError('Email address is required'); return }
    for (let i = 0; i < applicants.length; i++) {
      const a = applicants[i]
      if (!a.firstName.trim() || !a.lastName.trim()) {
        setFamilyError(`Please fill in first and last name for applicant ${i + 1}`)
        return
      }
      if (!a.isMinor && !a.passportNumber.trim()) {
        setFamilyError(`Passport number is required for ${a.firstName || `applicant ${i + 1}`}`)
        return
      }
    }

    setFamilyLoading(true)
    try {
      const res = await fetch('/api/visa-application/family', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          visaType:       form.visaType || config.visaTypes[0] || 'tourist',
          destinationIso2,
          contactEmail:   familyEmail.trim(),
          contactPhone:   familyPhone.trim(),
          applicants,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit')
      setFamilyConfirmed({ referenceNumber: data.referenceNumber, totalApplicants: data.totalApplicants })
    } catch (err) {
      setFamilyError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setFamilyLoading(false)
    }
  }

  function updateApplicant(index: number, key: keyof FamilyApplicant, value: string | boolean) {
    setApplicants(prev => prev.map((a, i) => i === index ? { ...a, [key]: value } : a))
  }

  async function goNext() {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    // For manual/admin flows, submit at Declaration (step before Payment)
    const isDeclaration = step === STEPS.length - 2
    if (step < STEPS.length - 1 && !(isDeclaration && (isAdminFlow || isManual))) {
      setStep(s => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // Submit (manual/admin at Declaration, or last step reached for any flow)
    if (isAdminFlow && appId && adminToken) {
      setSubmitting(true)
      const res = await fetch(`/api/visa-application/${appId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminToken }),
      })
      if (res.ok) {
        const { referenceNumber } = await res.json()
        const name = encodeURIComponent([form.firstName, form.lastName].filter(Boolean).join(' '))
        router.push(`/visa/apply/confirmation?ref=${referenceNumber}&name=${name}`)
      } else {
        const d = await res.json()
        setError(d.error ?? 'Submission failed. Please try again.')
      }
      setSubmitting(false)
    } else if (isManual && appId) {
      setSubmitting(true)
      const res = await fetch(`/api/visa-application/${appId}/client-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source ?? 'unsupported_destination' }),
      })
      if (res.ok) {
        const { referenceNumber } = await res.json()
        setConfirmed({ refNumber: referenceNumber, email: form.email })
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const d = await res.json()
        setError(d.error ?? 'Submission failed. Please try again.')
      }
      setSubmitting(false)
    } else {
      if (appId) router.push(`/visa/apply/${countrySlug}/payment?id=${appId}`)
    }
  }

  function goBack() {
    setError(null)
    if (step > 0) { setStep(s => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  // ── Mode selector ──────────────────────────────────────────────────────────
  if (mode === null) {
    return (
      <div className={inline ? '' : 'min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4'}>
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-xl bg-[#0B1F3A] flex items-center justify-center mx-auto mb-4">
                <Globe className="w-6 h-6 text-[#C9A84C]" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                {destinationName} Visa Application
                {destinationFlag && <span className="ml-2">{destinationFlag}</span>}
              </h2>
              <p className="text-gray-500 text-sm mt-1">Who are you applying for?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('single')}
                className="border-2 border-gray-200 rounded-2xl p-5 text-left hover:border-[#C9A84C] hover:bg-amber-50 transition-all group"
              >
                <div className="text-2xl mb-3">👤</div>
                <p className="font-semibold text-[#0B1F3A] text-sm group-hover:text-[#8B6914]">Just me</p>
                <p className="text-gray-400 text-xs mt-1">Single applicant — detailed form</p>
              </button>
              <button
                onClick={() => setMode('family')}
                className="border-2 border-gray-200 rounded-2xl p-5 text-left hover:border-[#C9A84C] hover:bg-amber-50 transition-all group"
              >
                <div className="text-2xl mb-3">👨‍👩‍👧‍👦</div>
                <p className="font-semibold text-[#0B1F3A] text-sm group-hover:text-[#8B6914]">Family / Group</p>
                <p className="text-gray-400 text-xs mt-1">Multiple applicants together</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Family confirmed ────────────────────────────────────────────────────────
  if (familyConfirmed) {
    return (
      <div className={inline ? '' : 'min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4'}>
        <div className="max-w-lg w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#0B1F3A] mb-2">Family Application Submitted!</h2>
          <p className="text-gray-500 text-sm mb-6">
            We received your application for {familyConfirmed.totalApplicants} applicant{familyConfirmed.totalApplicants > 1 ? 's' : ''}.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-500 mb-1">Family reference number</p>
            <p className="font-bold text-[#0B1F3A] text-lg tracking-wide">{familyConfirmed.referenceNumber}</p>
          </div>
          <p className="text-xs text-gray-400 mb-6">
            Our team will review and contact you within 24 hours with document requirements for each applicant.
          </p>
          <a href="https://wa.me/12317902336"
             className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm">
            Contact Walz Travels on WhatsApp
          </a>
        </div>
      </div>
    )
  }

  // ── Family form ─────────────────────────────────────────────────────────────
  if (mode === 'family') {
    return (
      <div className={inline ? '' : 'min-h-screen bg-[#F4F6F9] px-4 py-8'}>
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setMode(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
                <User className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <div>
                <h2 className="font-bold text-[#0B1F3A] text-lg">Family Visa Application</h2>
                <p className="text-gray-400 text-xs">{destinationName}{destinationFlag ? ` ${destinationFlag}` : ''} · {applicants.length} applicant{applicants.length > 1 ? 's' : ''}</p>
              </div>
            </div>

            <form onSubmit={handleFamilySubmit} className="space-y-5">
              {/* Contact details */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="email" required placeholder="Email address *"
                    value={familyEmail} onChange={e => setFamilyEmail(e.target.value)}
                    className="col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  <input
                    type="tel" placeholder="Phone / WhatsApp"
                    value={familyPhone} onChange={e => setFamilyPhone(e.target.value)}
                    className="col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>

              {/* Applicant sections */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Applicants</p>
                {applicants.map((applicant, index) => (
                  <div key={applicant.id} className="border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold rounded-full flex items-center justify-center">
                          {index + 1}
                        </span>
                        <h3 className="font-semibold text-gray-900 text-sm">
                          {index === 0 ? 'Lead Applicant (You)' :
                           applicant.relationship === 'spouse' ? 'Spouse / Partner' :
                           applicant.relationship === 'child' ? 'Child' :
                           applicant.relationship === 'parent' ? 'Parent' :
                           applicant.relationship === 'sibling' ? 'Sibling' : `Applicant ${index + 1}`}
                        </h3>
                      </div>
                      {index > 0 && (
                        <button type="button" onClick={() => setApplicants(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">
                          Remove
                        </button>
                      )}
                    </div>

                    {index > 0 && (
                      <div className="mb-3">
                        <select
                          value={applicant.relationship}
                          onChange={e => {
                            const rel = e.target.value
                            updateApplicant(index, 'relationship', rel)
                            updateApplicant(index, 'isMinor', rel === 'child')
                          }}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        >
                          <option value="spouse">Spouse / Partner</option>
                          <option value="child">Child (under 18)</option>
                          <option value="parent">Parent</option>
                          <option value="sibling">Sibling</option>
                          <option value="other">Other family member</option>
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      <input placeholder="First name *" value={applicant.firstName}
                        onChange={e => updateApplicant(index, 'firstName', e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      <input placeholder="Last name *" value={applicant.lastName}
                        onChange={e => updateApplicant(index, 'lastName', e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      <input placeholder="Date of birth" type="date" value={applicant.dateOfBirth}
                        onChange={e => updateApplicant(index, 'dateOfBirth', e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      <input placeholder="Nationality *" value={applicant.nationality}
                        onChange={e => updateApplicant(index, 'nationality', e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      <input
                        placeholder={applicant.isMinor ? 'Passport number (if applicable)' : 'Passport number *'}
                        value={applicant.passportNumber}
                        onChange={e => updateApplicant(index, 'passportNumber', e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      <input
                        placeholder={applicant.isMinor ? 'Passport expiry (if applicable)' : 'Passport expiry *'}
                        type="date" value={applicant.passportExpiry}
                        onChange={e => updateApplicant(index, 'passportExpiry', e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                    {applicant.isMinor && (
                      <p className="text-xs text-amber-700 mt-2.5 bg-amber-50 px-3 py-2 rounded-lg">
                        Children under 16 may travel on a parent&apos;s passport — our team will advise on the correct route.
                      </p>
                    )}
                  </div>
                ))}

                {applicants.length < 10 && (
                  <button type="button"
                    onClick={() => setApplicants(prev => [...prev, {
                      id: `a-${Date.now()}`, relationship: 'spouse',
                      firstName: '', lastName: '', dateOfBirth: '',
                      nationality: '', passportNumber: '', passportExpiry: '', isMinor: false,
                    }])}
                    className="w-full py-3 border-2 border-dashed border-amber-300 rounded-2xl text-amber-600 text-sm font-medium hover:border-amber-400 hover:bg-amber-50 transition-colors">
                    + Add another family member
                  </button>
                )}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm">
                <p className="font-medium text-gray-700 mb-2">
                  {applicants.length} applicant{applicants.length > 1 ? 's' : ''} · {destinationName} visa
                </p>
                <ul className="space-y-0.5">
                  {applicants.map((a, i) => (
                    <li key={a.id} className="text-gray-500 text-xs">
                      {i + 1}. {a.firstName || 'Unnamed'} {a.lastName} — {i === 0 ? 'Lead' : a.relationship}{a.isMinor ? ' (minor)' : ''}
                    </li>
                  ))}
                </ul>
              </div>

              {familyError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {familyError}
                </div>
              )}

              <button type="submit" disabled={familyLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm hover:brightness-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {familyLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  : <><CheckCircle className="w-4 h-4" /> Submit Family Application</>}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Token error ────────────────────────────────────────────────────────────
  if (tokenError) {
    return (
      <div className={inline ? 'py-6' : 'min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4'}>
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-sm border border-gray-100 mx-auto">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="font-bold text-[#0B1F3A] text-xl mb-2">Link Invalid or Expired</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">{tokenError}</p>
          <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm">
            Contact Walz Travels on WhatsApp
          </a>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading || creating || (!adminToken && authStatus === 'loading')) {
    return (
      <div className={inline ? 'py-8 flex items-center justify-center' : 'min-h-screen bg-[#F4F6F9] flex items-center justify-center'}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Preparing your application…</p>
        </div>
      </div>
    )
  }

  // ── Inline confirmed ───────────────────────────────────────────────────────
  if (confirmed && inline) {
    return <InlineConfirmation refNumber={confirmed.refNumber} email={confirmed.email} destinationName={destinationName} />
  }

  // ── Full-page confirmed (non-inline manual flow) ───────────────────────────
  if (confirmed && !inline) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <InlineConfirmation refNumber={confirmed.refNumber} email={confirmed.email} destinationName={destinationName} />
        </div>
      </div>
    )
  }

  // ── Form card body ─────────────────────────────────────────────────────────
  const formCard = (
    <div className={inline ? '' : 'max-w-2xl mx-auto px-4 py-8'}>
      <ProgressBar step={step} total={STEPS.length} />

      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
          {(() => { const S = STEPS[step].icon; return <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center"><S className="w-5 h-5 text-[#C9A84C]" /></div> })()}
          <div>
            <h2 className="font-bold text-[#0B1F3A] text-lg">{STEPS[step].label}</h2>
            <p className="text-gray-400 text-xs">Step {step + 1} of {STEPS.length}</p>
          </div>
          {saving && <Loader2 className="w-4 h-4 text-[#C9A84C] animate-spin ml-auto" />}
        </div>

        {!session && step > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 mb-4">
            <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <button onClick={() => signIn()} className="font-bold underline">Sign in</button>
              {' '}to save your progress and track your application.
            </span>
          </div>
        )}

        {step === 0 && <StepPersonal form={form} update={update} config={config} />}
        {step === 1 && <StepPassport form={form} update={update} />}
        {step === 2 && <StepContact form={form} update={update} />}
        {step === 3 && <StepEmployment form={form} update={update} config={config} />}
        {step === 4 && <StepTravel form={form} update={update} config={config} />}
        {step === 5 && <StepHistory form={form} update={update} />}
        {step === 6 && <StepBackground form={form} update={update} config={config} />}
        {step === 7 && (
          <StepDocuments
            appId={appId}
            destinationIso2={destinationIso2}
            applicantName={[form.firstName, form.lastName].filter(Boolean).join(' ') || 'Applicant'}
            passportCountry={form.nationality || form.country || 'Nigeria'}
          />
        )}
        {step === 8 && <StepDeclaration form={form} update={update} config={config} isManual={isManual} />}
        {step === 9 && (
          <PaymentStep
            applicationId={appId}
            feeGbp={config.serviceFeeUsd ?? 150}
            destName={destinationName}
            onSkip={() => router.push(`/visa/payment/success?ref=${refNumber ?? ''}`)}
          />
        )}

        {error && (
          <div className="mt-5 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100">
          <button onClick={goBack} disabled={step === 0}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-30 transition-all">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-center">
            <p className="text-xs text-gray-400">{saving ? '⏳ Saving…' : '✓ Progress saved automatically'}</p>
          </div>
          {/* Hide Next button at Payment step for standard flow — PaymentStep has its own button */}
          {!(step === STEPS.length - 1 && !isManual && !isAdminFlow) && (
            <button onClick={goNext} disabled={saving || submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              ) : (isManual || isAdminFlow) && step === STEPS.length - 2 ? (
                <><CheckCircle className="w-4 h-4" /> Submit Application</>
              ) : (
                <>Next <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Jade tip */}
      <div className="mt-4 bg-[#0B1F3A] rounded-xl p-4 flex gap-3">
        <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">J</div>
        <p className="text-white/70 text-xs leading-relaxed">
          {isManual
            ? 'Your details are saved automatically. Our visa team will review everything and contact you within 24 hours to discuss your options and next steps.'
            : 'Your progress is saved automatically after every field. You can close this page and return any time — just use the same link or find it in your portal.'}
        </p>
      </div>

      {/* Fee summary — only shown when admin explicitly set fees on this draft */}
      {!inline && draftFees != null && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#0B1F3A] text-sm">Fee Summary</h3>
            <span className="text-xs text-gray-400">{config.flag} {config.name}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Walz Travels Service Fee</span>
              <span className="font-bold text-[#0B1F3A]">{draftFees.walzCurrency} {Number(draftFees.walzFee).toLocaleString()}</span>
            </div>
            {draftFees.govFee != null && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Government Fee (paid later)</span>
                <span className="text-gray-500">USD {Number(draftFees.govFee).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  // ── Inline mode: just the form card ───────────────────────────────────────
  if (inline) return formCard

  // ── Full-page mode ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {isAdminFlow && (
        <div className="bg-[#C9A84C] px-4 py-2.5">
          <div className="max-w-2xl mx-auto flex items-center gap-2 text-sm text-[#0B1F3A]">
            <span className="font-bold">📋 Walz Travels Application Form</span>
            <span className="opacity-70">— Review all fields, then click Submit. No payment required.</span>
          </div>
        </div>
      )}

      <div className="bg-[#0B1F3A] px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {!isAdminFlow && (
            <Link href="/visa" className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm mb-4 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Visa Services
            </Link>
          )}
          <div className="flex items-center gap-4">
            <span className="text-4xl">{config.flag}</span>
            <div>
              <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-wider">
                {isUnsupported ? 'Manual Application' : 'Visa Application'}
              </p>
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

      {formCard}
    </div>
  )
}
