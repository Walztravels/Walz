'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, CheckCircle, Phone, MapPin, Globe, AlertCircle, Mail } from 'lucide-react'

interface Field {
  key:    string
  label:  string
  hint:   string
  type?:  string
}

const GROUPS: Array<{ title: string; description: string; icon: 'phone' | 'globe' | 'map' | 'mail'; fields: Field[] }> = [
  {
    title:       'WhatsApp (Navbar)',
    description: 'Main WhatsApp number shown in the top bar on every page',
    icon:        'phone',
    fields: [
      { key: 'whatsapp_header',         label: 'Raw number (wa.me link)',  hint: 'No spaces — e.g. +12317902336. This is the number the link dials.',       type: 'tel'  },
      { key: 'whatsapp_header_display', label: 'Display text (button)',    hint: 'What visitors see on the button — e.g. +12317902336 or "Chat with us".',  type: 'text' },
    ],
  },
  {
    title:       'WhatsApp (Homepage CTA)',
    description: 'The "WhatsApp us" button at the bottom of the homepage',
    icon:        'phone',
    fields: [
      { key: 'whatsapp_cta',         label: 'Raw number (wa.me link)',  hint: 'No spaces — e.g. +12317902336.',             type: 'tel'  },
      { key: 'whatsapp_cta_display', label: 'Display text (button)',    hint: 'Text shown on the homepage button.',          type: 'text' },
    ],
  },
  {
    title:       'WhatsApp by Region',
    description: 'Per-region numbers used in the footer contact section and region selectors',
    icon:        'globe',
    fields: [
      { key: 'phone_uk',      label: 'UK',      hint: 'e.g. +12317902336',  type: 'tel' },
      { key: 'phone_canada',  label: 'Canada',  hint: 'e.g. +13657200865',  type: 'tel' },
      { key: 'phone_uae',     label: 'UAE',     hint: 'e.g. +971500000000', type: 'tel' },
      { key: 'phone_nigeria', label: 'Nigeria', hint: 'e.g. +2347077691701', type: 'tel' },
      { key: 'phone_ghana',   label: 'Ghana',   hint: 'e.g. +233201234567', type: 'tel' },
      { key: 'call_jade',     label: 'Call line (phone)',  hint: 'Shown as "Call Jade" — e.g. +19843880110', type: 'tel' },
    ],
  },
  {
    title:       'Footer WhatsApp Slots',
    description: 'Up to 4 WhatsApp buttons shown in the website footer. Leave label blank to hide a slot.',
    icon:        'phone',
    fields: [
      { key: 'footer_wa_1_label',  label: 'Slot 1 – Label',  hint: 'e.g. WhatsApp UK — leave blank to hide', type: 'text' },
      { key: 'footer_wa_1_number', label: 'Slot 1 – Number', hint: 'e.g. +12317902336',                      type: 'tel'  },
      { key: 'footer_wa_2_label',  label: 'Slot 2 – Label',  hint: 'e.g. WhatsApp Canada',                   type: 'text' },
      { key: 'footer_wa_2_number', label: 'Slot 2 – Number', hint: 'e.g. +13657200865',                      type: 'tel'  },
      { key: 'footer_wa_3_label',  label: 'Slot 3 – Label',  hint: 'e.g. WhatsApp Nigeria — leave blank to hide', type: 'text' },
      { key: 'footer_wa_3_number', label: 'Slot 3 – Number', hint: 'e.g. +2347077691701',                    type: 'tel'  },
      { key: 'footer_wa_4_label',  label: 'Slot 4 – Label',  hint: 'e.g. WhatsApp Ghana — leave blank to hide',  type: 'text' },
      { key: 'footer_wa_4_number', label: 'Slot 4 – Number', hint: 'e.g. +233201234567',                     type: 'tel'  },
    ],
  },
  {
    title:       'Email Addresses',
    description: 'System email addresses used for notifications and contact forms',
    icon:        'mail',
    fields: [
      { key: 'business_email',  label: 'Main contact email',    hint: 'e.g. contact@walztravels.com',  type: 'email' },
      { key: 'contact_email',   label: 'Contact form email',    hint: 'Receives general enquiries',    type: 'email' },
      { key: 'support_email',   label: 'Support email',         hint: 'For booking issues',            type: 'email' },
      { key: 'booking_email',   label: 'Booking confirmation email', hint: 'Sent on new bookings',     type: 'email' },
      { key: 'admin_email',     label: 'Admin alert email',     hint: 'Internal staff alerts',         type: 'email' },
      { key: 'visa_email',      label: 'Visa alert email',      hint: 'Visa application notifications', type: 'email' },
      { key: 'finance_email',   label: 'Finance alert email',   hint: 'Payment / invoice alerts',      type: 'email' },
    ],
  },
  {
    title:       'Business Identity',
    description: 'Shown in the footer, legal pages, and email footers',
    icon:        'map',
    fields: [
      { key: 'business_name',    label: 'Business name',    hint: 'e.g. Walz Travels Ltd',                                                       type: 'text'  },
      { key: 'business_address', label: 'Business address', hint: 'e.g. THE WALZ TRAVELS INC · Ontario, Canada · Registered in England & Wales', type: 'text'  },
      { key: 'website_url',      label: 'Website URL',      hint: 'e.g. https://walztravels.com',                                                type: 'url'   },
    ],
  },
]

const ALL_KEYS = GROUPS.flatMap(g => g.fields.map(f => f.key))

function GroupIcon({ icon }: { icon: typeof GROUPS[0]['icon'] }) {
  if (icon === 'mail') return <Mail className="w-4 h-4 text-[#C9A84C]" />
  if (icon === 'map')  return <MapPin className="w-4 h-4 text-[#C9A84C]" />
  if (icon === 'globe') return <Globe className="w-4 h-4 text-[#C9A84C]" />
  return <Phone className="w-4 h-4 text-[#C9A84C]" />
}

export default function ContactSettingsPage() {
  const [values,  setValues]  = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/admin/settings')
      const data = await res.json() as Record<string, { value: string }>
      const map: Record<string, string> = {}
      for (const key of ALL_KEYS) {
        map[key] = data[key]?.value ?? ''
      }
      setValues(map)
    } catch {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setSaved(false); setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Phone className="w-5 h-5 text-[#0B1F3A]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Contact Settings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Change WhatsApp numbers, email addresses, footer slots, and business identity. Changes go live immediately.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-[#C9A84C] rounded-full animate-spin" />
          Loading settings…
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map(group => (
            <div key={group.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <GroupIcon icon={group.icon} />
                <h2 className="font-bold text-[#0B1F3A] text-sm">{group.title}</h2>
              </div>
              <p className="text-gray-400 text-xs mb-5">{group.description}</p>

              <div className="space-y-4">
                {group.fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      {field.label}
                    </label>
                    <input
                      type={field.type ?? 'text'}
                      value={values[field.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.hint}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors font-mono"
                    />
                    <p className="text-gray-400 text-[11px] mt-1">{field.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-4 pb-8">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0B1F3A] hover:bg-[#1a3358] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>

            {saved && (
              <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Saved! Changes are live immediately.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
