'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { MessageSquare, RefreshCw } from 'lucide-react'

type LeadStatus = 'New' | 'Contacted' | 'Deposit Paid' | 'In Progress' | 'Closed'

interface Lead {
  id: string
  name: string
  email: string | null
  whatsapp: string
  service: string
  destination: string | null
  travelDate: string | null
  details: string | null
  source: string
  status: string
  createdAt: string
}

const STATUS_TABS = ['All', 'New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed'] as const

const statusColor: Record<string, string> = {
  New:            'bg-blue-100 text-blue-700 border-blue-200',
  Contacted:      'bg-amber-100 text-amber-700 border-amber-200',
  'Deposit Paid': 'bg-green-100 text-green-700 border-green-200',
  'In Progress':  'bg-purple-100 text-purple-700 border-purple-200',
  Closed:         'bg-gray-100 text-gray-500 border-gray-200',
}

const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed']

export default function LeadsPage() {
  const [tab, setTab]         = useState<string>('All')
  const [leads, setLeads]     = useState<Lead[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tab !== 'All') params.set('status', tab)
    const res = await fetch(`/api/admin/leads?${params}`)
    const data = await res.json() as { leads: Lead[]; total: number }
    setLeads(data.leads ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [tab])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, status: LeadStatus) => {
    setUpdating(id)
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await fetch('/api/admin/leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status }),
    })
    setUpdating(null)
  }

  return (
    <div className="flex-1 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0B1F3A]">Lead Enquiries</h1>
              <p className="text-sm text-gray-500">{total} total leads</p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Status Tabs */}
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 w-fit mb-6">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === s
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="py-20 text-center">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No leads yet</p>
              <p className="text-gray-300 text-sm mt-1">Leads from the website form will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">WhatsApp</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Destination</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Travel Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Received</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0B1F3A]">{lead.name}</div>
                        {lead.email && <div className="text-xs text-gray-400">{lead.email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:underline font-medium"
                        >
                          {lead.whatsapp}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#C9A84C]/10 text-[#8B6914]">
                          {lead.service}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{lead.destination || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{lead.travelDate || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColor[lead.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {format(new Date(lead.createdAt), 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          disabled={updating === lead.id}
                          onChange={e => updateStatus(lead.id, e.target.value as LeadStatus)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#C9A84C] disabled:opacity-50"
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
