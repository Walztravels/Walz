'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle, CreditCard, Percent, DollarSign } from 'lucide-react'

// Keys stored in SiteSetting table (group: payments)
const PAYMENT_SETTINGS = {
  // Gateway toggles (stored as 'true' / 'false')
  gateway_stripe:  { label: 'Stripe',   group: 'gateways', default: 'true' },
  gateway_flocash: { label: 'FloCash',  group: 'gateways', default: 'false' },

  // Visa service fees (USD)
  fee_uk_visa:       { label: 'UK Visa Service Fee',      group: 'fees', default: '150', currency: 'USD' },
  fee_canada_visa:   { label: 'Canada Visa Service Fee',  group: 'fees', default: '150', currency: 'USD' },
  fee_uae_visa:      { label: 'UAE Visa Service Fee',     group: 'fees', default: '120', currency: 'USD' },
  fee_schengen_visa: { label: 'Schengen Visa Service Fee',group: 'fees', default: '150', currency: 'USD' },
  fee_usa_visa:      { label: 'USA Visa Service Fee',     group: 'fees', default: '200', currency: 'USD' },

  // Other fees
  fee_tour_booking:  { label: 'Tour Booking Fee',         group: 'fees', default: '100', currency: 'CAD' },
  fee_flight_markup: { label: 'Flight Booking Markup',    group: 'fees', default: '5',   currency: '%' },
} as const

type SettingKey = keyof typeof PAYMENT_SETTINGS

const GATEWAY_LOGOS: Record<string, string> = {
  gateway_stripe:  '💳 Stripe',
  gateway_flocash: '🏦 FloCash',
}

const INPUT = 'h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 bg-white transition-colors w-full'

export default function PaymentSettingsPage() {
  const [values, setValues]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch('/api/admin/settings')
      const d   = await res.json()
      const init: Record<string, string> = {}
      for (const key of Object.keys(PAYMENT_SETTINGS)) {
        const def = PAYMENT_SETTINGS[key as SettingKey].default
        init[key] = d[key]?.value ?? def
      }
      setValues(init)
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function toggle(key: string) {
    setValues(v => ({ ...v, [key]: v[key] === 'true' ? 'false' : 'true' }))
  }

  function set(key: string, val: string) {
    setValues(v => ({ ...v, [key]: val }))
  }

  const gateways = Object.entries(PAYMENT_SETTINGS).filter(([, v]) => v.group === 'gateways')
  const fees     = Object.entries(PAYMENT_SETTINGS).filter(([, v]) => v.group === 'fees')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Section: Gateways */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0B1F3A]">Payment Gateways</h2>
            <p className="text-xs text-gray-500">Enable or disable payment processors</p>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {gateways.map(([key]) => {
            const active = values[key] === 'true'
            return (
              <div key={key} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#0B1F3A]">{GATEWAY_LOGOS[key]}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <button
                  onClick={() => toggle(key)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${active ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Section: Service Fees */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0B1F3A]">Service Fee Settings</h2>
            <p className="text-xs text-gray-500">Fees charged to clients for each service type</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {fees.map(([key, meta]) => {
            const isPercent = (meta as { currency?: string }).currency === '%'
            const currency  = (meta as { currency?: string }).currency ?? 'USD'
            return (
              <div key={key} className="flex items-center gap-4">
                <label className="flex-1 text-sm font-medium text-gray-700">{meta.label}</label>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                      {isPercent ? <Percent className="w-3.5 h-3.5" /> : currency === 'USD' ? '$' : currency === 'CAD' ? 'CA$' : currency}
                    </span>
                    <input
                      type="number" min="0" step="0.01"
                      value={values[key] ?? ''}
                      onChange={e => set(key, e.target.value)}
                      className={`${INPUT} pl-8 text-right`}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10">{isPercent ? '% markup' : currency}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 font-semibold">
            <CheckCircle className="w-4 h-4" /> Settings saved
          </span>
        )}
        <div className="ml-auto">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Payment Settings
          </button>
        </div>
      </div>

    </div>
  )
}
