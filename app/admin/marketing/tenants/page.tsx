'use client'

import { useState, useEffect } from 'react'
import { Building2, Plus, Loader2, X, CheckCircle, Clock, AlertCircle, ChevronDown } from 'lucide-react'

type Tenant = {
  id:          string
  agencyName:  string
  domain:      string | null
  email:       string
  phone:       string | null
  country:     string
  plan:        string
  status:      string
  trialEndsAt: string | null
  createdAt:   string
}

const STATUS_COLORS: Record<string, string> = {
  trial:     'bg-amber-50 text-amber-700',
  active:    'bg-emerald-50 text-emerald-700',
  suspended: 'bg-red-50 text-red-600',
}

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-600',
  growth:  'bg-blue-50 text-blue-700',
  pro:     'bg-purple-50 text-purple-700',
}

const PLAN_PRICES: Record<string, string> = {
  starter: '₦15k/mo',
  growth:  '₦25k/mo',
  pro:     '₦40k/mo',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TenantsPage() {
  const [tenants,  setTenants]  = useState<Tenant[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  const [agencyName, setAgencyName] = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [domain,     setDomain]     = useState('')
  const [country,    setCountry]    = useState('NG')
  const [plan,       setPlan]       = useState('starter')

  useEffect(() => {
    fetch('/api/admin/marketing/tenants')
      .then(r => r.json())
      .then((d: { tenants: Tenant[] }) => { setTenants(d.tenants ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function createTenant() {
    if (!agencyName.trim() || !email.trim()) {
      setMsg('Agency name and email are required')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const res  = await fetch('/api/admin/marketing/tenants', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agencyName, email, phone, domain, country, plan }),
      })
      const data = await res.json() as { tenant: Tenant; error?: string }
      if (data.error) throw new Error(data.error)
      setTenants(prev => [data.tenant, ...prev])
      setShowForm(false)
      setAgencyName(''); setEmail(''); setPhone(''); setDomain(''); setCountry('NG'); setPlan('starter')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error creating tenant')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }

  return (
    <div className="space-y-5 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">TravelPost Tenants</h1>
            <p className="text-sm text-gray-500">White-label Social Studio for Nigerian/Ghanaian agencies</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm transition"
        >
          <Plus className="w-4 h-4" /> Add Tenant
        </button>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { key: 'starter', label: 'Starter', price: '₦15,000/mo', features: ['Caption Generator', 'Content Calendar', 'Media Library'] },
          { key: 'growth',  label: 'Growth',  price: '₦25,000/mo', features: ['Everything in Starter', 'WhatsApp Broadcast (50/mo)', 'Analytics'] },
          { key: 'pro',     label: 'Pro',     price: '₦40,000/mo', features: ['Everything in Growth', 'Unlimited WhatsApp', 'Auto-publisher', 'Priority support'] },
        ].map(({ key, label, price, features }) => (
          <div key={key} className={`rounded-2xl border p-4 ${key === 'pro' ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PLAN_COLORS[key]}`}>{label}</span>
              <span className="text-sm font-bold text-gray-900">{price}</span>
            </div>
            <ul className="space-y-1 mt-2">
              {features.map(f => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Add tenant form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">New Tenant</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Agency Name *</label>
              <input value={agencyName} onChange={e => setAgencyName(e.target.value)} placeholder="Lagos Travels Ltd"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Email *</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@agencyname.com" type="email"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+2348012345678"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Domain</label>
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="agencyname.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Country</label>
              <div className="relative">
                <select value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 pr-8">
                  <option value="NG">Nigeria</option>
                  <option value="GH">Ghana</option>
                  <option value="KE">Kenya</option>
                  <option value="ZA">South Africa</option>
                </select>
                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Plan</label>
              <div className="relative">
                <select value={plan} onChange={e => setPlan(e.target.value)}
                  className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 pr-8">
                  <option value="starter">Starter — ₦15,000/mo</option>
                  <option value="growth">Growth — ₦25,000/mo</option>
                  <option value="pro">Pro — ₦40,000/mo</option>
                </select>
                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
          {msg && <p className="px-5 pb-2 text-sm text-center text-red-500">{msg}</p>}
          <div className="px-5 pb-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
            <button
              onClick={createTenant}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Create Tenant
            </button>
          </div>
        </div>
      )}

      {/* Tenant table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">All Tenants ({tenants.length})</h2>
        </div>
        {loading
          ? <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
          : tenants.length === 0
          ? (
            <div className="py-16 text-center">
              <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium text-sm">No tenants yet</p>
              <p className="text-gray-300 text-xs mt-1">Add your first TravelPost agency above</p>
            </div>
          )
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Agency</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Plan</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Country</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">{t.agencyName}</p>
                        <p className="text-xs text-gray-400">{t.email}</p>
                        {t.domain && <p className="text-xs text-gray-300">{t.domain}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${PLAN_COLORS[t.plan]}`}>
                            {t.plan}
                          </span>
                          <p className="text-[10px] text-gray-400 mt-0.5">{PLAN_PRICES[t.plan]}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[t.status]}`}>
                          {t.status === 'trial'
                            ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Trial</span>
                            : t.status === 'active'
                            ? <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Active</span>
                            : <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Suspended</span>
                          }
                        </span>
                        {t.trialEndsAt && t.status === 'trial' && (
                          <p className="text-[10px] text-amber-500 mt-0.5">Trial ends {fmtDate(t.trialEndsAt)}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{t.country}</td>
                      <td className="px-5 py-4 text-xs text-gray-400">{fmtDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
