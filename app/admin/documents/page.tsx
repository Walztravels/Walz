'use client'

import { useEffect, useState, useCallback } from 'react'
import { FolderOpen, Search, RefreshCw, Loader2, ExternalLink, CheckCircle, XCircle, Clock } from 'lucide-react'

interface Doc {
  id: string
  name: string
  category: string
  fileUrl: string
  fileSize: number | null
  mimeType: string | null
  status: string
  uploadedAt: string
  application: { stage: string } | null
  user: { name: string | null; email: string | null } | null
}

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending Review', icon: Clock,       cls: 'bg-amber-100 text-amber-700'  },
  APPROVED: { label: 'Approved',       icon: CheckCircle, cls: 'bg-green-100 text-green-700'  },
  REJECTED: { label: 'Rejected',       icon: XCircle,     cls: 'bg-red-100 text-red-700'      },
}

function fileSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function DocumentsPage() {
  const [docs, setDocs]       = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/portal/documents')
    const d   = await res.json()
    setDocs(d.documents ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/portal/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setDocs(prev => prev.map(d => d.id === id ? { ...d, status } : d))
  }

  const filtered = docs.filter(d => {
    if (filter !== 'ALL' && d.status !== filter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return `${d.name} ${d.category} ${d.user?.name ?? ''} ${d.user?.email ?? ''}`.toLowerCase().includes(q)
  })

  const statusKeys = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Documents</h1>
          <p className="text-sm text-gray-400 mt-0.5">{docs.length} client documents uploaded</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {statusKeys.map(k => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === k ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-[#0B1F3A]'}`}>
              {k === 'ALL' ? 'All' : STATUS_CONFIG[k as keyof typeof STATUS_CONFIG]?.label ?? k}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, category or client…"
            className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-gray-400">
          <FolderOpen className="w-10 h-10 text-gray-200" />
          <p className="text-sm">No documents found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Document', 'Category', 'Client', 'Size', 'Status', 'Uploaded', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(doc => {
                  const s = STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG]
                  const StatusIcon = s?.icon ?? Clock
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                            className="font-semibold text-[#0B1F3A] text-sm hover:text-[#C9A84C] flex items-center gap-1">
                            {doc.name}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{doc.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{doc.user?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{doc.user?.email ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fileSize(doc.fileSize)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${s?.cls ?? 'bg-gray-100 text-gray-500'}`}>
                          <StatusIcon className="w-3 h-3" />
                          {s?.label ?? doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {doc.status !== 'APPROVED' && (
                            <button onClick={() => updateStatus(doc.id, 'APPROVED')}
                              className="text-[11px] px-2 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-semibold transition-colors">
                              Approve
                            </button>
                          )}
                          {doc.status !== 'REJECTED' && (
                            <button onClick={() => updateStatus(doc.id, 'REJECTED')}
                              className="text-[11px] px-2 py-1 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-semibold transition-colors">
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
