'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { format, differenceInMonths, isValid } from 'date-fns'
import {
  Shield, ChevronRight, ChevronLeft, Check, AlertTriangle,
  User, BookOpen, MapPin, Briefcase, Globe, Loader2,
  Edit, Trash2, Lock, Star,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface VaultData {
  givenNames?: string; surname?: string; sex?: string
  dateOfBirth?: string; placeOfBirth?: string; nationality?: string
  passportIso2?: string; dualNationality?: string
  passportNumber?: string; passportType?: string
  issueDate?: string; expiryDate?: string; issuingAuthority?: string
  employmentStatus?: string; employerName?: string; jobTitle?: string; incomeRange?: string
  phone?: string; homeAddress?: string; city?: string
  stateRegion?: string; country?: string; postalCode?: string
  criminalRecord?: boolean; priorVisaDenial?: boolean; priorVisaDenialDetails?: string
  travelHistory?: TravelEntry[]
  emergencyContactName?: string; emergencyContactPhone?: string
  isSetupComplete?: boolean
}

interface TravelEntry { country: string; year: string }

const STEPS = [
  { id: 1, title: 'Personal Details',  icon: User      },
  { id: 2, title: 'Passport Details',  icon: BookOpen  },
  { id: 3, title: 'Contact & Address', icon: MapPin    },
  { id: 4, title: 'Employment',        icon: Briefcase },
  { id: 5, title: 'Travel History',    icon: Globe     },
]

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            s.id < step ? 'bg-[#C9A84C] text-[#0B1F3A]' :
            s.id === step ? 'bg-[#0B1F3A] text-white ring-2 ring-[#C9A84C]/40' :
            'bg-gray-100 text-gray-400'
          }`}>
            {s.id < step ? <Check className="w-4 h-4" /> : s.id}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 mx-1 ${s.id < step ? 'bg-[#C9A84C]' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

const INPUT = 'w-full h-11 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all'
const SELECT = INPUT + ' bg-white'

export default function PassportVaultPage() {
  const { data: session } = useSession()
  const [step,    setStep]    = useState(1)
  const [vault,   setVault]   = useState<VaultData>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [travel,  setTravel]  = useState<TravelEntry[]>([{ country: '', year: '' }])
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    fetch('/api/passport-vault')
      .then(r => r.json())
      .then(d => {
        if (d.vault) {
          setVault(d.vault)
          setTravel(d.vault.travelHistory?.length ? d.vault.travelHistory : [{ country: '', year: '' }])
          if (d.vault.isSetupComplete) setDone(true)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function save(isComplete = false) {
    setSaving(true)
    const payload = {
      ...vault,
      travelHistory: travel.filter(t => t.country),
      isSetupComplete: isComplete,
    }
    await fetch('/api/passport-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (isComplete) setDone(true)
  }

  async function handleNext() {
    await save(false)
    if (step < 5) setStep(s => s + 1)
    else { await save(true) }
  }

  function set(k: keyof VaultData, v: unknown) {
    setVault(prev => ({ ...prev, [k]: v }))
  }

  // ── Vault complete display ────────────────────────────────────────────────
  if (done && !editMode) {
    const expiry = vault.expiryDate ? new Date(vault.expiryDate) : null
    const monthsLeft = expiry ? differenceInMonths(expiry, new Date()) : null
    const expiringSoon = monthsLeft !== null && monthsLeft < 6

    return (
      <div className="min-h-screen bg-[#F4F6F9] px-4 py-8">
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-[#0B1F3A] mb-1">Passport Vault</h1>
            <p className="text-gray-400 text-sm mb-6">Your travel identity — secure and private</p>

            <div className="space-y-3 text-left mb-6">
              {vault.givenNames && (
                <div className="flex justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Full Name</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{vault.givenNames} {vault.surname}</span>
                </div>
              )}
              {vault.passportNumber && (
                <div className="flex justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Passport</span>
                  <span className="text-sm font-semibold text-[#0B1F3A] font-mono">
                    {vault.passportNumber.replace(/./g, (c, i) => i < vault.passportNumber!.length - 3 ? '•' : c)}
                  </span>
                </div>
              )}
              {vault.nationality && (
                <div className="flex justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Nationality</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{vault.nationality}</span>
                </div>
              )}
              {expiry && isValid(expiry) && (
                <div className={`flex justify-between py-2.5 border-b ${expiringSoon ? 'border-red-100' : 'border-gray-50'}`}>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Expiry</span>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${expiringSoon ? 'text-red-600' : 'text-[#0B1F3A]'}`}>
                      {format(expiry, 'd MMM yyyy')}
                    </span>
                    {expiringSoon && (
                      <p className="text-xs text-red-500 flex items-center justify-end gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        Expires in {monthsLeft} months — renew soon
                      </p>
                    )}
                  </div>
                </div>
              )}
              {vault.employerName && (
                <div className="flex justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Employer</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{vault.employerName}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setEditMode(true); setStep(1) }}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-sm font-semibold text-[#0B1F3A] rounded-xl hover:bg-gray-50 transition-colors">
                <Edit className="w-4 h-4" />
                Edit Vault
              </button>
              <Link href="/portal/dashboard"
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#0d2345] transition-colors">
                Dashboard →
              </Link>
            </div>
          </div>

          {/* Security notice */}
          <div className="bg-[#0B1F3A] rounded-xl p-4 flex items-start gap-3 mb-6">
            <Lock className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" />
            <p className="text-white/60 text-xs leading-relaxed">
              Your data is encrypted and secure. Only you can see your passport details.
              Walz Travels cannot read your passport number. Your vault is used only to pre-fill visa application forms for your convenience.
            </p>
          </div>

          {/* Vault Pro upsell */}
          <div className="bg-gradient-to-br from-[#C9A84C] to-[#e8c97a] rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <Star className="w-5 h-5 text-[#0B1F3A] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-[#0B1F3A] text-base">Vault Pro — $4.99/month</h3>
                <p className="text-[#0B1F3A]/70 text-xs mt-0.5">For frequent travellers and families</p>
              </div>
            </div>
            <ul className="space-y-2 mb-5">
              {[
                'Add up to 5 family member passports',
                'Priority advisory alerts via email',
                'Embassy appointment booking support',
                'All forms pre-filled for every family member',
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#0B1F3A]">
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="block text-center py-3 bg-[#0B1F3A] text-white font-bold text-sm rounded-xl hover:bg-[#0d2345] transition-colors">
              Upgrade to Vault Pro →
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Setup Wizard ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  const currentStep = STEPS[step - 1]

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-4 py-8 pb-24">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full text-[#C9A84C] text-xs font-semibold mb-4">
            <Shield className="w-3.5 h-3.5" />
            Passport Vault Setup
          </div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Step {step} of {STEPS.length}</h1>
          <p className="text-gray-400 text-sm mt-1">{currentStep.title}</p>
        </div>

        <StepIndicator step={step} total={STEPS.length} />

        {/* Security badge */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-100 rounded-xl mb-6">
          <Lock className="w-4 h-4 text-green-500 flex-shrink-0" />
          <p className="text-xs text-gray-500">
            Your data is encrypted and secure. Only you can see your passport details. Walz cannot read your passport number.
          </p>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 space-y-5">

          {/* STEP 1 — Personal */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="First / Given Names" required>
                  <input className={INPUT} value={vault.givenNames || ''} onChange={e => set('givenNames', e.target.value)} placeholder="e.g. Amara Joy" />
                </Field>
                <Field label="Surname" required>
                  <input className={INPUT} value={vault.surname || ''} onChange={e => set('surname', e.target.value)} placeholder="e.g. Okafor" />
                </Field>
              </div>
              <Field label="Date of Birth" required>
                <input type="date" className={INPUT} value={vault.dateOfBirth?.split('T')[0] || ''}
                  onChange={e => set('dateOfBirth', e.target.value)} max={new Date().toISOString().split('T')[0]} />
              </Field>
              <Field label="Sex">
                <select className={SELECT} value={vault.sex || ''} onChange={e => set('sex', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </Field>
              <Field label="Place of Birth" hint="City and country where you were born">
                <input className={INPUT} value={vault.placeOfBirth || ''} onChange={e => set('placeOfBirth', e.target.value)} placeholder="e.g. Lagos, Nigeria" />
              </Field>
              <Field label="Nationality">
                <input className={INPUT} value={vault.nationality || ''} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Nigerian" />
              </Field>
            </>
          )}

          {/* STEP 2 — Passport */}
          {step === 2 && (
            <>
              <Field label="Passport Number" required>
                <input className={INPUT} value={vault.passportNumber || ''} onChange={e => set('passportNumber', e.target.value)} placeholder="A12345678" />
              </Field>
              <Field label="Passport Type">
                <select className={SELECT} value={vault.passportType || 'ordinary'} onChange={e => set('passportType', e.target.value)}>
                  <option value="ordinary">Ordinary</option>
                  <option value="official">Official / Service</option>
                  <option value="diplomatic">Diplomatic</option>
                </select>
              </Field>
              <Field label="Issuing Country (ISO2)">
                <input className={INPUT} value={vault.passportIso2 || ''} onChange={e => set('passportIso2', e.target.value.toUpperCase())}
                  placeholder="NG" maxLength={2} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Issue Date">
                  <input type="date" className={INPUT} value={vault.issueDate?.split('T')[0] || ''}
                    onChange={e => set('issueDate', e.target.value)} max={new Date().toISOString().split('T')[0]} />
                </Field>
                <Field label="Expiry Date" required>
                  <input type="date" className={INPUT} value={vault.expiryDate?.split('T')[0] || ''}
                    onChange={e => set('expiryDate', e.target.value)} />
                </Field>
              </div>
              {vault.expiryDate && (() => {
                const exp = new Date(vault.expiryDate)
                const months = differenceInMonths(exp, new Date())
                if (months < 6) return (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Passport expires in {months} months. Many countries require at least 6 months validity. Consider renewing before applying for any visa.</span>
                  </div>
                )
                return null
              })()}
              <Field label="Issuing Authority" hint="Who issued the passport (e.g. NIS, Nigerian Immigration Service)">
                <input className={INPUT} value={vault.issuingAuthority || ''} onChange={e => set('issuingAuthority', e.target.value)}
                  placeholder="e.g. Nigerian Immigration Service" />
              </Field>
              <Field label="Dual Nationality (if any)">
                <input className={INPUT} value={vault.dualNationality || ''} onChange={e => set('dualNationality', e.target.value)}
                  placeholder="e.g. British (if applicable)" />
              </Field>
            </>
          )}

          {/* STEP 3 — Contact */}
          {step === 3 && (
            <>
              <Field label="Phone Number">
                <input className={INPUT} type="tel" value={vault.phone || ''} onChange={e => set('phone', e.target.value)}
                  placeholder="+234 800 000 0000" />
              </Field>
              <Field label="Home Address">
                <input className={INPUT} value={vault.homeAddress || ''} onChange={e => set('homeAddress', e.target.value)}
                  placeholder="House no. and street" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <input className={INPUT} value={vault.city || ''} onChange={e => set('city', e.target.value)} placeholder="e.g. Lagos" />
                </Field>
                <Field label="State / Region">
                  <input className={INPUT} value={vault.stateRegion || ''} onChange={e => set('stateRegion', e.target.value)} placeholder="e.g. Lagos State" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Country">
                  <input className={INPUT} value={vault.country || ''} onChange={e => set('country', e.target.value)} placeholder="e.g. Nigeria" />
                </Field>
                <Field label="Postal Code">
                  <input className={INPUT} value={vault.postalCode || ''} onChange={e => set('postalCode', e.target.value)} placeholder="e.g. 100001" />
                </Field>
              </div>
            </>
          )}

          {/* STEP 4 — Employment */}
          {step === 4 && (
            <>
              <Field label="Employment Status" required>
                <select className={SELECT} value={vault.employmentStatus || ''} onChange={e => set('employmentStatus', e.target.value)}>
                  <option value="">Select status…</option>
                  <option value="Employed">Employed (full-time)</option>
                  <option value="Employed part-time">Employed (part-time)</option>
                  <option value="Self-employed">Self-employed</option>
                  <option value="Business owner">Business Owner</option>
                  <option value="Student">Student</option>
                  <option value="Retired">Retired</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              {['Employed','Employed part-time','Self-employed','Business owner'].includes(vault.employmentStatus || '') && (
                <>
                  <Field label="Employer / Business Name">
                    <input className={INPUT} value={vault.employerName || ''} onChange={e => set('employerName', e.target.value)}
                      placeholder="Company or business name" />
                  </Field>
                  <Field label="Job Title">
                    <input className={INPUT} value={vault.jobTitle || ''} onChange={e => set('jobTitle', e.target.value)}
                      placeholder="e.g. Senior Software Engineer" />
                  </Field>
                </>
              )}
              <Field label="Monthly Income Range" hint="Used to help determine visa eligibility">
                <select className={SELECT} value={vault.incomeRange || ''} onChange={e => set('incomeRange', e.target.value)}>
                  <option value="">Select range…</option>
                  <option value="Below ₦300k">Below ₦300,000</option>
                  <option value="₦300k–₦700k">₦300,000 – ₦700,000</option>
                  <option value="₦700k–₦2M">₦700,000 – ₦2,000,000</option>
                  <option value="Above ₦2M">Above ₦2,000,000</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </Field>
            </>
          )}

          {/* STEP 5 — Travel History */}
          {step === 5 && (
            <>
              <Field label="Prior Visa Denial?" required>
                <div className="flex gap-3">
                  {['No', 'Yes'].map(opt => (
                    <button key={opt} type="button"
                      onClick={() => set('priorVisaDenial', opt === 'Yes')}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                        (vault.priorVisaDenial ? 'Yes' : 'No') === opt
                          ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </Field>
              {vault.priorVisaDenial && (
                <Field label="Which country and when?">
                  <input className={INPUT} value={vault.priorVisaDenialDetails || ''} onChange={e => set('priorVisaDenialDetails', e.target.value)}
                    placeholder="e.g. UK visa denied in 2022 due to bank statement" />
                </Field>
              )}
              <Field label="Countries Visited in the Last 10 Years" hint="Add all countries — helps strengthen your application">
                <div className="space-y-2">
                  {travel.map((entry, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={INPUT + ' flex-1'} value={entry.country} placeholder="Country name"
                        onChange={e => setTravel(t => t.map((x, j) => j === i ? { ...x, country: e.target.value } : x))} />
                      <input className={INPUT + ' w-24'} value={entry.year} placeholder="Year" maxLength={4}
                        onChange={e => setTravel(t => t.map((x, j) => j === i ? { ...x, year: e.target.value } : x))} />
                      {travel.length > 1 && (
                        <button type="button" onClick={() => setTravel(t => t.filter((_, j) => j !== i))}
                          className="px-3 border border-red-200 text-red-500 rounded-xl hover:bg-red-50">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setTravel(t => [...t, { country: '', year: '' }])}
                    className="text-sm text-[#C9A84C] font-semibold hover:underline">
                    + Add country
                  </button>
                </div>
              </Field>
              <Field label="Emergency Contact Name">
                <input className={INPUT} value={vault.emergencyContactName || ''} onChange={e => set('emergencyContactName', e.target.value)}
                  placeholder="Full name" />
              </Field>
              <Field label="Emergency Contact Phone">
                <input className={INPUT} type="tel" value={vault.emergencyContactPhone || ''} onChange={e => set('emergencyContactPhone', e.target.value)}
                  placeholder="+234 800 000 0000" />
              </Field>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 px-5 py-3 border border-gray-200 text-sm font-semibold text-[#0B1F3A] rounded-xl hover:bg-gray-50 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {step < 5 ? (
              <><span>Save & Continue</span><ChevronRight className="w-4 h-4" /></>
            ) : (
              <span>Complete Setup ✓</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
