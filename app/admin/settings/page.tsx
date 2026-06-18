'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Save, RefreshCw, CheckCircle, Building2, Mail, Phone,
  Share2, MapPin, DollarSign, Bell, CreditCard,
} from 'lucide-react'

interface Setting {
  label: string
  value: string
  group: string
}

type SettingsMap = Record<string, Setting>

const GROUPS = [
  {
    id: 'general',
    title: 'General',
    icon: Building2,
    description: 'Business identity and web presence',
    keys: [
      { key: 'business_name', type: 'text',  hint: '' },
      { key: 'office_address', type: 'text', hint: 'Full street address' },
      { key: 'website_url',   type: 'url',   hint: 'Include https://' },
    ],
  },
  {
    id: 'emails',
    title: 'Email Addresses',
    icon: Mail,
    description: 'Inbound contact and booking emails',
    keys: [
      { key: 'contact_email', type: 'email', hint: '' },
      { key: 'support_email', type: 'email', hint: '' },
      { key: 'booking_email', type: 'email', hint: '' },
    ],
  },
  {
    id: 'phones',
    title: 'Phone & WhatsApp',
    icon: Phone,
    description: 'Include full international code, e.g. +447911123456',
    keys: [
      { key: 'whatsapp_uk',     type: 'tel', hint: 'UK number with +44 prefix' },
      { key: 'whatsapp_us',     type: 'tel', hint: 'US number with +1 prefix' },
      { key: 'whatsapp_canada', type: 'tel', hint: 'Canada number with +1 prefix' },
      { key: 'call_jade',       type: 'tel', hint: 'Jade direct line' },
    ],
  },
  {
    id: 'visa_fees',
    title: 'Visa Service Fees',
    icon: DollarSign,
    description: 'Walz Travels service fee displayed on the visa page (e.g. £149)',
    keys: [
      { key: 'visa_fee_uk',       type: 'text', hint: 'e.g. £149' },
      { key: 'visa_fee_canada',   type: 'text', hint: 'e.g. £149' },
      { key: 'visa_fee_uae',      type: 'text', hint: 'e.g. £99'  },
      { key: 'visa_fee_schengen', type: 'text', hint: 'e.g. £149' },
      { key: 'visa_fee_usa',      type: 'text', hint: 'e.g. £199' },
    ],
  },
  {
    id: 'social',
    title: 'Social Media',
    icon: Share2,
    description: 'Handle or full profile URL for each platform',
    keys: [
      { key: 'instagram', type: 'text', hint: '@handle or full URL' },
      { key: 'facebook',  type: 'text', hint: '@handle or full URL' },
      { key: 'snapchat',  type: 'text', hint: '@handle' },
      { key: 'twitter',   type: 'text', hint: '@handle or full URL' },
    ],
  },
  {
    id: 'notifications',
    title: 'Email Notifications',
    icon: Bell,
    description: 'Which email receives admin alerts for new applications and bookings',
    keys: [
      { key: 'admin_email',   type: 'email', hint: 'Receives all admin alerts' },
      { key: 'visa_email',    type: 'email', hint: 'New visa application alerts' },
      { key: 'finance_email', type: 'email', hint: 'Payment and refund alerts' },
    ],
  },
  {
    id: 'gateway',
    title: 'Payment Gateway Display',
    icon: CreditCard,
    description: 'Publicly displayed gateway identifiers (not secret keys)',
    keys: [
      { key: 'gateway_stripe_pk',  type: 'text', hint: 'Stripe publishable key (pk_live_...)' },
      { key: 'gateway_flw_public', type: 'text', hint: 'Flutterwave public key (FLWPUBK_...)' },
    ],
  },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({})
  const [values, setValues]     = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null) // group id being saved
  const [saved,  setSaved]      = useState<string | null>(null) // group id just saved

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/settings')
      const data: SettingsMap = await res.json()
      setSettings(data)
      const init: Record<string, string> = {}
      for (const [k, v] of Object.entries(data)) init[k] = v.value
      setValues(init)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveGroup(groupId: string) {
    const groupKeys = GROUPS.find(g => g.id === groupId)?.keys.map(k => k.key) ?? []
    const payload: Record<string, string> = {}
    for (const key of groupKeys) payload[key] = values[key] ?? ''

    setSaving(groupId)
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSaved(groupId)
      setTimeout(() => setSaved(null), 3000)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Manage business details, contact info and social media.</p>
        </div>
        <div className="space-y-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/4 mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-gray-100 rounded-xl" />
                <div className="h-10 bg-gray-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Changes save per section and publish to the live site immediately.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors px-3 py-2 rounded-lg hover:bg-gray-100"
        >
          <RefreshCw className="w-4 h-4" />
          Reload
        </button>
      </div>

      <div className="space-y-6 max-w-2xl">
        {GROUPS.map((group) => {
          const GroupIcon = group.icon
          const isSaving = saving === group.id
          const isSaved  = saved  === group.id

          return (
            <div
              key={group.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              {/* Group header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0">
                  <GroupIcon className="w-4 h-4 text-[#0B1F3A]" />
                </div>
                <div>
                  <h2 className="font-bold text-[#0B1F3A] text-sm">{group.title}</h2>
                  <p className="text-gray-400 text-xs mt-0.5">{group.description}</p>
                </div>
              </div>

              {/* Fields */}
              <div className="px-6 py-5 space-y-4">
                {group.keys.map(({ key, type, hint }) => {
                  const setting = settings[key]
                  if (!setting) return null
                  return (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {setting.label}
                      </label>
                      <input
                        type={type}
                        value={values[key] ?? ''}
                        onChange={(e) => setValues(v => ({ ...v, [key]: e.target.value }))}
                        placeholder={setting.value}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] transition-colors"
                      />
                      {hint && (
                        <p className="text-xs text-gray-400 mt-1">{hint}</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Save row */}
              <div className="px-6 pb-5 flex items-center gap-4">
                <button
                  onClick={() => saveGroup(group.id)}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
                >
                  {isSaving
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Save className="w-3.5 h-3.5" />
                  }
                  {isSaving ? 'Saving…' : 'Save'}
                </button>

                {isSaved && (
                  <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Saved
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Usage note */}
      <div className="mt-8 max-w-2xl p-4 bg-[#0B1F3A]/4 rounded-xl border border-[#0B1F3A]/10">
        <div className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-[#C9A84C] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-[#0B1F3A] mb-1">How settings work</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Settings are stored in the database and served dynamically. Changes you save here
              are reflected on the live website immediately — no re-deployment needed.
              WhatsApp and phone numbers update the click-to-chat links site-wide.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
