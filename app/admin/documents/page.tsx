'use client'

import { useEffect, useState, useCallback } from 'react'
import { FolderOpen, Search, RefreshCw, Loader2, ExternalLink, CheckCircle, XCircle, Clock, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'

// Unified document row — covers both PortalDocument and DocumentUpload
interface Doc {
  id:         string
  source:     'portal' | 'request'
  name:       string
  category:   string
  fileUrl:    string
  fileSize:   number | null
  mimeType:   string | null
  status:     string
  uploadedAt: string
  clientName: string | null
  clientEmail: string | null
  // For request uploads
  visaAppId?:    string | null
  portalAppId?:  string | null
  requestId?:    string
}

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  icon: Clock,        cls: 'bg-amber-100 text-amber-700' },
  pending:  { label: 'Pending',  icon: Clock,        cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', icon: CheckCircle,  cls: 'bg-green-100 text-green-700' },
  approved: { label: 'Approved', icon: CheckCircle,  cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rejected', icon: XCircle,      cls: 'bg-red-100 text-red-700'    },
  rejected: { label: 'Rejected', icon: XCircle,      cls: 'bg-red-100 text-red-700'    },
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function DocumentsPage() {
  const [docs,    setDocs]    = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    const [portalRes, requestRes] = await Promise.all([
      fetch('/api/admin/portal/documents'),
      fetch('/api/admin/document-requests'),
    ])
    const portalData  = await portalRes.json()
    const requestData = await requestRes.json()

    // Map PortalDocuments
    const portalDocs: Doc[] = (portalData.documents ?? []).map((d: {
      id: string; name: string; category: string; fileUrl: string;
      fileSize: number | null; mimeType: string | null; status: string;
      uploadedAt: string;
      user: { name: string | null; email: string | null } | null;
    }) => ({
      id:          d.id,
      source:      'portal' as const,
      name:        d.name,
      category:    d.category,
      fileUrl:     d.fileUrl,
      fileSize:    d.fileSize,
      mimeType:    d.mimeType,
      status:      d.status,
      uploadedAt:  d.uploadedAt,
      clientName:  d.user?.name ?? null,
      clientEmail: d.user?.email ?? null,
    }))

    // Flatten DocumentUploads from all requests
    const reqDocs: Doc[] = (requestData.requests ?? []).flatMap((r: {
      id: string; clientName: string; clientEmail: string;
      visaAppId: string | null; applicationId: string | null;
      uploads: Array<{
        id: string; docName: string; category: string; fileUrl: string;
        fileSize: number | null; mimeType: string | null; status: string; uploadedAt: string;
      }>;
    }) =>
      r.uploads.map(u => ({
        id:          u.id,
        source:      'request' as const,
        name:        u.docName,
        category:    u.category,
        fileUrl:     u.fileUrl,
        fileSize:    u.fileSize,
        mimeType:    u.mimeType,
        status:      u.status,
        uploadedAt:  u.uploadedAt,
        clientName:  r.clientName,
        clientEmail: r.clientEmail,
        visaAppId:   r.visaAppId,
        portalAppId: r.applicationId,
        requestId:   r.id,
      }))
    )

    // Merge, newest first
    const all = [...portalDocs, ...reqDocs].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )
    setDocs(all)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updatePortalDocStatus(id: string, status: string) {
    await fetch(`/api/admin/portal/documents/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    setDocs(prev => prev.map(d => d.id === id ? { ...d, status } : d))
  }

  async function updateUploadStatus(uploadId: string, requestId: string, status: string) {
    await fetch(`/api/admin/document-requests/${requestId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ uploadId, status }),
    })
    setDocs(prev => prev.map(d => d.id === uploadId ? { ...d, status } : d))
  }

  const filtered = docs.filter(d => {
    const statusNorm = d.status.toUpperCase()
    if (filter !== 'ALL' && statusNorm !== filter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return `${d.name} ${d.category} ${d.clientName ?? ''} ${d.clientEmail ?? ''}`.toLowerCase().includes(q)
  })

  const statusKeys = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">All Documents</h1>
          <p className="text-sm text-gray-400 mt-0.5">{docs.length} documents uploaded by clients</p>
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
            placeholder="Search by document name, category or client…"
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
                  {['Document', 'Category', 'Client', 'Source', 'Size', 'Status', 'Uploaded', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(doc => {
                  const sk = doc.status.toUpperCase() as keyof typeof STATUS_CONFIG
                  const s  = STATUS_CONFIG[sk] ?? STATUS_CONFIG.PENDING
                  const StatusIcon = s.icon
                  return (
                    <tr key={`${doc.source}-${doc.id}`} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 font-semibold text-[#0B1F3A] text-sm hover:text-[#C9A84C]">
                          <FolderOpen className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                          {doc.name}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{doc.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{doc.clientName ?? '—'}</p>
                        <p className="text-xs text-gray-400">{doc.clientEmail ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        {doc.source === 'request' && doc.visaAppId ? (
                          <Link href={`/admin/visa-applications/${doc.visaAppId}`}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                            <LinkIcon className="w-3 h-3" /> Visa app
                          </Link>
                        ) : doc.source === 'request' ? (
                          <span className="text-[11px] text-gray-400">Request link</span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Portal upload</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtSize(doc.fileSize)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${s.cls}`}>
                          <StatusIcon className="w-3 h-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {doc.status.toUpperCase() !== 'APPROVED' && (
                            <button
                              onClick={() => doc.source === 'portal'
                                ? updatePortalDocStatus(doc.id, 'APPROVED')
                                : updateUploadStatus(doc.id, doc.requestId!, 'approved')}
                              className="text-[11px] px-2 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-semibold transition-colors">
                              Approve
                            </button>
                          )}
                          {doc.status.toUpperCase() !== 'REJECTED' && (
                            <button
                              onClick={() => doc.source === 'portal'
                                ? updatePortalDocStatus(doc.id, 'REJECTED')
                                : updateUploadStatus(doc.id, doc.requestId!, 'rejected')}
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
