'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Upload, FileText, Loader2, CheckCircle, AlertCircle, X,
  File, Image, FileCheck, ExternalLink,
} from 'lucide-react'

interface Document {
  id: string
  name: string
  category: string
  fileUrl: string
  mimeType: string | null
  fileSize: number | null
  status: string
  uploadedAt: string
  application: { title: string; refNumber: string }
}

interface Application {
  id: string
  title: string
  refNumber: string
}

const CATEGORIES = [
  'Passport', 'Bank Statement', 'Employment Letter', 'Payslip',
  'Invitation Letter', 'Accommodation Proof', 'Travel Itinerary',
  'Photo', 'Visa Application Form', 'Insurance', 'Other',
]

const STATUS_COLOR: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.heic'
const MAX_MB   = 10

function fileIcon(mime: string | null) {
  if (!mime) return <File className="w-4 h-4 text-[#C9A84C]" />
  if (mime.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />
  if (mime.includes('pdf'))     return <FileText className="w-4 h-4 text-red-500" />
  return <FileCheck className="w-4 h-4 text-[#C9A84C]" />
}

export default function PortalDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [applications, setApps]   = useState<Application[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [success, setSuccess]     = useState('')
  const [error, setError]         = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const fileRef                   = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    applicationId: '',
    name:          '',
    category:      'Passport',
    file:          null as File | null,
  })

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/portal/documents').then(r => r.json()),
      fetch('/api/portal/applications').then(r => r.json()),
    ]).then(([docs, apps]) => {
      setDocuments(docs.documents ?? [])
      const appList = apps.applications ?? []
      setApps(appList)
      if (appList.length) setForm(f => ({ ...f, applicationId: appList[0].id }))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleFilePick(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB.`)
      return
    }
    setError('')
    const guessedName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
    setForm(f => ({ ...f, file, name: f.name || guessedName }))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFilePick(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.applicationId || !form.name || !form.file) {
      setError('Please select an application, enter a document name, and choose a file.')
      return
    }
    setUploading(true)
    setError('')
    setProgress(10)

    const data = new FormData()
    data.append('file',          form.file)
    data.append('applicationId', form.applicationId)
    data.append('name',          form.name)
    data.append('category',      form.category)

    // Fake progress while uploading
    const ticker = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 300)

    const res = await fetch('/api/portal/upload', { method: 'POST', body: data })
    clearInterval(ticker)
    setProgress(100)

    const json = await res.json() as { document?: Document; error?: string }
    setUploading(false)
    setTimeout(() => setProgress(0), 600)

    if (!res.ok) {
      setError(json.error ?? 'Upload failed. Please try again.')
      return
    }

    // Prepend to list
    const newDoc: Document = {
      ...json.document!,
      application: applications.find(a => a.id === form.applicationId) ?? { title: '', refNumber: '' },
    }
    setDocuments(prev => [newDoc, ...prev])
    setSuccess('Document uploaded! Our team has been notified and will review it shortly.')
    setForm(f => ({ ...f, name: '', file: null }))
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setSuccess(''), 6000)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#0B1F3A]">Documents</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload supporting documents for your applications</p>
      </div>

      <div className="px-4 lg:px-8 py-6 max-w-3xl space-y-6">

        {/* Alerts */}
        {success && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl text-sm text-green-800">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Upload form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 lg:p-6">
          <h2 className="font-semibold text-[#0B1F3A] text-base mb-5">Upload a Document</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Application selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Application</label>
              <select
                value={form.applicationId}
                onChange={e => setForm(f => ({ ...f, applicationId: e.target.value }))}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
              >
                <option value="">Select application…</option>
                {applications.map(a => (
                  <option key={a.id} value={a.id}>{a.title} ({a.refNumber})</option>
                ))}
              </select>
            </div>

            {/* Name + Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Drop zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">File</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all p-6 text-center ${
                  dragOver
                    ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                    : form.file
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-200 hover:border-[#C9A84C]/60 hover:bg-gray-50'
                }`}
              >
                {form.file ? (
                  <div className="flex items-center justify-center gap-3">
                    {fileIcon(form.file.type)}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-[#0B1F3A] truncate max-w-[200px]">{form.file.name}</p>
                      <p className="text-xs text-gray-400">{(form.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, file: null })); if (fileRef.current) fileRef.current.value = '' }}
                      className="ml-auto p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Drop file here or <span className="text-[#C9A84C]">browse</span></p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, Word — max {MAX_MB} MB</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFilePick(e.target.files[0]) }}
                />
              </div>
            </div>

            {/* Progress bar */}
            {progress > 0 && (
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#C9A84C] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || !form.file}
              className="w-full py-3 bg-[#0B1F3A] text-white font-semibold rounded-xl hover:bg-[#0d2040] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : <><Upload className="w-4 h-4" /> Upload Document</>}
            </button>
          </form>
        </div>

        {/* Document list */}
        <div>
          <h2 className="font-semibold text-[#0B1F3A] mb-3">
            Uploaded Documents <span className="text-gray-400 font-normal">({documents.length})</span>
          </h2>
          {documents.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                        {fileIcon(doc.mimeType)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0B1F3A] text-sm truncate">{doc.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {doc.category} · {doc.application?.title} · {format(new Date(doc.uploadedAt), 'd MMM yyyy')}
                          {doc.fileSize && ` · ${(doc.fileSize / 1024).toFixed(0)} KB`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[doc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {doc.status}
                      </span>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-[#C9A84C] transition-colors"
                        title="View file"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
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
