'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Check, Loader2, ToggleLeft, ToggleRight, Lock, Zap } from 'lucide-react'

interface VisaService {
  id:             string
  country:        string
  flag:           string | null
  visaType:       string
  fee:            number
  expressFeeUsd:  number | null
  currency:       string
  processingTime: string
  active:         boolean
}

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AED', 'AUD', 'NGN']

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AED: 'AED ', AUD: 'A$', NGN: '₦',
}

type FormData = {
  country:         string
  flag:            string
  visaType:        string
  walzFee:         string
  expressFeeUsd:   string
  walzFeeCurrency: string
  processingTime:  string
  active:          boolean
}

const EMPTY_FORM: FormData = {
  country: '', flag: '', visaType: '',
  walzFee: '', expressFeeUsd: '', walzFeeCurrency: 'USD', processingTime: '', active: true,
}

function toFormData(s: VisaService): FormData {
  return {
    country:         s.country,
    flag:            s.flag ?? '',
    visaType:        s.visaType,
    walzFee:         String(s.fee),
    expressFeeUsd:   s.expressFeeUsd != null ? String(s.expressFeeUsd) : '',
    walzFeeCurrency: s.currency,
    processingTime:  s.processingTime,
    active:          s.active,
  }
}

function EditForm({
  form, setForm, onSave, onCancel, isNew, saving,
}: {
  form:     FormData
  setForm:  (fn: (p: FormData) => FormData) => void
  onSave:   () => void
  onCancel: () => void
  isNew:    boolean
  saving:   boolean
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-[#F5F0E8] rounded-2xl mt-2">
      {([
        { label: 'Country',          field: 'country',        type: 'text'   },
        { label: 'Flag emoji',       field: 'flag',           type: 'text'   },
        { label: 'Visa Type',        field: 'visaType',       type: 'text'   },
        { label: 'Processing Time',  field: 'processingTime', type: 'text'   },
      ] as const).map(({ label, field, type }) => (
        <div key={field}>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
          <input
            type={type}
            value={(form as unknown as Record<string, string>)[field] ?? ''}
            onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
          />
        </div>
      ))}

      {/* Currency */}
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Currency</label>
        <select
          value={form.walzFeeCurrency}
          onChange={e => setForm(p => ({ ...p, walzFeeCurrency: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
        >
          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Regular fee */}
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
          Regular Fee ({form.walzFeeCurrency})
        </label>
        <input
          type="number"
          value={form.walzFee}
          onChange={e => setForm(p => ({ ...p, walzFee: e.target.value }))}
          placeholder="e.g. 205"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
        />
      </div>

      {/* Express fee */}
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
          <Zap className="w-3 h-3 text-[#C9A84C]" /> Express Fee USD <span className="font-normal text-gray-300">(optional)</span>
        </label>
        <input
          type="number"
          value={form.expressFeeUsd}
          onChange={e => setForm(p => ({ ...p, expressFeeUsd: e.target.value }))}
          placeholder="e.g. 255 (leave blank if no express)"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
        />
      </div>

      <div className="col-span-2 sm:col-span-3 flex justify-end gap-2 mt-1">
        <button onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#b8973f] disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {isNew ? 'Add Service' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

export default function VisaPricingPage() {
  const [services,    setServices]    = useState<VisaService[]>([])
  const [loading,     setLoading]     = useState(true)
  const [editing,     setEditing]     = useState<string | null>(null)
  const [form,        setForm]        = useState<FormData>(EMPTY_FORM)
  const [showAdd,     setShowAdd]     = useState(false)
  const [saving,      setSaving]      = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [roleLoaded,  setRoleLoaded]  = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/visa-services')
    const d   = await res.json()
    setServices(d.services ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    fetch('/api/admin/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setIsSuperAdmin(d?.role === 'super_admin')
        setRoleLoaded(true)
      })
      .catch(() => setRoleLoaded(true))
  }, [])

  async function save(id: string) {
    setSaving(id)
    await fetch(`/api/admin/visa-services/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    setSaving(null); setEditing(null); load()
  }

  async function create() {
    setSaving('new')
    await fetch('/api/admin/visa-services', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    setSaving(null); setShowAdd(false); setForm(EMPTY_FORM); load()
  }

  async function del(id: string) {
    if (!confirm('Delete this service? This cannot be undone.')) return
    setSaving(id)
    await fetch(`/api/admin/visa-services/${id}`, { method: 'DELETE' })
    setSaving(null); load()
  }

  async function toggle(s: VisaService) {
    await fetch(`/api/admin/visa-services/${s.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ active: !s.active }),
    })
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Visa Pricing</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Changes reflect immediately on the public /rates page and UAE visa landing page
          </p>
        </div>
        {roleLoaded && (
          isSuperAdmin ? (
            <button
              onClick={() => { setShowAdd(true); setForm(EMPTY_FORM); setEditing(null) }}
              className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#b8973f] transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Visa Service
            </button>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-400">
              <Lock className="w-4 h-4" /> Super Admin only
            </div>
          )
        )}
      </div>

      {/* Not super admin notice */}
      {roleLoaded && !isSuperAdmin && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
          <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>View-only mode.</strong> Only Super Admins can add, edit, or delete visa pricing.
            Contact the Super Admin to make changes.
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && isSuperAdmin && (
        <EditForm
          form={form} setForm={setForm}
          onSave={create}
          onCancel={() => { setShowAdd(false); setForm(EMPTY_FORM) }}
          isNew saving={saving === 'new'}
        />
      )}

      {/* UAE quick-add banner — shown when no UAE services exist */}
      {!loading && isSuperAdmin && !services.some(s => s.country === 'United Arab Emirates') && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-2xl bg-[#0B1F3A] text-white">
          <div>
            <p className="font-bold text-sm">🇦🇪 No UAE visa services yet</p>
            <p className="text-white/60 text-xs mt-0.5">Add the 7 UAE visa types to power the UAE visa landing page</p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setForm({ ...EMPTY_FORM, country: 'United Arab Emirates', flag: '🇦🇪', walzFeeCurrency: 'USD' }); setEditing(null) }}
            className="flex-shrink-0 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2 rounded-xl text-sm hover:bg-[#b8973f] transition-colors"
          >
            Add UAE Visa
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="hidden sm:grid sm:grid-cols-7 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100
            text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <div className="col-span-2">Destination</div>
            <div>Regular Fee</div>
            <div className="text-[#C9A84C]">Express Fee</div>
            <div>Processing</div>
            <div className="text-center">Active</div>
            <div className="text-right">Actions</div>
          </div>

          {services.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              No services yet. Click <strong>Add Visa Service</strong> to get started.
            </div>
          ) : services.map((s, i) => (
            <div key={s.id}>
              <div className={`grid grid-cols-3 sm:grid-cols-7 gap-3 px-5 py-4 items-center ${
                i < services.length - 1 ? 'border-b border-gray-50' : ''
              }`}>
                {/* Country */}
                <div className="col-span-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{s.flag || '🌍'}</span>
                    <div>
                      <p className="font-bold text-[#0B1F3A] text-sm">{s.country}</p>
                      <p className="text-xs text-gray-400">{s.visaType}</p>
                    </div>
                  </div>
                </div>

                {/* Regular fee */}
                <p className="font-bold text-[#0B1F3A] text-sm font-variant-numeric: tabular-nums">
                  {SYM[s.currency] ?? s.currency}{s.fee.toLocaleString()}
                </p>

                {/* Express fee */}
                <div className="hidden sm:block">
                  {s.expressFeeUsd != null ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                      <Zap className="w-3 h-3" />${s.expressFeeUsd.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Processing */}
                <p className="text-xs text-gray-500 hidden sm:block">{s.processingTime}</p>

                {/* Toggle */}
                <div className="text-center hidden sm:block">
                  <button
                    onClick={() => isSuperAdmin ? toggle(s) : undefined}
                    disabled={!isSuperAdmin}
                    title={isSuperAdmin ? (s.active ? 'Deactivate' : 'Activate') : 'Super admin only'}
                    className={isSuperAdmin ? '' : 'opacity-40 cursor-not-allowed'}
                  >
                    {s.active
                      ? <ToggleRight className="w-6 h-6 text-green-500 mx-auto" />
                      : <ToggleLeft  className="w-6 h-6 text-gray-300 mx-auto" />
                    }
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  {isSuperAdmin ? (
                    <>
                      <button
                        onClick={() => { setEditing(s.id); setForm(toFormData(s)); setShowAdd(false) }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A] transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(s.id)}
                        disabled={saving === s.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 disabled:opacity-50 transition-colors"
                        title="Delete"
                      >
                        {saving === s.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />
                        }
                      </button>
                    </>
                  ) : (
                    <span title="Super admin only"><Lock className="w-4 h-4 text-gray-200" /></span>
                  )}
                </div>
              </div>

              {/* Inline edit form */}
              {editing === s.id && isSuperAdmin && (
                <div className="px-5 pb-4">
                  <EditForm
                    form={form} setForm={setForm}
                    onSave={() => save(s.id)}
                    onCancel={() => setEditing(null)}
                    isNew={false} saving={saving === s.id}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Toggle the switch to show / hide a service on the public rates page.
        {isSuperAdmin && ' Express fee powers the UAE visa "Apply Express" button — leave blank for non-express visa types.'}
      </p>
    </div>
  )
}
