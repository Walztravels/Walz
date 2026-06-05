'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react'

interface Document {
  id: string
  name: string
  category: string
  fileUrl: string
  status: string
  uploadedAt: string
  application: { title: string; refNumber: string }
}

interface Application {
  id: string
  title: string
  refNumber: string
}

const CATEGORIES = ['Passport', 'Bank Statement', 'Employment Letter', 'Invitation Letter', 'Accommodation', 'Travel Itinerary', 'Photo', 'Other']

export default function PortalDocumentsPage() {
  const [documents, setDocuments]     = useState<Document[]>([])
  const [applications, setApps]       = useState<Application[]>([])
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [success, setSuccess]         = useState('')
  const [error, setError]             = useState('')
  const fileRef                       = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    applicationId: '',
    name:          '',
    category:      'Passport',
    fileUrl:       '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/documents').then(r => r.json()),
      fetch('/api/portal/applications').then(r => r.json()),
    ]).then(([docs, apps]) => {
      setDocuments(docs.documents ?? [])
      setApps(apps.applications ?? [])
      if (apps.applications?.length) setForm(f => ({ ...f, applicationId: apps.applications[0].id }))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // For MVP: accept a publicly accessible URL (Google Drive, Dropbox, etc.)
  // or use Supabase Storage if configured
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.applicationId || !form.name || !form.fileUrl) {
      setError('Please fill in all required fields and provide a file URL.')
      return
    }
    setUploading(true)
    setError('')

    const res = await fetch('/api/portal/documents', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    const data = await res.json() as { document?: Document; error?: string }

    if (!res.ok) {
      setError(data.error ?? 'Upload failed. Please try again.')
      setUploading(false)
      return
    }

    setDocuments(prev => [{ ...data.document!, application: applications.find(a => a.id === form.applicationId)! } as Document, ...prev])
    setSuccess('Document submitted successfully. Our team has been notified.')
    setForm(f => ({ ...f, name: '', fileUrl: '' }))
    setUploading(false)
    setTimeout(() => setSuccess(''), 5000)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#0B1F3A]">Documents</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload and manage your application documents</p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-3xl space-y-6">
        {/* Upload form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-[#0B1F3A] mb-4">Submit a Document</h2>

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl mb-4 text-sm text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />{success}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Application</label>
              <select
                value={form.applicationId}
                onChange={e => setForm(f => ({ ...f, applicationId: e.target.value }))}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
              >
                <option value="">Select application…</option>
                {applications.map(a => (
                  <option key={a.id} value={a.id}>{a.title} ({a.refNumber})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="e.g. Passport copy"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                File URL <span className="text-gray-400 font-normal">(Google Drive, Dropbox, or direct link)</span>
              </label>
              <input
                type="url"
                value={form.fileUrl}
                onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))}
                required
                placeholder="https://drive.google.com/file/..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]"
              />
              <p className="text-xs text-gray-400 mt-1">Share a publicly accessible link to your document. Make sure anyone with the link can view it.</p>
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="w-full py-3 bg-[#0B1F3A] text-white font-semibold rounded-xl hover:bg-[#0d2040] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : <><Upload className="w-4 h-4" />Submit Document</>}
            </button>
          </form>
          <input type="file" ref={fileRef} className="hidden" />
        </div>

        {/* Document list */}
        <div>
          <h2 className="font-semibold text-[#0B1F3A] mb-3">Submitted Documents</h2>
          {documents.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No documents submitted yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-[#C9A84C]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[#0B1F3A] text-sm truncate">{doc.name}</p>
                      <p className="text-xs text-gray-400">{doc.category} · {doc.application?.title} · {format(new Date(doc.uploadedAt), 'd MMM yyyy')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doc.status === 'APPROVED' ? 'bg-green-100 text-green-700' : doc.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {doc.status}
                    </span>
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A84C] hover:underline">View</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
