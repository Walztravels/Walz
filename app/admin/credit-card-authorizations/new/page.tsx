'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SERVICE_TYPES = [
  'Flight Ticket', 'Hotel Stay', 'Visa Application', 'Travel Package', 'Airport Transfer',
  'Travel Insurance', 'Tour / Activity', 'Car Rental', 'Cruise', 'Rail Pass', 'Other',
]

const PERMITTED_CHARGE_OPTIONS = [
  'Flight Ticket', 'Hotel Accommodation', 'Visa Fees', 'Travel Insurance', 'Transfer',
  'Tour / Activity', 'Service Fee', 'Ancillary Services', 'Upgrade', 'Other',
]

const CURRENCIES = [
  { code: 'gbp', label: 'GBP – British Pound' },
  { code: 'usd', label: 'USD – US Dollar' },
  { code: 'eur', label: 'EUR – Euro' },
  { code: 'aed', label: 'AED – UAE Dirham' },
  { code: 'ngn', label: 'NGN – Nigerian Naira' },
  { code: 'cad', label: 'CAD – Canadian Dollar' },
]

export default function NewCreditCardAuthorizationPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const [form, setForm] = useState({
    cardholderName:             '',
    cardholderEmail:            '',
    cardholderPhone:            '',
    cardholderCountry:          '',
    cardholderRelationship:     'self',
    cardholderRelationshipNote: '',
    isPersonalCard:             true,
    companyName:                '',
    travellerName:              '',
    bookingReference:           '',
    travelDates:                '',
    supplier:                   '',
    serviceType:                SERVICE_TYPES[0],
    currency:                   'gbp',
    maxAmount:                  '',
    permittedCharges:           [] as string[],
    description:                '',
    allowMultipleCharges:       false,
    validUntil:                 '',
    notes:                      '',
    sendNow:                    true,
  })

  function set(field: string, value: unknown) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleCharge(charge: string) {
    setForm(f => ({
      ...f,
      permittedCharges: f.permittedCharges.includes(charge)
        ? f.permittedCharges.filter(c => c !== charge)
        : [...f.permittedCharges, charge],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cardholderName || !form.cardholderEmail || !form.travellerName || !form.maxAmount || !form.description || !form.validUntil) {
      setError('Please fill in all required fields.')
      return
    }

    const maxAmount = parseFloat(form.maxAmount)
    if (isNaN(maxAmount) || maxAmount <= 0) {
      setError('Maximum amount must be a positive number.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const r = await fetch('/api/admin/credit-card-authorizations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          maxAmount,
          isPersonalCard: form.isPersonalCard,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to create')
      router.push(`/admin/credit-card-authorizations/${d.auth.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.')
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]'
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <a href="/admin/credit-card-authorizations" className="text-sm text-gray-500 hover:text-gray-800">
          ← Credit Card Authorisations
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">New Credit Card Authorisation</h1>
        <p className="text-sm text-gray-500 mt-1">
          The cardholder will receive an email to save their card and sign the authorisation.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Section: Cardholder ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">Cardholder Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Full Name *</label>
              <input type="text" required value={form.cardholderName} onChange={e => set('cardholderName', e.target.value)} className={inputClass} placeholder="Jane Smith" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Email Address *</label>
              <input type="email" required value={form.cardholderEmail} onChange={e => set('cardholderEmail', e.target.value)} className={inputClass} placeholder="jane@example.com" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Phone</label>
              <input type="tel" value={form.cardholderPhone} onChange={e => set('cardholderPhone', e.target.value)} className={inputClass} placeholder="+44 7700 900000" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Country</label>
              <input type="text" value={form.cardholderCountry} onChange={e => set('cardholderCountry', e.target.value)} className={inputClass} placeholder="United Kingdom" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Relationship to Traveller</label>
              <select value={form.cardholderRelationship} onChange={e => set('cardholderRelationship', e.target.value)} className={inputClass}>
                <option value="self">Self (cardholder is the traveller)</option>
                <option value="spouse">Spouse / Partner</option>
                <option value="parent">Parent / Guardian</option>
                <option value="employer">Employer / Company</option>
                <option value="other">Other</option>
              </select>
            </div>
            {form.cardholderRelationship === 'other' && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Specify Relationship</label>
                <input type="text" value={form.cardholderRelationshipNote} onChange={e => set('cardholderRelationshipNote', e.target.value)} className={inputClass} placeholder="e.g. Friend, Sibling" />
              </div>
            )}
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="personalCard" checked={form.isPersonalCard} onChange={e => set('isPersonalCard', e.target.checked)} className="w-4 h-4 accent-[#C9A84C]" />
              <label htmlFor="personalCard" className="text-sm text-gray-700">This is a personal card (not a corporate/business card)</label>
            </div>
            {!form.isPersonalCard && (
              <div className="col-span-2">
                <label className={labelClass}>Company Name</label>
                <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} className={inputClass} placeholder="ACME Corporation Ltd" />
              </div>
            )}
          </div>
        </section>

        {/* ── Section: Traveller / Booking ────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">Traveller &amp; Booking</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Traveller Name *</label>
              <input type="text" required value={form.travellerName} onChange={e => set('travellerName', e.target.value)} className={inputClass} placeholder="John Smith" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Booking Reference</label>
              <input type="text" value={form.bookingReference} onChange={e => set('bookingReference', e.target.value)} className={inputClass} placeholder="WT-2026-XXXXX" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Travel Dates</label>
              <input type="text" value={form.travelDates} onChange={e => set('travelDates', e.target.value)} className={inputClass} placeholder="15 Sep – 22 Sep 2026" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Supplier / Airline / Hotel</label>
              <input type="text" value={form.supplier} onChange={e => set('supplier', e.target.value)} className={inputClass} placeholder="Emirates, Marriott, etc." />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Service Type *</label>
              <select value={form.serviceType} onChange={e => set('serviceType', e.target.value)} className={inputClass}>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* ── Section: Authorization Terms ────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">Authorisation Terms</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Currency *</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className={inputClass}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Maximum Amount *</label>
              <input type="number" required min="1" step="0.01" value={form.maxAmount} onChange={e => set('maxAmount', e.target.value)} className={inputClass} placeholder="1500.00" />
              <p className="text-xs text-gray-400 mt-1">The maximum total that can be charged</p>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Description / Purpose *</label>
              <textarea rows={3} required value={form.description} onChange={e => set('description', e.target.value)} className={`${inputClass} resize-none`} placeholder="E.g. Flight ticket for Emirates EK001 from London to Dubai on 15 Sep 2026" />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Permitted Charge Types</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PERMITTED_CHARGE_OPTIONS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCharge(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      form.permittedCharges.includes(c)
                        ? 'bg-[#0A1628] border-[#0A1628] text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Valid Until *</label>
              <input type="date" required value={form.validUntil} onChange={e => set('validUntil', e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="multiCharge" checked={form.allowMultipleCharges} onChange={e => set('allowMultipleCharges', e.target.checked)} className="w-4 h-4 accent-[#C9A84C]" />
              <label htmlFor="multiCharge" className="text-sm text-gray-700">Allow multiple charges up to the maximum</label>
            </div>
          </div>
        </section>

        {/* ── Section: Notes ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Internal Notes</h2>
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} className={`${inputClass} resize-none`} placeholder="Visible to admin only" />
        </section>

        {/* ── Actions ──────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <input type="checkbox" id="sendNow" checked={form.sendNow} onChange={e => set('sendNow', e.target.checked)} className="w-4 h-4 accent-[#C9A84C]" />
            <label htmlFor="sendNow" className="text-sm font-medium text-gray-700">
              Send authorisation email to cardholder immediately
            </label>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#C9A84C] text-[#0A1628] font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-[#b8973d] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating…' : form.sendNow ? 'Create & Send' : 'Create (Draft)'}
            </button>
            <a href="/admin/credit-card-authorizations" className="text-sm text-gray-500 px-4 py-2.5 rounded-lg hover:bg-gray-100">
              Cancel
            </a>
          </div>
        </div>
      </form>
    </div>
  )
}
