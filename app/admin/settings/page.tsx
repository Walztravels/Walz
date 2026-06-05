'use client'

import { useState, useEffect } from 'react'
import { Save, RefreshCw, CheckCircle } from 'lucide-react'

interface SettingEntry {
  label: string
  value: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingEntry>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/settings')
    const data = await res.json()
    setSettings(data)
    const initial: Record<string, string> = {}
    for (const [k, v] of Object.entries(data as Record<string, SettingEntry>)) {
      initial[k] = v.value
    }
    setValues(initial)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
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

  const GROUPS = [
    {
      title: '📬 Contact Details',
      keys: ['contact_email', 'support_email', 'booking_email', 'office_address'],
    },
    {
      title: '📱 WhatsApp & Phone',
      keys: ['whatsapp_1', 'whatsapp_2', 'emergency_phone'],
    },
    {
      title: '💰 Fees',
      keys: ['service_fee'],
    },
  ]

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-6">Settings</h1>
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Loading…</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Update contact details, phone numbers and service fees. Changes publish immediately.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors">
          <RefreshCw className="w-4 h-4" />
          Reload
        </button>
      </div>

      <form onSubmit={save} className="space-y-6 max-w-2xl">
        {GROUPS.map((group) => (
          <div key={group.title} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A]">{group.title}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {group.keys.map((key) => {
                const setting = settings[key]
                if (!setting) return null
                return (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{setting.label}</label>
                    <input
                      type={key === 'service_fee' ? 'number' : key.includes('email') ? 'email' : 'text'}
                      value={values[key] ?? ''}
                      onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] transition-colors"
                      placeholder={setting.value}
                    />
                    {key === 'service_fee' && (
                      <p className="text-xs text-gray-400 mt-1">This fee is added to every booking in USD</p>
                    )}
                    {(key === 'whatsapp_1' || key === 'whatsapp_2') && (
                      <p className="text-xs text-gray-400 mt-1">Include country code, e.g. +447911123456</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              Saved successfully
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
