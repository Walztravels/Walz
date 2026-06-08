'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Mail, Phone, Globe, MapPin, Briefcase, Plane,
  Calendar, Users, FileText, CheckCircle, Loader2, AlertCircle, ArrowLeft, Send,
} from 'lucide-react'

const SERVICES = [
  'UK Visa', 'Canada Visa', 'UAE Visa', 'Schengen Visa', 'USA Visa',
  'Tour Booking', 'Flight Booking', 'Holiday Package', 'Group Travel',
]

const NATIONALITIES = [
  'Nigerian', 'Ghanaian', 'Kenyan', 'South African', 'British', 'American',
  'Canadian', 'Indian', 'Pakistani', 'Bangladeshi', 'Philippine', 'Jamaican',
  'Trinidadian', 'Barbadian', 'Guyanese', 'Sierra Leonean', 'Ugandan',
  'Tanzanian', 'Zimbabwean', 'Ethiopian', 'Other',
]

const COUNTRIES = [
  'United Kingdom', 'United States', 'Canada', 'Nigeria', 'Ghana', 'Kenya',
  'South Africa', 'India', 'Pakistan', 'Bangladesh', 'Philippines', 'Jamaica',
  'Trinidad and Tobago', 'Barbados', 'Guyana', 'Sierra Leone', 'Uganda',
  'Tanzania', 'Zimbabwe', 'Ethiopia', 'UAE', 'Ireland', 'Australia', 'Other',
]

interface FormState {
  name: string
  email: string
  whatsapp: string
  nationality: string
  countryOfResidence: string
  service: string
  destination: string
  travelDate: string
  numberOfApplicants: string
  notes: string
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT = 'w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 bg-white transition-colors'
const SELECT = `${INPUT} cursor-pointer`
const TEXTAREA = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 bg-white resize-none transition-colors'

export default function NewClientPage() {
  const router = useRouter()

  const [form, setForm] = useState<FormState>({
    name: '', email: '', whatsapp: '', nationality: '', countryOfResidence: '',
    service: '', destination: '', travelDate: '', numberOfApplicants: '1', notes: '',
  })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  function update(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  async function submit(sendPortalLink: boolean) {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Full name and email are required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sendPortalLink }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Something went wrong')
        return
      }
      setSuccess(
        sendPortalLink
          ? `Client created and portal link emailed to ${form.email}`
          : `Client created. Temporary password: ${d.tempPassword}`
      )
      setTimeout(() => router.push('/admin/clients'), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">

      {/* Back link */}
      <div className="mb-5">
        <Link href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Clients
        </Link>
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-5 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 font-medium">{success}</p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Form card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Section: Contact */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
              <User className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wider">Contact Details</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Full Name" required>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={form.name} onChange={e => update('name', e.target.value)}
                    placeholder="Jane Smith" className={`${INPUT} pl-9`} />
                </div>
              </Field>
            </div>
            <Field label="Email Address" required>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
                  placeholder="jane@example.com" className={`${INPUT} pl-9`} />
              </div>
            </Field>
            <Field label="WhatsApp Number">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={form.whatsapp} onChange={e => update('whatsapp', e.target.value)}
                  placeholder="+44 7000 000000" className={`${INPUT} pl-9`} />
              </div>
            </Field>
          </div>
        </div>

        {/* Section: Background */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
              <Globe className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wider">Background</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Passport Nationality">
              <select value={form.nationality} onChange={e => update('nationality', e.target.value)} className={SELECT}>
                <option value="">Select nationality…</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Country of Residence">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select value={form.countryOfResidence} onChange={e => update('countryOfResidence', e.target.value)}
                  className={`${SELECT} pl-9`}>
                  <option value="">Select country…</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </Field>
          </div>
        </div>

        {/* Section: Service */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wider">Service Required</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Service Needed">
              <select value={form.service} onChange={e => update('service', e.target.value)} className={SELECT}>
                <option value="">Select service…</option>
                {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Destination">
              <div className="relative">
                <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={form.destination} onChange={e => update('destination', e.target.value)}
                  placeholder="e.g. United Kingdom" className={`${INPUT} pl-9`} />
              </div>
            </Field>
            <Field label="Travel Date">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="date" value={form.travelDate} onChange={e => update('travelDate', e.target.value)}
                  className={`${INPUT} pl-9`} />
              </div>
            </Field>
            <Field label="Number of Applicants">
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="number" min="1" max="50" value={form.numberOfApplicants}
                  onChange={e => update('numberOfApplicants', e.target.value)}
                  className={`${INPUT} pl-9`} />
              </div>
            </Field>
          </div>
        </div>

        {/* Section: Notes */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wider">Notes</h2>
          </div>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
            rows={4} placeholder="Any additional notes about this client or their requirements…"
            className={TEXTAREA} />
        </div>

        {/* Actions */}
        <div className="px-6 py-5 bg-gray-50 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <Link href="/admin/clients"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Cancel
          </Link>
          <div className="flex gap-3 w-full sm:w-auto">
            <button onClick={() => submit(false)} disabled={saving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 border border-[#0B1F3A] text-[#0B1F3A] font-semibold text-sm rounded-xl hover:bg-[#0B1F3A] hover:text-white transition-all disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save Only
            </button>
            <button onClick={() => submit(true)} disabled={saving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Save & Send Portal Link
            </button>
          </div>
        </div>

      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        A temporary password will be auto-generated. "Save & Send Portal Link" emails the client their login details.
      </p>
    </div>
  )
}
