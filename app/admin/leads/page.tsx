'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { MessageSquare, RefreshCw, Inbox, Upload } from 'lucide-react'
import { CallButton } from '@/components/admin/CallButton'
import Link from 'next/link'

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
  importBatchId?: string | null
}

const STATUS_TABS = ['All', 'New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed'] as const

const SOURCE_FILTERS = [
  { value: '',                label: 'All sources' },
  { value: 'organic',         label: 'Organic' },
  { value: 'sleekflow_import', label: 'Sleekflow' },
  { value: 'zendesk_import',   label: 'Zendesk' },
  { value: 'csv_import',       label: 'CSV import' },
] as const

const statusColor: Record<string, string> = {
  New:            'bg-blue-100 text-blue-700 border-blue-200',
  Contacted:      'bg-amber-100 text-amber-700 border-amber-200',
  'Deposit Paid': 'bg-green-100 text-green-700 border-green-200',
  'In Progress':  'bg-purple-100 text-purple-700 border-purple-200',
  Closed:         'bg-gray-100 text-gray-500 border-gray-200',
}

const importSourceLabel: Record<string, string> = {
  sleekflow_import: 'Sleekflow',
  zendesk_import:   'Zendesk',
  csv_import:       'CSV',
}

const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed']

export default function LeadsPage() {
  const [tab,           setTab]          = useState<string>('All')
  const [sourceFilter,  setSourceFilter] = useState<string>('')
  const [leads,         setLeads]        = useState<Lead[]>([])
  const [total,         setTotal]        = useState(0)
  const [loading,       setLoading]      = useState(true)
  const [updating,      setUpdating]     = useState<string | null>(null)
  const [isSuperAdmin,  setIsSuperAdmin] = useState(false)
  const [importBatchId, setImportBatchId] = useState<string | null>(null)

  // Read importBatchId from URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const bid = p.get('importBatchId')
    if (bid) setImportBatchId(bid)
  }, [])

  // Check super_admin role for Import button visibility
  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then((d: { role?: string }) => setIsSuperAdmin(d.role === 'super_admin'))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tab !== 'All') params.set('status', tab)
    if (sourceFilter)  params.set('source', sourceFilter)
    if (importBatchId) params.set('importBatchId', importBatchId)
    const res  = await fetch(`/api/admin/leads?${params}`)
    const data = await res.json() as { leads: Lead[]; total: number }
    setLeads(data.leads ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [tab, sourceFilter, importBatchId])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, status: LeadStatus) => {
    setUpdating(id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await fetch('/api/admin/leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status }),
    })
    setUpdating(null)
  }

  const isImportView = Boolean(importBatchId)

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
              <h1 className="text-xl font-bold text-[#0B1F3A]">
                {isImportView ? 'Imported Leads' : 'Lead Enquiries'}
              </h1>
              <p className="text-sm text-gray-500">
                {total} {isImportView ? 'leads in this batch' : 'total leads'}
                {isImportView && (
                  <button onClick={() => setImportBatchId(null)}
                    className="ml-2 text-[#C9A84C] hover:underline">
                    ← View all leads
                  </button>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && !isImportView && (
              <Link
                href="/admin/leads/import"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1F3A] text-[#C9A84C] text-sm font-semibold hover:bg-[#0d2548] transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </Link>
            )}
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {!isImportView && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Status tabs */}
            <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 w-fit">
              {STATUS_TABS.map(s => (
                <button
                  key={s}
                  onClick={() => setTab(s)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tab === s ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Source filter */}
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
            >
              {SOURCE_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        )}

        {isImportView && (
          <div className="mb-6">
            <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 w-fit">
              {STATUS_TABS.map(s => (
                <button
                  key={s}
                  onClick={() => setTab(s)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tab === s ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

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
              <p className="text-gray-400 font-medium">No leads found</p>
              <p className="text-gray-300 text-sm mt-1">
                {isImportView ? 'No leads in this import batch' : 'Leads from the website form will appear here'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Contact</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Destination</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Travel Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Source</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Received</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Update</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Inbox</th>
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
                        <div className="flex items-center gap-2">
                          {lead.whatsapp ? (
                            <>
                              <a
                                href={`https://wa.me/${(lead.whatsapp ?? '').replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:underline font-medium"
                              >
                                {lead.whatsapp}
                              </a>
                              <CallButton phoneNumber={lead.whatsapp} />
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
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
                      <td className="px-4 py-3">
                        {importSourceLabel[lead.source] ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">
                            {importSourceLabel[lead.source]}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 capitalize">{lead.source.replace(/_/g, ' ')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {lead.createdAt ? format(new Date(lead.createdAt), 'd MMM yyyy') : '—'}
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
                      <td className="px-4 py-3">
                        {lead.source && ['sleekflow_import','zendesk_import','csv_import'].includes(lead.source) ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <Link
                            href={`/admin/inbox?lead=${lead.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0B1F3A]/5 text-[#0B1F3A] hover:bg-[#C9A84C]/15 hover:text-[#8B6914] transition-colors"
                          >
                            <Inbox className="w-3 h-3" />
                            Open
                          </Link>
                        )}
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
