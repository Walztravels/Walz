'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  MessageCircle,
  Calendar,
  MapPin,
  Phone,
  Loader2,
  ChevronDown,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Lead {
  id: string
  name: string
  service: string
  destination: string
  travel_date: string | null
  whatsapp: string
  details: string | null
  source: string
  status: string
  created_at: string
  updated_at?: string
}

const statusOptions = ['New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed']
const statusColors: Record<string, string> = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'Contacted': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Deposit Paid': 'bg-green-100 text-green-700 border-green-200',
  'In Progress': 'bg-purple-100 text-purple-700 border-purple-200',
  'Closed': 'bg-gray-100 text-gray-700 border-gray-200',
}

export default function AdminLeadsPage() {
  const { data: session, status: authStatus } = useSession()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    fetchLeads()
  }, [])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/leads')
      const data = await response.json()
      if (data.leads) {
        setLeads(data.leads)
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateLeadStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id)
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        setLeads(leads.map(lead =>
          lead.id === id ? { ...lead, status: newStatus } : lead
        ))
      }
    } catch (error) {
      console.error('Failed to update lead:', error)
    } finally {
      setUpdatingId(null)
      setOpenDropdown(null)
    }
  }

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.whatsapp.includes(searchTerm)
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Auth check
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-walz-off-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-walz-gold" />
      </div>
    )
  }

  if (!session) {
    redirect('/login?callbackUrl=/admin/leads')
  }

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Header */}
      <div className="bg-walz-deep-navy py-8">
        <div className="container-walz">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl walz-gold-gradient flex items-center justify-center">
              <Users className="w-6 h-6 text-walz-deep-navy" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-walz-white">Lead Management</h1>
              <p className="text-walz-muted text-sm">Manage and track your leads</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-walz-muted" />
            <input
              type="text"
              placeholder="Search by name, destination, or WhatsApp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-walz-border bg-white focus:outline-none focus:border-walz-gold transition-colors"
            />
          </div>

          <div className="flex gap-3">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none pl-10 pr-8 py-3 rounded-xl border border-walz-border bg-white focus:outline-none focus:border-walz-gold transition-colors text-sm cursor-pointer"
              >
                <option value="all">All Status</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-walz-muted pointer-events-none" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-walz-muted pointer-events-none" />
            </div>

            <button
              onClick={fetchLeads}
              disabled={loading}
              className="px-4 py-3 rounded-xl border border-walz-border bg-white hover:bg-walz-off-white transition-colors"
            >
              <RefreshCw className={cn('w-5 h-5 text-walz-muted', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {statusOptions.map(status => {
            const count = leads.filter(l => l.status === status).length
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                className={cn(
                  'p-4 rounded-xl border transition-all',
                  statusFilter === status
                    ? 'border-walz-gold bg-walz-gold/5'
                    : 'border-walz-border bg-white hover:border-walz-gold/50'
                )}
              >
                <div className="text-2xl font-bold text-walz-deep-navy">{count}</div>
                <div className="text-xs text-walz-muted">{status}</div>
              </button>
            )
          })}
        </div>

        {/* Leads Table */}
        <div className="bg-white rounded-2xl border border-walz-border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-walz-gold mx-auto mb-4" />
              <p className="text-walz-muted">Loading leads...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-walz-muted mx-auto mb-4" />
              <p className="text-walz-muted">No leads found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-walz-off-white border-b border-walz-border">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-walz-muted uppercase tracking-wider">Name</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-walz-muted uppercase tracking-wider">Destination</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-walz-muted uppercase tracking-wider">Date</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-walz-muted uppercase tracking-wider">Source</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-walz-muted uppercase tracking-wider">WhatsApp</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-walz-muted uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-walz-border">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-walz-off-white/50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-walz-deep-navy">{lead.name}</div>
                          <div className="text-xs text-walz-muted">{lead.service}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-walz-deep-navy">
                          <MapPin className="w-4 h-4 text-walz-muted" />
                          {lead.destination}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-walz-muted">
                          <Calendar className="w-4 h-4" />
                          {lead.travel_date || 'Not set'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs px-2 py-1 rounded-full bg-walz-off-white text-walz-muted">
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-green-600 hover:text-green-500"
                        >
                          <MessageCircle className="w-4 h-4" />
                          {lead.whatsapp}
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdown(openDropdown === lead.id ? null : lead.id)}
                            disabled={updatingId === lead.id}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                              statusColors[lead.status] || statusColors['New'],
                              updatingId === lead.id && 'opacity-50'
                            )}
                          >
                            {updatingId === lead.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                {lead.status}
                                <ChevronDown className="w-3 h-3" />
                              </>
                            )}
                          </button>

                          {openDropdown === lead.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-luxury border border-walz-border z-20 overflow-hidden">
                                {statusOptions.map(status => (
                                  <button
                                    key={status}
                                    onClick={() => updateLeadStatus(lead.id, status)}
                                    className={cn(
                                      'w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-walz-off-white transition-colors',
                                      lead.status === status && 'bg-walz-off-white'
                                    )}
                                  >
                                    {status}
                                    {lead.status === status && (
                                      <Check className="w-4 h-4 text-walz-gold" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-walz-muted">
          Showing {filteredLeads.length} of {leads.length} leads
        </div>
      </div>
    </div>
  )
}
