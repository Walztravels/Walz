'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle, Mail, Bell, ChevronDown, ChevronUp, Info } from 'lucide-react'

// ── Email templates config ────────────────────────────────────────────────────
const TEMPLATES = [
  {
    key: 'email_tpl_welcome',
    label: 'Welcome Email',
    description: 'Sent when a new client account is created',
    subjectKey: 'email_tpl_welcome_subject',
    defaultSubject: 'Welcome to Walz Travels — Your Portal Is Ready',
    defaultBody: `Hi [name],

Welcome to Walz Travels! Your client portal is now active.

Portal: https://walztravels.com/portal
Reference: [reference]

If you need help, WhatsApp Jade at +1 786 797 7884.

Warm regards,
The Walz Travels Team`,
  },
  {
    key: 'email_tpl_app_received',
    label: 'Application Received',
    description: 'Sent when a visa/service application is submitted',
    subjectKey: 'email_tpl_app_received_subject',
    defaultSubject: 'Your Application Has Been Received — [reference]',
    defaultBody: `Hi [name],

We have received your application for [destination].

Reference: [reference]
Status: [status]

Jade will review your application and contact you within 24 hours.

If you have questions, WhatsApp us at +1 786 797 7884.

Best regards,
Walz Travels`,
  },
  {
    key: 'email_tpl_status_update',
    label: 'Status Update',
    description: 'Sent when an application status changes',
    subjectKey: 'email_tpl_status_update_subject',
    defaultSubject: 'Application Update — [reference]',
    defaultBody: `Hi [name],

Your application (Ref: [reference]) has been updated.

New Status: [status]

[notes]

Log in to your portal to view full details:
https://walztravels.com/portal

Warm regards,
Walz Travels`,
  },
  {
    key: 'email_tpl_visa_approved',
    label: 'Visa Approved',
    description: 'Sent when a visa application is approved',
    subjectKey: 'email_tpl_visa_approved_subject',
    defaultSubject: '🎉 Your Visa Has Been Approved — [reference]',
    defaultBody: `Hi [name],

Great news! Your visa application for [destination] has been approved.

Reference: [reference]
Approved on: [date]

Your visa documents will be sent to you shortly. Please check your portal for the approved document.

Congratulations and have a wonderful trip!

Jade & the Walz Travels Team`,
  },
  {
    key: 'email_tpl_doc_received',
    label: 'Document Received',
    description: 'Sent when a client uploads a document',
    subjectKey: 'email_tpl_doc_received_subject',
    defaultSubject: 'Document Received — [reference]',
    defaultBody: `Hi [name],

We have received your document upload for application [reference].

Our team will review it and get back to you if anything is needed.

View your portal: https://walztravels.com/portal

Best regards,
Walz Travels`,
  },
  {
    key: 'email_tpl_govt_fee',
    label: 'Government Fee Instructions',
    description: 'Sent when government fee payment is required',
    subjectKey: 'email_tpl_govt_fee_subject',
    defaultSubject: 'Government Fee Payment Required — [reference]',
    defaultBody: `Hi [name],

Your application (Ref: [reference]) is ready for the government fee payment.

Amount: [amount]
Instructions: [notes]

Please complete the payment as soon as possible to avoid delays.

WhatsApp Jade at +1 786 797 7884 if you have any questions.

Walz Travels`,
  },
]

// ── Notification settings ─────────────────────────────────────────────────────
const NOTIFICATIONS = [
  { key: 'notif_new_application', label: 'New application received', defaultEmail: 'contact@walztravels.com' },
  { key: 'notif_new_client',      label: 'New client created',        defaultEmail: 'contact@walztravels.com' },
  { key: 'notif_payment',         label: 'Payment received',          defaultEmail: 'contact@walztravels.com' },
  { key: 'notif_document',        label: 'Document uploaded',         defaultEmail: 'contact@walztravels.com' },
]

const VARIABLES = ['[name]', '[reference]', '[destination]', '[status]', '[amount]', '[date]', '[notes]']

const INPUT  = 'w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white transition-colors'
const TEXTAREA = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white resize-none font-mono transition-colors leading-relaxed'

export default function EmailSettingsPage() {
  const [values, setValues]     = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [open, setOpen]         = useState<string | null>(TEMPLATES[0].key)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch('/api/admin/settings')
      const d   = await res.json()
      const init: Record<string, string> = {}
      for (const tpl of TEMPLATES) {
        init[tpl.subjectKey] = d[tpl.subjectKey]?.value ?? tpl.defaultSubject
        init[tpl.key]        = d[tpl.key]?.value        ?? tpl.defaultBody
      }
      for (const n of NOTIFICATIONS) {
        init[n.key + '_enabled'] = d[n.key + '_enabled']?.value ?? 'true'
        init[n.key + '_email']   = d[n.key + '_email']?.value   ?? n.defaultEmail
      }
      init.admin_email  = d.admin_email?.value  ?? 'contact@walztravels.com'
      init.visa_email   = d.visa_email?.value   ?? 'contact@walztravels.com'
      init.finance_email = d.finance_email?.value ?? 'contact@walztravels.com'
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

  function set(key: string, val: string) {
    setValues(v => ({ ...v, [key]: val }))
  }

  function toggleNotif(key: string) {
    setValues(v => ({ ...v, [key + '_enabled']: v[key + '_enabled'] === 'false' ? 'true' : 'false' }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Available variables info */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-blue-800 mb-1">Available template variables</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map(v => (
              <code key={v} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{v}</code>
            ))}
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
            <Mail className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0B1F3A]">Email Templates</h2>
            <p className="text-xs text-gray-500">Edit the subject and body for each automated email</p>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {TEMPLATES.map(tpl => {
            const isOpen = open === tpl.key
            return (
              <div key={tpl.key}>
                <button
                  onClick={() => setOpen(isOpen ? null : tpl.key)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{tpl.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {isOpen && (
                  <div className="px-6 pb-5 space-y-3 border-t border-gray-50 pt-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject Line</label>
                      <input
                        value={values[tpl.subjectKey] ?? ''}
                        onChange={e => set(tpl.subjectKey, e.target.value)}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Body</label>
                      <textarea
                        rows={10}
                        value={values[tpl.key] ?? ''}
                        onChange={e => set(tpl.key, e.target.value)}
                        className={TEXTAREA}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0B1F3A]">Internal Notifications</h2>
            <p className="text-xs text-gray-500">Control which events trigger internal team emails</p>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {NOTIFICATIONS.map(n => {
            const enabled = values[n.key + '_enabled'] !== 'false'
            return (
              <div key={n.key} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => toggleNotif(n.key)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <p className="text-sm text-gray-700">{n.label}</p>
                </div>
                {enabled && (
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <input
                      type="email"
                      value={values[n.key + '_email'] ?? ''}
                      onChange={e => set(n.key + '_email', e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#C9A84C] bg-white"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Notification email addresses */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-[#0B1F3A]">Team Email Addresses</h2>
          <p className="text-xs text-gray-500 mt-0.5">Fallback addresses for team notifications</p>
        </div>
        <div className="p-6 space-y-4">
          {[
            { key: 'admin_email',   label: 'Admin Email' },
            { key: 'visa_email',    label: 'Visa Team Email' },
            { key: 'finance_email', label: 'Finance Email' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <label className="w-36 text-sm font-medium text-gray-700 flex-shrink-0">{label}</label>
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={values[key] ?? ''}
                  onChange={e => set(key, e.target.value)}
                  className={`${INPUT} pl-9`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
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
            Save Email Settings
          </button>
        </div>
      </div>

    </div>
  )
}
